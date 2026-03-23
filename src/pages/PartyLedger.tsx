import React, { useState, useEffect } from 'react';
import { useAuth } from '../AuthContext';
import { useNavigation } from '../NavigationContext';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { collection, addDoc, onSnapshot, query, where, doc, deleteDoc, updateDoc } from 'firebase/firestore';
import { Plus, UserPlus, Trash2, ExternalLink, Phone, Mail, Edit2, FileText } from 'lucide-react';
import { toast } from 'react-hot-toast';

const PartyLedger: React.FC = () => {
  const { businessId } = useAuth();
  const { setActiveTab } = useNavigation();
  const [parties, setParties] = useState<any[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingParty, setEditingParty] = useState<any>(null);
  const [formData, setFormData] = useState({ 
    name: '', 
    type: 'customer', 
    phone: '', 
    email: '',
    openingBalance: 0,
    openingBalanceType: 'receive' as 'receive' | 'pay'
  });
  const [loading, setLoading] = useState(false);
  const [partyToDelete, setPartyToDelete] = useState<string | null>(null);

  useEffect(() => {
    if (!businessId) return;
    const partiesRef = collection(db, 'businesses', businessId, 'parties');
    const unsubscribe = onSnapshot(
      partiesRef, 
      (snapshot) => {
        setParties(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      },
      (err) => handleFirestoreError(err, OperationType.LIST, `businesses/${businessId}/parties`)
    );
    return () => unsubscribe();
  }, [businessId]);

  const openEditModal = (party: any) => {
    setEditingParty(party);
    setFormData({
      name: party.name,
      type: party.type,
      phone: party.phone || '',
      email: party.email || '',
      openingBalance: party.openingBalance || 0,
      openingBalanceType: party.openingBalanceType || 'receive'
    });
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!businessId) return;
    setLoading(true);
    try {
      const totalDue = formData.openingBalanceType === 'receive' ? formData.openingBalance : -formData.openingBalance;
      
      if (editingParty) {
        // Calculate difference if opening balance changed
        const oldTotalDue = editingParty.openingBalanceType === 'receive' ? editingParty.openingBalance : -editingParty.openingBalance;
        const diff = totalDue - oldTotalDue;

        await updateDoc(doc(db, 'businesses', businessId, 'parties', editingParty.id), {
          name: formData.name,
          type: formData.type,
          phone: formData.phone,
          email: formData.email,
          openingBalance: formData.openingBalance,
          openingBalanceType: formData.openingBalanceType,
          totalDue: (editingParty.totalDue || 0) + diff,
          updatedAt: new Date().toISOString()
        });
        toast.success('Party updated successfully');
      } else {
        const partyRef = await addDoc(collection(db, 'businesses', businessId, 'parties'), {
          name: formData.name,
          type: formData.type,
          phone: formData.phone,
          email: formData.email,
          openingBalance: formData.openingBalance,
          openingBalanceType: formData.openingBalanceType,
          businessId,
          totalDue: totalDue,
          createdAt: new Date().toISOString()
        });

        // Create an opening balance transaction if balance > 0
        if (formData.openingBalance > 0) {
          await addDoc(collection(db, 'businesses', businessId, 'transactions'), {
            date: new Date().toISOString().split('T')[0],
            partyId: partyRef.id,
            partyName: formData.name,
            amount: formData.openingBalance,
            type: formData.openingBalanceType === 'receive' ? 'credit' : 'debit',
            category: 'opening_balance',
            description: 'Opening Balance',
            status: 'paid', // Opening balance is considered "settled" in terms of transaction flow
            createdAt: new Date().toISOString()
          });
        }
        toast.success('Party added successfully');
      }
      closeModal();
    } catch (error) {
      console.error(error);
      toast.error(editingParty ? 'Failed to update party' : 'Failed to add party');
    } finally {
      setLoading(false);
    }
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingParty(null);
    setFormData({ 
      name: '', 
      type: 'customer', 
      phone: '', 
      email: '',
      openingBalance: 0,
      openingBalanceType: 'receive'
    });
  };

  const deleteParty = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'businesses', businessId!, 'parties', id));
      toast.success('Party deleted');
      setPartyToDelete(null);
    } catch (error) {
      toast.error('Failed to delete party');
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Party Ledger</h2>
          <p className="text-slate-500">Manage your customers and vendors.</p>
        </div>
        <button 
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white px-6 py-3 rounded-xl font-semibold transition-all shadow-lg shadow-emerald-500/20"
        >
          <UserPlus size={20} />
          Add Party
        </button>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {parties.map(party => (
          <div key={party.id} className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 hover:border-emerald-200 transition-all group">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-bold text-lg ${
                  party.type === 'customer' ? 'bg-emerald-100 text-emerald-600' : 'bg-indigo-100 text-indigo-600'
                }`}>
                  {party.name.charAt(0)}
                </div>
                <div>
                  <h3 className="font-bold text-slate-900">{party.name}</h3>
                  <span className={`text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full ${
                    party.type === 'customer' ? 'bg-emerald-50 text-emerald-600' : 'bg-indigo-50 text-indigo-600'
                  }`}>
                    {party.type}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <button 
                  onClick={() => openEditModal(party)}
                  className="text-slate-300 hover:text-emerald-500 transition-colors"
                >
                  <Edit2 size={18} />
                </button>
                <button 
                  onClick={() => setPartyToDelete(party.id)}
                  className="text-slate-300 hover:text-red-500 transition-colors"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            </div>

            <div className="space-y-2 mb-6">
              {party.phone && (
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <Phone size={14} />
                  {party.phone}
                </div>
              )}
              {party.email && (
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <Mail size={14} />
                  {party.email}
                </div>
              )}
            </div>

            <div className="pt-4 border-t border-slate-50 flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-400 uppercase font-bold tracking-wider">Total Due</p>
                <p className={`text-xl font-bold ${party.totalDue >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                  ₹{Math.abs(party.totalDue).toLocaleString()}
                  <span className="text-xs ml-1 font-normal text-slate-400">
                    {party.totalDue >= 0 ? '(To Receive)' : '(To Pay)'}
                  </span>
                </p>
              </div>
              <button 
                onClick={() => setActiveTab('invoices')}
                className="p-2 bg-slate-50 hover:bg-emerald-50 text-slate-400 hover:text-emerald-600 rounded-lg transition-colors"
                title="Generate Invoice"
              >
                <FileText size={20} />
              </button>
              <button className="p-2 bg-slate-50 hover:bg-emerald-50 text-slate-400 hover:text-emerald-600 rounded-lg transition-colors">
                <ExternalLink size={20} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-xl font-bold text-slate-900">{editingParty ? 'Edit Party' : 'Add New Party'}</h3>
              <button onClick={closeModal} className="text-slate-400 hover:text-slate-600">
                <Plus size={24} className="rotate-45" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Party Name</label>
                <input 
                  required
                  type="text" 
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  placeholder="e.g. John Doe"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Type</label>
                <select 
                  value={formData.type}
                  onChange={(e) => setFormData({...formData, type: e.target.value})}
                  className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                >
                  <option value="customer">Customer</option>
                  <option value="vendor">Vendor</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Phone (Optional)</label>
                <input 
                  type="tel" 
                  value={formData.phone}
                  onChange={(e) => setFormData({...formData, phone: e.target.value})}
                  className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  placeholder="+91 00000 00000"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Email (Optional)</label>
                <input 
                  type="email" 
                  value={formData.email}
                  onChange={(e) => setFormData({...formData, email: e.target.value})}
                  className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  placeholder="john@example.com"
                />
              </div>

              {!editingParty && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">Opening Balance</label>
                    <input 
                      type="number" 
                      value={formData.openingBalance}
                      onChange={(e) => setFormData({...formData, openingBalance: Number(e.target.value)})}
                      className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                      placeholder="0"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">Balance Type</label>
                    <select 
                      value={formData.openingBalanceType}
                      onChange={(e) => setFormData({...formData, openingBalanceType: e.target.value as 'receive' | 'pay'})}
                      className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                    >
                      <option value="receive">To Receive</option>
                      <option value="pay">To Pay</option>
                    </select>
                  </div>
                </div>
              )}
              <button 
                disabled={loading}
                type="submit"
                className="w-full bg-emerald-500 hover:bg-emerald-600 text-white py-3 rounded-xl font-bold transition-all disabled:opacity-50"
              >
                {loading ? (editingParty ? 'Updating...' : 'Adding...') : (editingParty ? 'Update Party' : 'Create Party')}
              </button>
            </form>
          </div>
        </div>
      )}

      {partyToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl p-6">
            <h3 className="text-xl font-bold text-slate-900 mb-2">Delete Party?</h3>
            <p className="text-slate-500 mb-6">Are you sure you want to delete this party? This action cannot be undone.</p>
            <div className="flex gap-3">
              <button 
                onClick={() => setPartyToDelete(null)}
                className="flex-1 px-4 py-2 border border-slate-200 text-slate-600 rounded-xl font-semibold hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={() => deleteParty(partyToDelete)}
                className="flex-1 px-4 py-2 bg-red-500 text-white rounded-xl font-semibold hover:bg-red-600 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PartyLedger;
