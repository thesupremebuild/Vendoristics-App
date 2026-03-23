import React, { useState, useEffect } from 'react';
import { useAuth } from '../AuthContext';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { collection, onSnapshot, query, orderBy, where } from 'firebase/firestore';
import { 
  TrendingUp, 
  TrendingDown, 
  PieChart as PieChartIcon, 
  BarChart3, 
  Download,
  Calendar,
  ArrowUpRight,
  ArrowDownRight,
  Filter
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie,
  LineChart,
  Line,
  Legend
} from 'recharts';
import { format, startOfMonth, endOfMonth, subMonths, eachMonthOfInterval, isWithinInterval } from 'date-fns';
import { toast } from 'react-hot-toast';
import * as XLSX from 'xlsx';

const Reports: React.FC = () => {
  const { businessId } = useAuth();
  const [transactions, setTransactions] = useState<any[]>([]);
  const [parties, setParties] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState({
    start: format(startOfMonth(subMonths(new Date(), 5)), 'yyyy-MM-dd'),
    end: format(endOfMonth(new Date()), 'yyyy-MM-dd')
  });

  useEffect(() => {
    if (!businessId) return;

    const transactionsRef = collection(db, 'businesses', businessId, 'transactions');
    const partiesRef = collection(db, 'businesses', businessId, 'parties');

    const unsubscribeTransactions = onSnapshot(
      query(transactionsRef, orderBy('date', 'asc')),
      (snapshot) => {
        setTransactions(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        setLoading(false);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'transactions')
    );

    const unsubscribeParties = onSnapshot(partiesRef, (snapshot) => {
      setParties(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    return () => {
      unsubscribeTransactions();
      unsubscribeParties();
    };
  }, [businessId]);

  const filteredTransactions = transactions.filter(t => {
    const date = new Date(t.date);
    return isWithinInterval(date, {
      start: new Date(dateRange.start),
      end: new Date(dateRange.end)
    });
  });

  // Profit & Loss Data
  const calculatePL = () => {
    let income = 0;
    let expenses = 0;
    
    filteredTransactions.forEach(t => {
      if (t.category === 'bill') {
        if (t.type === 'credit') income += t.amount;
        else expenses += t.amount;
      }
    });

    return { income, expenses, profit: income - expenses };
  };

  const pl = calculatePL();

  // Monthly Trend Data
  const getMonthlyTrend = () => {
    const months = eachMonthOfInterval({
      start: new Date(dateRange.start),
      end: new Date(dateRange.end)
    });

    return months.map(month => {
      const monthStr = format(month, 'MMM yyyy');
      let income = 0;
      let expenses = 0;

      filteredTransactions.forEach(t => {
        const tDate = new Date(t.date);
        if (format(tDate, 'MMM yyyy') === monthStr && t.category === 'bill') {
          if (t.type === 'credit') income += t.amount;
          else expenses += t.amount;
        }
      });

      return {
        name: monthStr,
        income,
        expenses,
        profit: income - expenses
      };
    });
  };

  const monthlyTrend = getMonthlyTrend();

  // Party Wise Distribution
  const getPartyDistribution = () => {
    const partyTotals: Record<string, number> = {};
    
    filteredTransactions.forEach(t => {
      if (t.category === 'bill') {
        partyTotals[t.partyName] = (partyTotals[t.partyName] || 0) + t.amount;
      }
    });

    return Object.entries(partyTotals)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);
  };

  const partyDist = getPartyDistribution();

  const COLORS = ['#10b981', '#6366f1', '#f59e0b', '#ef4444', '#8b5cf6'];

  const exportReport = () => {
    const data = [
      ['Financial Report', '', ''],
      ['Period', `${dateRange.start} to ${dateRange.end}`, ''],
      ['', '', ''],
      ['Summary', '', ''],
      ['Total Income', pl.income, ''],
      ['Total Expenses', pl.expenses, ''],
      ['Net Profit', pl.profit, ''],
      ['', '', ''],
      ['Monthly Breakdown', '', ''],
      ['Month', 'Income', 'Expenses', 'Profit'],
      ...monthlyTrend.map(m => [m.name, m.income, m.expenses, m.profit])
    ];

    const worksheet = XLSX.utils.aoa_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Financial Report");
    XLSX.writeFile(workbook, `Financial_Report_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
    toast.success('Report exported successfully');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Financial Reports</h2>
          <p className="text-slate-500">Analyze your business performance and trends.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-white border border-slate-200 p-2 rounded-xl shadow-sm">
            <Calendar size={18} className="text-slate-400 ml-2" />
            <input 
              type="date" 
              value={dateRange.start}
              onChange={(e) => setDateRange({...dateRange, start: e.target.value})}
              className="text-sm border-none focus:ring-0 p-1"
            />
            <span className="text-slate-300">|</span>
            <input 
              type="date" 
              value={dateRange.end}
              onChange={(e) => setDateRange({...dateRange, end: e.target.value})}
              className="text-sm border-none focus:ring-0 p-1"
            />
          </div>
          <button 
            onClick={exportReport}
            className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white px-6 py-3 rounded-xl font-semibold transition-all shadow-lg shadow-emerald-500/20"
          >
            <Download size={20} />
            Export
          </button>
        </div>
      </header>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
              <TrendingUp size={24} />
            </div>
            <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full flex items-center gap-1">
              <ArrowUpRight size={12} />
              Income
            </span>
          </div>
          <h3 className="text-slate-500 text-sm font-medium mb-1">Total Income</h3>
          <p className="text-2xl font-bold text-slate-900">₹{pl.income.toLocaleString()}</p>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 bg-red-50 text-red-600 rounded-xl">
              <TrendingDown size={24} />
            </div>
            <span className="text-xs font-bold text-red-600 bg-red-50 px-2 py-1 rounded-full flex items-center gap-1">
              <ArrowDownRight size={12} />
              Expense
            </span>
          </div>
          <h3 className="text-slate-500 text-sm font-medium mb-1">Total Expenses</h3>
          <p className="text-2xl font-bold text-slate-900">₹{pl.expenses.toLocaleString()}</p>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
          <div className="flex items-center justify-between mb-4">
            <div className={`p-3 rounded-xl ${pl.profit >= 0 ? 'bg-blue-50 text-blue-600' : 'bg-amber-50 text-amber-600'}`}>
              <BarChart3 size={24} />
            </div>
            <span className={`text-xs font-bold px-2 py-1 rounded-full ${pl.profit >= 0 ? 'bg-blue-50 text-blue-600' : 'bg-amber-50 text-amber-600'}`}>
              Net Profit
            </span>
          </div>
          <h3 className="text-slate-500 text-sm font-medium mb-1">Net Profit</h3>
          <p className={`text-2xl font-bold ${pl.profit >= 0 ? 'text-slate-900' : 'text-red-600'}`}>
            ₹{pl.profit.toLocaleString()}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Monthly Trend Chart */}
        <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100">
          <div className="flex items-center gap-3 mb-8">
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
              <TrendingUp size={20} />
            </div>
            <h3 className="text-lg font-bold text-slate-900">Monthly Performance</h3>
          </div>
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={monthlyTrend}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                <Tooltip 
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                />
                <Legend verticalAlign="top" align="right" iconType="circle" />
                <Line type="monotone" dataKey="income" stroke="#10b981" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} name="Income" />
                <Line type="monotone" dataKey="expenses" stroke="#ef4444" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} name="Expenses" />
                <Line type="monotone" dataKey="profit" stroke="#6366f1" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} name="Profit" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Party Distribution */}
        <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100">
          <div className="flex items-center gap-3 mb-8">
            <div className="p-2 bg-amber-50 text-amber-600 rounded-lg">
              <PieChartIcon size={20} />
            </div>
            <h3 className="text-lg font-bold text-slate-900">Top Parties (by Volume)</h3>
          </div>
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={partyDist}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {partyDist.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                />
                <Legend verticalAlign="bottom" align="center" iconType="circle" />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Detailed Breakdown Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-6 border-b border-slate-100">
          <h3 className="text-lg font-bold text-slate-900">Monthly Breakdown</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50 border-bottom border-slate-100">
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Month</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Income</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Expenses</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Net Profit</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Margin</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {[...monthlyTrend].reverse().map((m, idx) => (
                <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-6 py-4 text-sm font-semibold text-slate-900">{m.name}</td>
                  <td className="px-6 py-4 text-sm text-right text-emerald-600 font-medium">₹{m.income.toLocaleString()}</td>
                  <td className="px-6 py-4 text-sm text-right text-red-600 font-medium">₹{m.expenses.toLocaleString()}</td>
                  <td className={`px-6 py-4 text-sm text-right font-bold ${m.profit >= 0 ? 'text-slate-900' : 'text-red-600'}`}>
                    ₹{m.profit.toLocaleString()}
                  </td>
                  <td className="px-6 py-4 text-sm text-right">
                    <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                      m.profit >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'
                    }`}>
                      {m.income > 0 ? ((m.profit / m.income) * 100).toFixed(1) : '0.0'}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Reports;
