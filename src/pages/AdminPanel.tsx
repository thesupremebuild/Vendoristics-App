import React, { useState, useEffect } from 'react';
import { useAuth } from '../AuthContext';
import { db } from '../firebase';
import { collection, onSnapshot, query, where, doc, updateDoc, deleteDoc, addDoc, orderBy, arrayUnion } from 'firebase/firestore';
import { UserPlus, Shield, Trash2, Mail, User, Plus, MessageSquare, CheckCircle2, Clock, Send } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'react-hot-toast';

const AdminPanel: React.FC = () => {
  const { businessId, profile, user } = useAuth();
  const [users, setUsers] = useState<any[]>([]);
  const [invitations, setInvitations] = useState<any[]>([]);
  const [tickets, setTickets] = useState<any[]>([]);
  const [activeAdminTab, setActiveAdminTab] = useState<'team' | 'support'>('team');
  const [selectedTicket, setSelectedTicket] = useState<any | null>(null);
  const [reply, setReply] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({ email: '', role: 'staff' });
  const [loading, setLoading] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [userToRemove, setUserToRemove] = useState<string | null>(null);
  
  const isSuperAdmin = user?.email === 'thesupremebuild@gmail.com';

  useEffect(() => {
    if (!businessId) return;
    const usersRef = collection(db, 'users');
    const unsubscribeUsers = onSnapshot(query(usersRef, where('businessId', '==', businessId)), (snapshot) => {
      setUsers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    const invRef = collection(db, 'invitations');
    const unsubscribeInvs = onSnapshot(query(invRef, where('businessId', '==', businessId), where('status', '==', 'pending')), (snapshot) => {
      setInvitations(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    let unsubscribeTickets = () => {};
    if (isSuperAdmin) {
      const ticketsRef = collection(db, 'support_tickets');
      unsubscribeTickets = onSnapshot(query(ticketsRef, orderBy('createdAt', 'desc')), (snapshot) => {
        setTickets(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      });
    }

    return () => {
      unsubscribeUsers();
      unsubscribeInvs();
      unsubscribeTickets();
    };
  }, [businessId, isSuperAdmin]);

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !profile || !selectedTicket || !reply.trim()) return;

    try {
      const response = {
        senderId: user.uid,
        senderName: 'Support Team',
        message: reply,
        timestamp: new Date().toISOString()
      };

      await updateDoc(doc(db, 'support_tickets', selectedTicket.id), {
        responses: arrayUnion(response),
        status: 'in-progress'
      });

      setReply('');
      toast.success('Reply sent');
    } catch (error) {
      toast.error('Failed to send reply');
    }
  };

  const resolveTicket = async (id: string) => {
    try {
      await updateDoc(doc(db, 'support_tickets', id), { status: 'resolved' });
      toast.success('Ticket marked as resolved');
    } catch (error) {
      toast.error('Failed to resolve ticket');
    }
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!businessId || !formData.email) return;
    setLoading(true);
    try {
      // Check if user already exists in this business
      const alreadyMember = users.find(u => u.email.toLowerCase() === formData.email.toLowerCase());
      if (alreadyMember) {
        toast.error('User is already a member');
        return;
      }

      await addDoc(collection(db, 'invitations'), {
        email: formData.email.toLowerCase(),
        role: formData.role,
        businessId,
        businessName: profile?.displayName ? `${profile.displayName}'s Business` : 'Business', // Should ideally fetch real biz name
        status: 'pending',
        invitedBy: profile?.uid,
        createdAt: new Date().toISOString()
      });
      toast.success('Invitation sent');
      setShowModal(false);
      setFormData({ email: '', role: 'staff' });
    } catch (error) {
      toast.error('Failed to send invitation');
    } finally {
      setLoading(false);
    }
  };

  const cancelInvitation = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'invitations', id));
      toast.success('Invitation cancelled');
    } catch (error) {
      toast.error('Failed to cancel invitation');
    }
  };

  const updateRole = async (userId: string, newRole: string) => {
    setUpdatingId(userId);
    try {
      await updateDoc(doc(db, 'users', userId), { role: newRole });
      toast.success('Role updated');
    } catch (error) {
      toast.error('Update failed');
    } finally {
      setUpdatingId(null);
    }
  };

  const removeUser = async (userId: string) => {
    if (userId === profile?.uid) return toast.error("Cannot remove yourself");
    try {
      await updateDoc(doc(db, 'users', userId), { businessId: '', role: 'staff' });
      toast.success('User removed');
      setUserToRemove(null);
    } catch (error) {
      toast.error('Remove failed');
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Admin Panel</h2>
          <p className="text-slate-500">Manage team members and support requests.</p>
        </div>
        {activeAdminTab === 'team' && (
          <button 
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white px-6 py-3 rounded-xl font-semibold transition-all shadow-lg shadow-emerald-500/20"
          >
            <UserPlus size={20} />
            Invite User
          </button>
        )}
      </header>

      {isSuperAdmin && (
        <div className="flex gap-4 border-b border-slate-200">
          <button
            onClick={() => setActiveAdminTab('team')}
            className={`pb-4 px-2 font-bold transition-all ${
              activeAdminTab === 'team' ? 'text-emerald-600 border-b-2 border-emerald-600' : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            Team Management
          </button>
          <button
            onClick={() => setActiveAdminTab('support')}
            className={`pb-4 px-2 font-bold transition-all ${
              activeAdminTab === 'support' ? 'text-emerald-600 border-b-2 border-emerald-600' : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            Support Tickets
          </button>
        </div>
      )}

      {activeAdminTab === 'team' ? (
        <>
          {invitations.length > 0 && (
            <div className="bg-amber-50 rounded-2xl border border-amber-100 overflow-hidden">
              <div className="p-4 border-b border-amber-100 flex items-center justify-between">
                <h3 className="font-bold text-amber-900 flex items-center gap-2">
                  <Mail size={18} />
                  Pending Invitations
                </h3>
              </div>
              <div className="divide-y divide-amber-100">
                {invitations.map(inv => (
                  <div key={inv.id} className="p-4 flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-amber-900">{inv.email}</p>
                      <p className="text-xs text-amber-700 capitalize">Role: {inv.role}</p>
                    </div>
                    <button 
                      onClick={() => cancelInvitation(inv.id)}
                      className="text-amber-600 hover:text-red-500 text-sm font-medium transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="p-6 border-b border-slate-100">
              <h3 className="font-bold text-slate-900">Team Members</h3>
            </div>
            <div className="divide-y divide-slate-100">
              {users.map(user => (
                <div key={user.id} className="p-6 flex items-center justify-between hover:bg-slate-50 transition-colors">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-500">
                      <User size={24} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-bold text-slate-900">{user.displayName}</p>
                        {user.uid === profile?.uid && (
                          <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded uppercase font-bold">You</span>
                        )}
                      </div>
                      <p className="text-sm text-slate-500 flex items-center gap-1">
                        <Mail size={12} />
                        {user.email}
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-6">
                    <div className="flex items-center gap-2">
                      <Shield size={16} className="text-slate-400" />
                      <select 
                        value={user.role}
                        onChange={(e) => updateRole(user.id, e.target.value)}
                        disabled={user.uid === profile?.uid || updatingId === user.id}
                        className="bg-slate-50 border border-slate-200 text-sm font-semibold rounded-xl px-3 py-1.5 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <option value="owner">Owner</option>
                        <option value="staff">Staff</option>
                      </select>
                    </div>
                    <button 
                      onClick={() => setUserToRemove(user.id)}
                      disabled={user.uid === profile?.uid}
                      className="text-slate-300 hover:text-red-500 transition-colors disabled:opacity-0"
                    >
                      <Trash2 size={20} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-1 space-y-4">
            <h3 className="font-bold text-slate-900 mb-4">Support Tickets</h3>
            {tickets.length === 0 ? (
              <p className="text-slate-500">No tickets found.</p>
            ) : (
              tickets.map(ticket => (
                <button
                  key={ticket.id}
                  onClick={() => setSelectedTicket(ticket)}
                  className={`w-full text-left p-4 rounded-2xl border transition-all ${
                    selectedTicket?.id === ticket.id ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-slate-100'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                      ticket.status === 'resolved' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                    }`}>
                      {ticket.status}
                    </span>
                    <span className="text-xs text-slate-400">{format(new Date(ticket.createdAt), 'MMM d')}</span>
                  </div>
                  <p className="font-bold text-slate-900 truncate">{ticket.subject}</p>
                  <p className="text-xs text-slate-500 mt-1">From: {ticket.userName}</p>
                </button>
              ))
            )}
          </div>

          <div className="lg:col-span-2">
            {selectedTicket ? (
              <div className="bg-white rounded-2xl shadow-sm border border-slate-100 flex flex-col h-[600px]">
                <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                  <div>
                    <h3 className="font-bold text-slate-900">{selectedTicket.subject}</h3>
                    <p className="text-xs text-slate-500">{selectedTicket.userEmail}</p>
                  </div>
                  {selectedTicket.status !== 'resolved' && (
                    <button
                      onClick={() => resolveTicket(selectedTicket.id)}
                      className="text-emerald-600 hover:text-emerald-700 font-bold text-sm"
                    >
                      Mark Resolved
                    </button>
                  )}
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                  <div className="bg-slate-50 rounded-2xl p-4">
                    <p className="text-sm font-bold text-slate-900 mb-1">{selectedTicket.userName}</p>
                    <p className="text-slate-700 whitespace-pre-wrap">{selectedTicket.message}</p>
                  </div>

                  {selectedTicket.responses?.map((res: any, i: number) => (
                    <div key={i} className={`flex flex-col ${res.senderId === user?.uid ? 'items-end' : 'items-start'}`}>
                      <div className={`max-w-[80%] p-4 rounded-2xl ${
                        res.senderId === user?.uid ? 'bg-emerald-50 border border-emerald-100' : 'bg-slate-50'
                      }`}>
                        <p className="text-xs font-bold text-slate-900 mb-1">{res.senderName}</p>
                        <p className="text-sm text-slate-700 whitespace-pre-wrap">{res.message}</p>
                      </div>
                    </div>
                  ))}
                </div>

                <form onSubmit={handleSendReply} className="p-4 border-t border-slate-100">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={reply}
                      onChange={(e) => setReply(e.target.value)}
                      placeholder="Type a response..."
                      className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                    />
                    <button
                      type="submit"
                      disabled={!reply.trim()}
                      className="bg-emerald-500 text-white p-2 rounded-xl hover:bg-emerald-600 disabled:opacity-50"
                    >
                      <Send size={20} />
                    </button>
                  </div>
                </form>
              </div>
            ) : (
              <div className="bg-white rounded-2xl p-12 text-center border border-slate-100 h-[600px] flex flex-col items-center justify-center">
                <MessageSquare className="text-slate-200 mb-4" size={48} />
                <h3 className="text-xl font-bold text-slate-900">Select a ticket</h3>
                <p className="text-slate-500">Choose a support request to view and respond.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-xl font-bold text-slate-900">Invite Team Member</h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600">
                <Plus size={24} className="rotate-45" />
              </button>
            </div>
            <form onSubmit={handleInvite} className="p-6 space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Email Address</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input 
                    required
                    type="email" 
                    value={formData.email}
                    onChange={(e) => setFormData({...formData, email: e.target.value})}
                    className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                    placeholder="colleague@example.com"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Role</label>
                <select 
                  value={formData.role}
                  onChange={(e) => setFormData({...formData, role: e.target.value})}
                  className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                >
                  <option value="staff">Staff (Limited Access)</option>
                  <option value="owner">Owner (Full Access)</option>
                </select>
              </div>
              <button 
                disabled={loading}
                type="submit"
                className="w-full bg-emerald-500 hover:bg-emerald-600 text-white py-3 rounded-xl font-bold transition-all disabled:opacity-50"
              >
                {loading ? 'Sending...' : 'Send Invitation'}
              </button>
            </form>
          </div>
        </div>
      )}

      {userToRemove && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl p-6">
            <h3 className="text-xl font-bold text-slate-900 mb-2">Remove User?</h3>
            <p className="text-slate-500 mb-6">Are you sure you want to remove this user from the business? They will lose access to all data.</p>
            <div className="flex gap-3">
              <button 
                onClick={() => setUserToRemove(null)}
                className="flex-1 px-4 py-2 border border-slate-200 text-slate-600 rounded-xl font-semibold hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={() => removeUser(userToRemove)}
                className="flex-1 px-4 py-2 bg-red-500 text-white rounded-xl font-semibold hover:bg-red-600 transition-colors"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminPanel;
