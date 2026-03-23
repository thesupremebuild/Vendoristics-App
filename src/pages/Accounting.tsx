import React, { useState, useEffect } from 'react';
import { useAuth } from '../AuthContext';
import { useNavigation } from '../NavigationContext';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { collection, addDoc, onSnapshot, query, orderBy, Timestamp, doc, updateDoc, getDoc, increment, deleteDoc } from 'firebase/firestore';
import { 
  Plus, 
  Search, 
  Filter, 
  ArrowUpRight, 
  ArrowDownLeft, 
  MoreVertical,
  Edit2,
  Download,
  FileText,
  Trash2,
  CheckCircle2
} from 'lucide-react';
import { motion } from 'framer-motion';
import { format } from 'date-fns';
import { toast } from 'react-hot-toast';
import * as XLSX from 'xlsx';

const Accounting: React.FC = () => {
  const { businessId } = useAuth();
  const { setActiveTab, accountingFilters, setAccountingFilters } = useNavigation();
  const [transactions, setTransactions] = useState<any[]>([]);
  const [parties, setParties] = useState<any[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [transactionToDelete, setTransactionToDelete] = useState<any>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState({
    category: 'all',
    type: 'all',
    status: 'all',
    startDate: '',
    endDate: ''
  });

  useEffect(() => {
    if (accountingFilters) {
      setFilters(prev => ({ ...prev, ...accountingFilters }));
      setShowFilters(true);
      // Clear filters from context after applying
      setAccountingFilters(null);
    }
  }, [accountingFilters, setAccountingFilters]);

  // Form state
  const [formData, setFormData] = useState({
    amount: '',
    paidAmount: '',
    type: 'credit',
    category: 'bill',
    partyId: '',
    description: '',
    status: 'paid',
    date: format(new Date(), "yyyy-MM-dd'T'HH:mm")
  });

  useEffect(() => {
    if (!businessId) return;

    const transactionsRef = collection(db, 'businesses', businessId, 'transactions');
    const partiesRef = collection(db, 'businesses', businessId, 'parties');

    const unsubscribeTransactions = onSnapshot(
      query(transactionsRef, orderBy('date', 'desc')),
      (snapshot) => {
        setTransactions(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
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

  const deleteTransaction = async (transaction: any) => {
    if (!businessId) return;
    setLoading(true);
    try {
      // Reverse party balance
      const partyRef = doc(db, 'businesses', businessId, 'parties', transaction.partyId);
      let delta = 0;
      const amount = Number(transaction.amount || 0);
      const paidAmount = Number(transaction.paidAmount || 0);
      const category = transaction.category || 'bill';

      if (category === 'bill' || category === 'opening_balance') {
        if (transaction.status === 'unpaid' || category === 'opening_balance') {
          delta = transaction.type === 'credit' ? -amount : amount;
        } else if (transaction.status === 'partial') {
          const balance = amount - paidAmount;
          delta = transaction.type === 'credit' ? -balance : balance;
        }
      } else {
        // Payment or Journal
        delta = transaction.type === 'credit' ? amount : -amount;
      }

      if (delta !== 0) {
        await updateDoc(partyRef, { totalDue: increment(delta) });
      }
      
      await deleteDoc(doc(db, 'businesses', businessId, 'transactions', transaction.id));
      toast.success('Transaction deleted');
      setTransactionToDelete(null);
    } catch (error) {
      toast.error('Failed to delete transaction');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const markAsPaid = async (transaction: any) => {
    if (!businessId) return;
    setLoading(true);
    try {
      const amount = Number(transaction.amount || 0);
      const paidAmount = Number(transaction.paidAmount || 0);
      const balanceAmount = amount - paidAmount;
      const category = transaction.category || 'bill';

      // Update transaction status
      const transactionRef = doc(db, 'businesses', businessId, 'transactions', transaction.id);
      await updateDoc(transactionRef, {
        status: 'paid',
        paidAmount: amount,
        balanceAmount: 0,
        updatedAt: Timestamp.now()
      });

      // Update party balance (reduce totalDue by the remaining balance)
      if (category === 'bill') {
        const partyRef = doc(db, 'businesses', businessId, 'parties', transaction.partyId);
        let delta = 0;
        delta = transaction.type === 'credit' ? -balanceAmount : balanceAmount;
        
        if (delta !== 0) {
          await updateDoc(partyRef, { totalDue: increment(delta) });
        }
      }

      toast.success('Transaction marked as paid');
    } catch (error) {
      toast.error('Failed to update transaction');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const openEditModal = (transaction: any) => {
    setEditingTransaction(transaction);
    setFormData({
      amount: transaction.amount.toString(),
      paidAmount: (transaction.paidAmount || 0).toString(),
      type: transaction.type,
      category: transaction.category || 'bill',
      partyId: transaction.partyId,
      description: transaction.description || '',
      status: transaction.status,
      date: transaction.date
    });
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingTransaction(null);
    setFormData({
      amount: '',
      paidAmount: '',
      type: 'credit',
      category: 'bill',
      partyId: '',
      description: '',
      status: 'paid',
      date: format(new Date(), "yyyy-MM-dd'T'HH:mm")
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!businessId) return;
    setLoading(true);

    try {
      const party = parties.find(p => p.id === formData.partyId);
      const amount = parseFloat(formData.amount);
      const paidAmount = formData.status === 'partial' ? parseFloat(formData.paidAmount || '0') : (formData.status === 'paid' ? amount : 0);
      const balanceAmount = amount - paidAmount;

      const transactionData = {
        ...formData,
        amount,
        paidAmount,
        balanceAmount,
        partyName: party?.name || 'Unknown',
        businessId,
        updatedAt: Timestamp.now()
      };

      if (editingTransaction) {
        // Handle party balance reconciliation
        const oldAmount = Number(editingTransaction.amount || 0);
        const oldPaidAmount = Number(editingTransaction.paidAmount || 0);
        const oldType = editingTransaction.type;
        const oldStatus = editingTransaction.status;
        const oldPartyId = editingTransaction.partyId;
        const oldCategory = editingTransaction.category || 'bill';

        const newAmount = amount;
        const newPaidAmount = paidAmount;
        const newType = formData.type;
        const newStatus = formData.status;
        const newPartyId = formData.partyId;
        const newCategory = formData.category;

        // 1. Reverse old party effect
        const oldPartyRef = doc(db, 'businesses', businessId, 'parties', oldPartyId);
        let oldDelta = 0;
        if (oldCategory === 'bill' || oldCategory === 'opening_balance') {
          if (oldStatus === 'unpaid' || oldCategory === 'opening_balance') {
            oldDelta = oldType === 'credit' ? -oldAmount : oldAmount;
          } else if (oldStatus === 'partial') {
            const oldBalance = oldAmount - oldPaidAmount;
            oldDelta = oldType === 'credit' ? -oldBalance : oldBalance;
          }
        } else {
          oldDelta = oldType === 'credit' ? oldAmount : -oldAmount;
        }
        if (oldDelta !== 0) await updateDoc(oldPartyRef, { totalDue: increment(oldDelta) });

        // 2. Apply new party effect
        const newPartyRef = doc(db, 'businesses', businessId, 'parties', newPartyId);
        let newDelta = 0;
        if (newCategory === 'bill' || newCategory === 'opening_balance') {
          if (newStatus === 'unpaid' || newCategory === 'opening_balance') {
            newDelta = newType === 'credit' ? newAmount : -newAmount;
          } else if (newStatus === 'partial') {
            const newBalance = newAmount - newPaidAmount;
            newDelta = newType === 'credit' ? newBalance : -newBalance;
          }
        } else {
          newDelta = newType === 'credit' ? -newAmount : newAmount;
        }
        if (newDelta !== 0) await updateDoc(newPartyRef, { totalDue: increment(newDelta) });

        await updateDoc(doc(db, 'businesses', businessId, 'transactions', editingTransaction.id), transactionData);
        toast.success('Transaction updated successfully');
      } else {
        const docRef = await addDoc(collection(db, 'businesses', businessId, 'transactions'), {
          ...transactionData,
          createdAt: Timestamp.now()
        });

        // Update party total due
        const partyRef = doc(db, 'businesses', businessId, 'parties', formData.partyId);
        let delta = 0;
        if (formData.category === 'bill' || formData.category === 'opening_balance') {
          if (formData.status === 'unpaid' || formData.category === 'opening_balance') {
            delta = formData.type === 'credit' ? amount : -amount;
          } else if (formData.status === 'partial') {
            delta = formData.type === 'credit' ? balanceAmount : -balanceAmount;
          }
        } else {
          // Payment or Journal
          delta = formData.type === 'credit' ? -amount : amount;
        }

        if (delta !== 0) {
          await updateDoc(partyRef, { totalDue: increment(delta) });
        }
        toast.success('Transaction added successfully');
      }

      closeModal();
    } catch (error) {
      toast.error(editingTransaction ? 'Failed to update transaction' : 'Failed to add transaction');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const filteredTransactions = transactions.filter(t => {
    const matchesSearch = t.partyName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.description?.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesCategory = filters.category === 'all' || t.category === filters.category;
    const matchesType = filters.type === 'all' || t.type === filters.type;
    const matchesStatus = filters.status === 'all' || t.status === filters.status;
    
    let matchesDate = true;
    if (filters.startDate) {
      matchesDate = matchesDate && new Date(t.date) >= new Date(filters.startDate);
    }
    if (filters.endDate) {
      const end = new Date(filters.endDate);
      end.setHours(23, 59, 59, 999);
      matchesDate = matchesDate && new Date(t.date) <= end;
    }

    return matchesSearch && matchesCategory && matchesType && matchesStatus && matchesDate;
  });

  const downloadExcel = () => {
    if (transactions.length === 0) {
      toast.error('No transactions to download');
      return;
    }

    const data = transactions.map(t => ({
      Date: format(new Date(t.date), 'yyyy-MM-dd HH:mm'),
      Party: t.partyName,
      Type: t.type === 'credit' ? 'Income' : 'Expense',
      Amount: t.amount,
      Status: t.status,
      Description: t.description || ''
    }));

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Transactions");
    
    // Generate filename with current date
    const fileName = `Transactions_${format(new Date(), 'yyyy-MM-dd')}.xlsx`;
    XLSX.writeFile(workbook, fileName);
    toast.success('Excel file downloaded successfully');
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Accounting</h2>
          <p className="text-slate-500">Manage your income and expenses.</p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={downloadExcel}
            className="flex items-center justify-center gap-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 px-6 py-3 rounded-xl font-semibold transition-all shadow-sm"
          >
            <Download size={20} />
            Export Excel
          </button>
          <button 
            onClick={() => setShowModal(true)}
            className="flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white px-6 py-3 rounded-xl font-semibold transition-all shadow-lg shadow-emerald-500/20"
          >
            <Plus size={20} />
            Add Transaction
          </button>
        </div>
      </header>

      {/* Filters & Search */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input 
              type="text" 
              placeholder="Search transactions..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-12 pr-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
            />
          </div>
          <button 
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-2 px-6 py-3 border rounded-xl transition-colors ${
              showFilters ? 'bg-emerald-50 border-emerald-500 text-emerald-600' : 'border-slate-200 hover:bg-slate-50 text-slate-700'
            }`}
          >
            <Filter size={18} />
            <span>Filters</span>
          </button>
        </div>

        {showFilters && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4"
          >
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Category</label>
              <select 
                value={filters.category}
                onChange={(e) => setFilters({...filters, category: e.target.value})}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:ring-2 focus:ring-emerald-500/20"
              >
                <option value="all">All Categories</option>
                <option value="bill">Bills</option>
                <option value="payment">Payments</option>
                <option value="journal">Journal</option>
                <option value="opening_balance">Opening Balance</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Type</label>
              <select 
                value={filters.type}
                onChange={(e) => setFilters({...filters, type: e.target.value})}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:ring-2 focus:ring-emerald-500/20"
              >
                <option value="all">All Types</option>
                <option value="credit">Credit (In)</option>
                <option value="debit">Debit (Out)</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Status</label>
              <select 
                value={filters.status}
                onChange={(e) => setFilters({...filters, status: e.target.value})}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:ring-2 focus:ring-emerald-500/20"
              >
                <option value="all">All Status</option>
                <option value="paid">Paid</option>
                <option value="unpaid">Unpaid</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">From Date</label>
              <input 
                type="date"
                value={filters.startDate}
                onChange={(e) => setFilters({...filters, startDate: e.target.value})}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:ring-2 focus:ring-emerald-500/20"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">To Date</label>
              <input 
                type="date"
                value={filters.endDate}
                onChange={(e) => setFilters({...filters, endDate: e.target.value})}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:ring-2 focus:ring-emerald-500/20"
              />
            </div>
            <div className="lg:col-span-5 flex justify-end">
              <button 
                onClick={() => setFilters({
                  category: 'all',
                  type: 'all',
                  status: 'all',
                  startDate: '',
                  endDate: ''
                })}
                className="text-sm font-semibold text-emerald-600 hover:text-emerald-700"
              >
                Reset Filters
              </button>
            </div>
          </motion.div>
        )}
      </div>

      {/* Transactions Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50 border-bottom border-slate-100">
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Date</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Party</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Category</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Description</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Debit (Out)</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Credit (In)</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredTransactions.map((t) => (
                <tr key={t.id} className="hover:bg-slate-50/50 transition-colors group">
                  <td className="px-6 py-4 text-sm text-slate-600">
                    {format(new Date(t.date), 'MMM dd, yyyy')}
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-sm font-semibold text-slate-900">{t.partyName}</p>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`text-[10px] uppercase tracking-wider font-bold px-2 py-1 rounded-full ${
                      t.category === 'payment' ? 'bg-indigo-100 text-indigo-600' : 
                      t.category === 'journal' ? 'bg-amber-100 text-amber-600' :
                      t.category === 'opening_balance' ? 'bg-blue-100 text-blue-600' :
                      'bg-slate-100 text-slate-600'
                    }`}>
                      {t.category || 'bill'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-500 max-w-xs truncate">
                    {t.description}
                  </td>
                  <td className="px-6 py-4 text-right">
                    {t.type === 'debit' ? (
                      <span className="text-sm font-bold text-red-600">
                        ₹{t.amount.toLocaleString()}
                      </span>
                    ) : (
                      <span className="text-slate-300">-</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right">
                    {t.type === 'credit' ? (
                      <span className="text-sm font-bold text-emerald-600">
                        ₹{t.amount.toLocaleString()}
                      </span>
                    ) : (
                      <span className="text-slate-300">-</span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`text-[10px] uppercase tracking-wider font-bold px-2 py-1 rounded-full ${
                      t.category === 'payment' ? 'bg-indigo-100 text-indigo-600' : 
                      t.status === 'paid' ? 'bg-emerald-100 text-emerald-600' : 
                      t.status === 'partial' ? 'bg-blue-100 text-blue-600' : 'bg-amber-100 text-amber-600'
                    }`}>
                      {t.category === 'payment' ? 'Payment' : t.status}
                    </span>
                    {t.status === 'partial' && (
                      <p className="text-[10px] text-slate-400 mt-1">Bal: ₹{t.balanceAmount?.toLocaleString()}</p>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right space-x-2">
                    {t.category === 'bill' && t.status !== 'paid' && (
                      <button 
                        onClick={() => markAsPaid(t)}
                        className="text-slate-400 hover:text-emerald-500 transition-colors opacity-0 group-hover:opacity-100"
                        title="Mark as Paid"
                      >
                        <CheckCircle2 size={18} />
                      </button>
                    )}
                    <button 
                      onClick={() => {
                        setActiveTab('invoices');
                      }}
                      className="text-slate-400 hover:text-emerald-500 transition-colors opacity-0 group-hover:opacity-100"
                      title="Generate Invoice"
                    >
                      <FileText size={18} />
                    </button>
                    <button 
                      onClick={() => openEditModal(t)}
                      className="text-slate-400 hover:text-emerald-500 transition-colors opacity-0 group-hover:opacity-100"
                      title="Edit"
                    >
                      <Edit2 size={18} />
                    </button>
                    <button 
                      onClick={() => setTransactionToDelete(t)}
                      className="text-slate-400 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                      title="Delete"
                    >
                      <Trash2 size={18} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add/Edit Transaction Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl"
          >
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-xl font-bold text-slate-900">{editingTransaction ? 'Edit Transaction' : 'Add Transaction'}</h3>
              <button onClick={closeModal} className="text-slate-400 hover:text-slate-600">
                <Plus size={24} className="rotate-45" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Category</label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setFormData({...formData, category: 'bill'})}
                    className={`py-2 px-4 rounded-xl border text-xs font-semibold transition-all ${
                      formData.category === 'bill' 
                        ? 'bg-emerald-50 border-emerald-500 text-emerald-600' 
                        : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                    }`}
                  >
                    Bill
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormData({...formData, category: 'payment'})}
                    className={`py-2 px-4 rounded-xl border text-xs font-semibold transition-all ${
                      formData.category === 'payment' 
                        ? 'bg-indigo-50 border-indigo-500 text-indigo-600' 
                        : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                    }`}
                  >
                    Payment
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormData({...formData, category: 'journal'})}
                    className={`py-2 px-4 rounded-xl border text-xs font-semibold transition-all ${
                      formData.category === 'journal' 
                        ? 'bg-amber-50 border-amber-500 text-amber-600' 
                        : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                    }`}
                  >
                    Journal
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Type</label>
                  <select 
                    value={formData.type}
                    onChange={(e) => setFormData({...formData, type: e.target.value})}
                    className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  >
                    <option value="credit">{formData.category === 'bill' ? 'Credit (Income)' : 'Credit (Money In)'}</option>
                    <option value="debit">{formData.category === 'bill' ? 'Debit (Expense)' : 'Debit (Money Out)'}</option>
                  </select>
                </div>
                {formData.category === 'bill' && (
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">Status</label>
                    <select 
                      value={formData.status}
                      onChange={(e) => setFormData({...formData, status: e.target.value})}
                      className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                    >
                      <option value="paid">Paid</option>
                      <option value="partial">Partial</option>
                      <option value="unpaid">Unpaid (Due)</option>
                    </select>
                  </div>
                )}
              </div>

              {formData.category === 'bill' && formData.status === 'partial' && (
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Paid Amount</label>
                  <input 
                    required
                    type="number" 
                    value={formData.paidAmount}
                    onChange={(e) => setFormData({...formData, paidAmount: e.target.value})}
                    placeholder="0.00"
                    className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  />
                  <p className="text-xs text-slate-500">
                    Balance: ₹{(parseFloat(formData.amount || '0') - parseFloat(formData.paidAmount || '0')).toLocaleString()}
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Party</label>
                <select 
                  required
                  value={formData.partyId}
                  onChange={(e) => setFormData({...formData, partyId: e.target.value})}
                  className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                >
                  <option value="">Select Party</option>
                  {parties.map(p => (
                    <option key={p.id} value={p.id}>{p.name} ({p.type})</option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Amount</label>
                <input 
                  required
                  type="number" 
                  value={formData.amount}
                  onChange={(e) => setFormData({...formData, amount: e.target.value})}
                  placeholder="0.00"
                  className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Date & Time</label>
                <input 
                  required
                  type="datetime-local" 
                  value={formData.date}
                  onChange={(e) => setFormData({...formData, date: e.target.value})}
                  className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Description</label>
                <textarea 
                  value={formData.description}
                  onChange={(e) => setFormData({...formData, description: e.target.value})}
                  rows={3}
                  className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  placeholder="Enter transaction details..."
                />
              </div>

              <button 
                disabled={loading}
                type="submit"
                className="w-full bg-emerald-500 hover:bg-emerald-600 text-white py-3 rounded-xl font-bold transition-all disabled:opacity-50"
              >
                {loading ? (editingTransaction ? 'Updating...' : 'Saving...') : (editingTransaction ? 'Update Transaction' : 'Save Transaction')}
              </button>
            </form>
          </motion.div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {transactionToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl p-6"
          >
            <h3 className="text-xl font-bold text-slate-900 mb-2">Delete Transaction?</h3>
            <p className="text-slate-500 mb-6">Are you sure you want to delete this transaction? This action cannot be undone.</p>
            <div className="flex gap-3">
              <button 
                onClick={() => setTransactionToDelete(null)}
                className="flex-1 px-4 py-2 border border-slate-200 text-slate-600 rounded-xl font-semibold hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={() => deleteTransaction(transactionToDelete)}
                disabled={loading}
                className="flex-1 px-4 py-2 bg-red-500 text-white rounded-xl font-semibold hover:bg-red-600 transition-colors disabled:opacity-50"
              >
                {loading ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
};

export default Accounting;
