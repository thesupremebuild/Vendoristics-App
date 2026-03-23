import React, { useState, useEffect } from 'react';
import { useAuth } from '../AuthContext';
import { useNavigation } from '../NavigationContext';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { collection, query, onSnapshot, orderBy, limit, where } from 'firebase/firestore';
import { 
  TrendingUp, 
  TrendingDown, 
  Wallet, 
  Clock, 
  AlertCircle,
  Calendar,
  BarChart3,
  CheckSquare,
  ArrowUpRight,
  ArrowDownRight,
  ChevronRight
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Cell
} from 'recharts';
import { format } from 'date-fns';

const Dashboard: React.FC = () => {
  const { businessId } = useAuth();
  const { setActiveTab, setAccountingFilters } = useNavigation();
  const [stats, setStats] = useState({
    balance: 0,
    cashInHand: 0,
    credit: 0,
    debit: 0,
    pendingDues: 0,
    pendingPayments: 0
  });
  const [todayTasks, setTodayTasks] = useState<any[]>([]);
  const [chartData, setChartData] = useState<any[]>([]);

  const navigateToAccounting = (filters: any) => {
    setAccountingFilters(filters);
    setActiveTab('accounting');
  };

  useEffect(() => {
    if (!businessId) return;

    const transactionsRef = collection(db, 'businesses', businessId, 'transactions');
    const tasksRef = collection(db, 'businesses', businessId, 'tasks');

    const unsubscribeTransactions = onSnapshot(transactionsRef, (snapshot) => {
      let totalIncome = 0;
      let totalExpense = 0;
      let pendingDues = 0;
      let pendingPayments = 0;
      let cashIn = 0;
      let cashOut = 0;

      snapshot.docs.forEach(doc => {
        const data = doc.data();
        const amount = Number(data.amount || 0);
        const paidAmount = Number(data.paidAmount || 0);
        const balanceAmount = Number(data.balanceAmount || 0);
        const category = data.category || 'bill';
        
        if (category === 'bill' || category === 'opening_balance' || category === 'journal') {
          if (data.type === 'credit') {
            if (category === 'bill') totalIncome += amount;
            
            if (data.status === 'unpaid' || category === 'opening_balance' || category === 'journal') {
              pendingDues += amount;
            } else if (data.status === 'partial') {
              pendingDues += balanceAmount;
              cashIn += paidAmount;
            } else {
              cashIn += amount;
            }
          } else {
            if (category === 'bill') totalExpense += amount;
            
            if (data.status === 'unpaid' || category === 'opening_balance' || category === 'journal') {
              pendingPayments += amount;
            } else if (data.status === 'partial') {
              pendingPayments += balanceAmount;
              cashOut += paidAmount;
            } else {
              cashOut += amount;
            }
          }
        } else {
          // Payment
          if (data.type === 'credit') {
            cashIn += amount;
            pendingDues -= amount; // Deduct from money to receive
          } else {
            cashOut += amount;
            pendingPayments -= amount; // Deduct from money to pay
          }
        }
      });

      setStats({
        balance: totalIncome - totalExpense,
        cashInHand: cashIn - cashOut,
        credit: totalIncome,
        debit: totalExpense,
        pendingDues: Math.max(0, pendingDues),
        pendingPayments: Math.max(0, pendingPayments)
      });

      // Prepare chart data (last 7 days or similar)
      // For now, just a simple summary
      setChartData([
        { name: 'Income', value: totalIncome, color: '#10b981' },
        { name: 'Expense', value: totalExpense, color: '#ef4444' },
        { name: 'Dues', value: Math.max(0, pendingDues), color: '#f59e0b' },
        { name: 'Payments', value: Math.max(0, pendingPayments), color: '#6366f1' }
      ]);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'transactions'));

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const unsubscribeTasks = onSnapshot(
      query(tasksRef, where('status', '==', 'pending'), limit(5)), 
      (snapshot) => {
        setTodayTasks(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'tasks')
    );

    return () => {
      unsubscribeTransactions();
      unsubscribeTasks();
    };
  }, [businessId]);

  const StatCard = ({ title, value, icon: Icon, color, subtext, filter }: any) => (
    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 relative overflow-hidden group">
      <div className="absolute -right-4 -bottom-4 text-slate-100 opacity-20 group-hover:opacity-30 transition-opacity pointer-events-none">
        <Icon size={100} />
      </div>
      <div className="relative z-10">
        <div className="flex items-start justify-between mb-4">
          <div className={`p-3 rounded-xl ${color} bg-opacity-10`}>
            <Icon className={color.replace('bg-', 'text-')} size={24} />
          </div>
          {filter && (
            <button 
              onClick={() => navigateToAccounting(filter)}
              className="p-2 hover:bg-slate-50 rounded-lg text-slate-400 hover:text-emerald-500 transition-all"
              title="View Details"
            >
              <ChevronRight size={20} />
            </button>
          )}
        </div>
        <h3 className="text-slate-500 text-sm font-medium mb-1">{title}</h3>
        <p className="text-2xl font-bold text-slate-900">₹{value.toLocaleString()}</p>
        {subtext && (
          <div className="flex items-center gap-1 mt-2">
            {title.includes('Dues') ? <ArrowDownRight size={12} className="text-amber-500" /> : <ArrowUpRight size={12} className="text-indigo-500" />}
            <p className="text-xs text-slate-400">{subtext}</p>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-8">
      <header>
        <h2 className="text-2xl font-bold text-slate-900">Business Overview</h2>
        <p className="text-slate-500">Welcome back! Here's what's happening today.</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-6">
        <StatCard title="Cash in Hand" value={stats.cashInHand} icon={Wallet} color="bg-emerald-500" subtext="Actual money available" filter={{ category: 'all', type: 'all', status: 'paid' }} />
        <StatCard title="Total Balance" value={stats.balance} icon={BarChart3} color="bg-blue-500" subtext="Book balance" filter={{ category: 'all', type: 'all', status: 'all' }} />
        <StatCard title="Total Income" value={stats.credit} icon={TrendingUp} color="bg-emerald-500" filter={{ category: 'bill', type: 'credit', status: 'all' }} />
        <StatCard title="Total Expenses" value={stats.debit} icon={TrendingDown} color="bg-red-500" filter={{ category: 'bill', type: 'debit', status: 'all' }} />
        <StatCard title="Pending Dues" value={stats.pendingDues} icon={Clock} color="bg-amber-500" subtext="Money to receive" filter={{ category: 'bill', type: 'credit', status: 'unpaid' }} />
        <StatCard title="Pending Payments" value={stats.pendingPayments} icon={AlertCircle} color="bg-indigo-500" subtext="Money to pay" filter={{ category: 'bill', type: 'debit', status: 'unpaid' }} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Chart Section */}
        <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
              <BarChart3 size={20} />
            </div>
            <h3 className="text-lg font-bold text-slate-900">Financial Summary</h3>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                <Tooltip 
                  cursor={{ fill: '#f8fafc' }}
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                />
                <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Tasks Section */}
        <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-50 text-amber-600 rounded-lg">
                <CheckSquare size={20} />
              </div>
              <h3 className="text-lg font-bold text-slate-900">Recent Tasks</h3>
            </div>
            <button className="text-emerald-500 text-sm font-semibold hover:underline flex items-center gap-1">
              View All
              <ArrowUpRight size={14} />
            </button>
          </div>
          <div className="space-y-4">
            {todayTasks.length > 0 ? todayTasks.map(task => (
              <div key={task.id} className="flex items-center gap-4 p-4 rounded-xl bg-slate-50 hover:bg-slate-100 transition-colors group">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                  task.priority === 'high' ? 'bg-red-100 text-red-600' : 
                  task.priority === 'medium' ? 'bg-amber-100 text-amber-600' : 'bg-emerald-100 text-emerald-600'
                }`}>
                  <Clock size={18} />
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-slate-900">{task.title}</p>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="flex items-center gap-1 text-xs text-slate-500">
                      <Calendar size={12} />
                      {task.deadline ? format(new Date(task.deadline), 'MMM dd') : 'No deadline'}
                    </span>
                    <span className={`text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full ${
                      task.priority === 'high' ? 'bg-red-100 text-red-600' : 
                      task.priority === 'medium' ? 'bg-amber-100 text-amber-600' : 'bg-emerald-100 text-emerald-600'
                    }`}>
                      {task.priority}
                    </span>
                  </div>
                </div>
              </div>
            )) : (
              <div className="text-center py-10">
                <p className="text-slate-400 italic">No pending tasks for today.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
