import React, { useState, useEffect } from 'react';
import { useAuth } from '../AuthContext';
import { db } from '../firebase';
import { collection, addDoc, query, where, onSnapshot, orderBy, updateDoc, doc, arrayUnion } from 'firebase/firestore';
import { MessageSquare, Send, Clock, CheckCircle2, AlertCircle, ChevronRight, User } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'react-hot-toast';

interface SupportResponse {
  senderId: string;
  senderName: string;
  message: string;
  timestamp: string;
}

interface SupportTicket {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  businessId: string;
  subject: string;
  message: string;
  status: 'open' | 'in-progress' | 'resolved';
  createdAt: string;
  responses?: SupportResponse[];
}

const Support: React.FC = () => {
  const { user, profile, businessId } = useAuth();
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [showNewTicket, setShowNewTicket] = useState(false);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
  const [reply, setReply] = useState('');

  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, 'support_tickets'),
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      setTickets(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as SupportTicket)));
    });

    return () => unsubscribe();
  }, [user]);

  const handleSubmitTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !profile || !businessId) return;

    try {
      await addDoc(collection(db, 'support_tickets'), {
        userId: user.uid,
        userName: profile.displayName,
        userEmail: profile.email,
        businessId: businessId,
        subject,
        message,
        status: 'open',
        createdAt: new Date().toISOString(),
        responses: []
      });

      setSubject('');
      setMessage('');
      setShowNewTicket(false);
      toast.success('Support ticket submitted successfully!');
    } catch (error) {
      toast.error('Failed to submit ticket');
    }
  };

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !profile || !selectedTicket || !reply.trim()) return;

    try {
      const response: SupportResponse = {
        senderId: user.uid,
        senderName: profile.displayName,
        message: reply,
        timestamp: new Date().toISOString()
      };

      await updateDoc(doc(db, 'support_tickets', selectedTicket.id), {
        responses: arrayUnion(response),
        status: 'open' // Re-open if it was resolved? Or just keep current
      });

      setReply('');
      toast.success('Reply sent');
    } catch (error) {
      toast.error('Failed to send reply');
    }
  };

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Support & Help</h1>
          <p className="text-gray-600 mt-2">Need help? Share your queries or problems with us.</p>
        </div>
        <button
          onClick={() => setShowNewTicket(true)}
          className="flex items-center gap-2 bg-emerald-500 text-white px-6 py-3 rounded-xl font-bold hover:bg-emerald-600 transition-all shadow-lg shadow-emerald-500/20"
        >
          <MessageSquare size={20} />
          New Support Ticket
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Tickets List */}
        <div className="lg:col-span-1 space-y-4">
          <h2 className="text-lg font-semibold text-gray-700 mb-4">Your Tickets</h2>
          {tickets.length === 0 ? (
            <div className="bg-white rounded-2xl p-8 text-center border border-dashed border-gray-200">
              <MessageSquare className="mx-auto text-gray-300 mb-4" size={48} />
              <p className="text-gray-500">No support tickets yet.</p>
            </div>
          ) : (
            tickets.map((ticket) => (
              <button
                key={ticket.id}
                onClick={() => setSelectedTicket(ticket)}
                className={`w-full text-left p-4 rounded-2xl border transition-all ${
                  selectedTicket?.id === ticket.id
                    ? 'bg-emerald-50 border-emerald-200 shadow-sm'
                    : 'bg-white border-gray-100 hover:border-emerald-200'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className={`px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider ${
                    ticket.status === 'resolved' ? 'bg-emerald-100 text-emerald-700' :
                    ticket.status === 'in-progress' ? 'bg-blue-100 text-blue-700' :
                    'bg-amber-100 text-amber-700'
                  }`}>
                    {ticket.status}
                  </span>
                  <span className="text-xs text-gray-400">
                    {format(new Date(ticket.createdAt), 'MMM d, yyyy')}
                  </span>
                </div>
                <h3 className="font-bold text-gray-900 truncate">{ticket.subject}</h3>
                <p className="text-sm text-gray-500 line-clamp-1 mt-1">{ticket.message}</p>
              </button>
            ))
          )}
        </div>

        {/* Ticket Detail / Chat */}
        <div className="lg:col-span-2">
          {selectedTicket ? (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 flex flex-col h-[600px]">
              <div className="p-6 border-b border-gray-50 flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-gray-900">{selectedTicket.subject}</h2>
                  <p className="text-sm text-gray-500">Ticket ID: {selectedTicket.id}</p>
                </div>
                <div className="flex items-center gap-2">
                  {selectedTicket.status === 'resolved' ? (
                    <div className="flex items-center gap-1 text-emerald-600 font-bold text-sm">
                      <CheckCircle2 size={16} />
                      Resolved
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 text-amber-600 font-bold text-sm">
                      <Clock size={16} />
                      {selectedTicket.status === 'open' ? 'Awaiting Response' : 'Under Review'}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {/* Original Message */}
                <div className="flex gap-4">
                  <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
                    <User size={20} className="text-gray-500" />
                  </div>
                  <div className="bg-gray-50 rounded-2xl p-4 max-w-[80%]">
                    <p className="font-bold text-sm text-gray-900 mb-1">{selectedTicket.userName}</p>
                    <p className="text-gray-700 whitespace-pre-wrap">{selectedTicket.message}</p>
                    <p className="text-[10px] text-gray-400 mt-2">
                      {format(new Date(selectedTicket.createdAt), 'MMM d, h:mm a')}
                    </p>
                  </div>
                </div>

                {/* Responses */}
                {selectedTicket.responses?.map((res, i) => (
                  <div key={i} className={`flex gap-4 ${res.senderId === user?.uid ? '' : 'flex-row-reverse'}`}>
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                      res.senderId === user?.uid ? 'bg-gray-100' : 'bg-emerald-100'
                    }`}>
                      {res.senderId === user?.uid ? <User size={20} className="text-gray-500" /> : <div className="text-emerald-600 font-bold">A</div>}
                    </div>
                    <div className={`rounded-2xl p-4 max-w-[80%] ${
                      res.senderId === user?.uid ? 'bg-gray-50' : 'bg-emerald-50 border border-emerald-100'
                    }`}>
                      <p className="font-bold text-sm text-gray-900 mb-1">
                        {res.senderId === user?.uid ? res.senderName : 'Support Team'}
                      </p>
                      <p className="text-gray-700 whitespace-pre-wrap">{res.message}</p>
                      <p className="text-[10px] text-gray-400 mt-2">
                        {format(new Date(res.timestamp), 'MMM d, h:mm a')}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              {selectedTicket.status !== 'resolved' && (
                <form onSubmit={handleSendReply} className="p-4 border-t border-gray-50 bg-gray-50 rounded-b-2xl">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={reply}
                      onChange={(e) => setReply(e.target.value)}
                      placeholder="Type your reply..."
                      className="flex-1 bg-white border border-gray-200 rounded-xl px-4 py-2 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                    />
                    <button
                      type="submit"
                      disabled={!reply.trim()}
                      className="bg-emerald-500 text-white p-2 rounded-xl hover:bg-emerald-600 disabled:opacity-50 transition-all"
                    >
                      <Send size={20} />
                    </button>
                  </div>
                </form>
              )}
            </div>
          ) : (
            <div className="bg-white rounded-2xl p-12 text-center border border-gray-100 h-[600px] flex flex-col items-center justify-center">
              <div className="w-20 h-20 bg-emerald-50 rounded-full flex items-center justify-center text-emerald-500 mb-6">
                <MessageSquare size={40} />
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Select a ticket</h2>
              <p className="text-gray-500 max-w-xs mx-auto">
                Choose a ticket from the list to view the conversation or submit a new one if you have a problem.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* New Ticket Modal */}
      {showNewTicket && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-gray-50">
              <h3 className="text-xl font-bold text-gray-900">New Support Ticket</h3>
              <button onClick={() => setShowNewTicket(false)} className="text-gray-400 hover:text-gray-600">
                <AlertCircle size={24} />
              </button>
            </div>
            <form onSubmit={handleSubmitTicket} className="p-6 space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Subject</label>
                <input
                  required
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Brief summary of the issue"
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Message</label>
                <textarea
                  required
                  rows={5}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Describe your problem in detail..."
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                />
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowNewTicket(false)}
                  className="flex-1 px-4 py-3 rounded-xl border border-gray-200 text-gray-600 font-bold hover:bg-gray-50 transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-emerald-500 text-white px-4 py-3 rounded-xl font-bold hover:bg-emerald-600 transition-all shadow-lg shadow-emerald-500/20"
                >
                  Submit Ticket
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Support;
