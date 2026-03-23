import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../AuthContext';
import { db, handleFirestoreError, OperationType, storage, ref, uploadBytes, getDownloadURL, uploadBytesResumable } from '../firebase';
import { 
  collection, 
  addDoc, 
  onSnapshot, 
  query, 
  orderBy, 
  Timestamp, 
  doc, 
  setDoc, 
  getDoc,
  where,
  writeBatch,
  deleteDoc,
  increment,
  updateDoc
} from 'firebase/firestore';
import { 
  Plus, 
  Search, 
  FileText, 
  Download, 
  Settings as SettingsIcon,
  Eye,
  Trash2,
  Printer,
  CheckCircle2,
  XCircle,
  Upload,
  Image as ImageIcon
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { format } from 'date-fns';
import { toast } from 'react-hot-toast';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

interface InvoiceSettings {
  companyName: string;
  address: string;
  phone: string;
  email: string;
  gstin?: string;
  logoUrl?: string;
  footerText?: string;
  color: string;
}

interface Invoice {
  id: string;
  invoiceNumber: string;
  partyId: string;
  partyName: string;
  date: string;
  dueDate: string;
  items: any[];
  totalAmount: number;
  status: 'draft' | 'sent' | 'paid' | 'overdue';
  type?: 'invoice' | 'quotation';
  createdAt: any;
}

const Invoices: React.FC = () => {
  const { businessId } = useAuth();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [parties, setParties] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [settings, setSettings] = useState<InvoiceSettings>({
    companyName: '',
    address: '',
    phone: '',
    email: '',
    color: '#10b981', // emerald-500
  });
  
  const [showModal, setShowModal] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [loading, setLoading] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [activeTab, setActiveTab] = useState<'list' | 'create' | 'preview'>('list');
  const [activeListTab, setActiveListTab] = useState<'invoices' | 'quotations'>('invoices');
  const [invoiceType, setInvoiceType] = useState<'invoice' | 'quotation'>('invoice');
  const [creationMode, setCreationMode] = useState<'select' | 'manual'>('select');
  const [manualItems, setManualItems] = useState<any[]>([{ description: '', quantity: 1, rate: 0 }]);
  const [quotations, setQuotations] = useState<any[]>([]);
  
  // Create Invoice State
  const [selectedParty, setSelectedParty] = useState<string>('');
  const [selectedTransactions, setSelectedTransactions] = useState<string[]>([]);
  const [invoiceDate, setInvoiceDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [dueDate, setDueDate] = useState(format(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd'));
  const [invoiceNumber, setInvoiceNumber] = useState(`INV-${Date.now().toString().slice(-6)}`);

  const invoiceRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!businessId) return;

    // Fetch Invoices
    const invoicesRef = collection(db, 'businesses', businessId, 'invoices');
    const unsubscribeInvoices = onSnapshot(
      query(invoicesRef, orderBy('createdAt', 'desc')),
      (snapshot) => {
        setInvoices(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Invoice)));
      },
      (err) => handleFirestoreError(err, OperationType.LIST, `businesses/${businessId}/invoices`)
    );

    // Fetch Quotations
    const quotationsRef = collection(db, 'businesses', businessId, 'quotations');
    const unsubscribeQuotations = onSnapshot(
      query(quotationsRef, orderBy('createdAt', 'desc')),
      (snapshot) => {
        setQuotations(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      },
      (err) => handleFirestoreError(err, OperationType.LIST, `businesses/${businessId}/quotations`)
    );

    // Fetch Parties
    const partiesRef = collection(db, 'businesses', businessId, 'parties');
    const unsubscribeParties = onSnapshot(
      partiesRef, 
      (snapshot) => {
        setParties(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      },
      (err) => handleFirestoreError(err, OperationType.LIST, `businesses/${businessId}/parties`)
    );

    // Fetch Settings
    const settingsRef = doc(db, 'businesses', businessId, 'settings', 'invoice');
    getDoc(settingsRef).then(docSnap => {
      if (docSnap.exists()) {
        setSettings(docSnap.data() as InvoiceSettings);
      } else {
        // Initialize with business name if settings don't exist
        const bizRef = doc(db, 'businesses', businessId);
        getDoc(bizRef).then(bizSnap => {
          if (bizSnap.exists()) {
            setSettings(prev => ({ ...prev, companyName: bizSnap.data().name }));
          }
        });
      }
    });

    return () => {
      unsubscribeInvoices();
      unsubscribeQuotations();
      unsubscribeParties();
    };
  }, [businessId]);

  useEffect(() => {
    if (!businessId || !selectedParty) {
      setTransactions([]);
      return;
    }

    const transactionsRef = collection(db, 'businesses', businessId, 'transactions');
    const q = query(transactionsRef, where('partyId', '==', selectedParty), where('status', '==', 'unpaid'));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setTransactions(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    return () => unsubscribe();
  }, [businessId, selectedParty]);

  const handleSaveSettings = async () => {
    if (!businessId) return;
    setLoading(true);
    try {
      await setDoc(doc(db, 'businesses', businessId, 'settings', 'invoice'), settings);
      toast.success('Invoice settings saved');
      setShowSettings(false);
    } catch (error) {
      toast.error('Failed to save settings');
    } finally {
      setLoading(false);
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !businessId) return;

    if (file.size > 2 * 1024 * 1024) {
      toast.error('Logo must be less than 2MB');
      return;
    }

    setUploadingLogo(true);
    try {
      const storageRef = ref(storage, `businesses/${businessId}/logo_${Date.now()}`);
      
      // Using uploadBytesResumable for better feedback
      const uploadTask = uploadBytesResumable(storageRef, file);
      
      await new Promise((resolve, reject) => {
        uploadTask.on('state_changed', 
          (snapshot) => {
            const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
            console.log('Upload is ' + progress + '% done');
          }, 
          (error) => {
            console.error('Upload error:', error);
            reject(error);
          }, 
          () => {
            resolve(uploadTask.snapshot.ref);
          }
        );
      });

      const url = await getDownloadURL(storageRef);
      setSettings(prev => ({ ...prev, logoUrl: url }));
      toast.success('Logo uploaded successfully');
    } catch (error) {
      console.error('Logo upload error:', error);
      toast.error('Failed to upload logo. Please check your connection.');
    } finally {
      setUploadingLogo(false);
    }
  };

  const toggleTransaction = (id: string) => {
    setSelectedTransactions(prev => 
      prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id]
    );
  };

  const calculateTotal = () => {
    if (creationMode === 'manual') {
      return manualItems.reduce((sum, item) => sum + (item.quantity * item.rate), 0);
    }
    return transactions
      .filter(t => selectedTransactions.includes(t.id))
      .reduce((sum, t) => sum + (t.type === 'credit' ? t.amount : -t.amount), 0);
  };

  const addManualItem = () => {
    setManualItems([...manualItems, { description: '', quantity: 1, rate: 0 }]);
  };

  const removeManualItem = (index: number) => {
    setManualItems(manualItems.filter((_, i) => i !== index));
  };

  const updateManualItem = (index: number, field: string, value: any) => {
    const newItems = [...manualItems];
    newItems[index] = { ...newItems[index], [field]: value };
    setManualItems(newItems);
  };

  const handleGenerateInvoice = async () => {
    if (!businessId || !selectedParty) {
      toast.error('Please select a party');
      return;
    }

    if (creationMode === 'select' && selectedTransactions.length === 0) {
      toast.error('Please select at least one transaction');
      return;
    }

    if (creationMode === 'manual' && (manualItems.length === 0 || manualItems.some(i => !i.description || i.rate <= 0))) {
      toast.error('Please add valid items');
      return;
    }

    setLoading(true);
    try {
      const party = parties.find(p => p.id === selectedParty);
      const totalAmount = calculateTotal();
      
      let items = [];
      if (creationMode === 'manual') {
        items = manualItems.map(i => ({
          ...i,
          amount: i.quantity * i.rate,
          type: 'credit', // Manual items are usually sales/credits
          date: invoiceDate,
          description: i.description
        }));
      } else {
        items = transactions.filter(t => selectedTransactions.includes(t.id));
      }

      const documentData = {
        invoiceNumber,
        partyId: selectedParty,
        partyName: party?.name || 'Unknown',
        date: invoiceDate,
        dueDate,
        items,
        totalAmount,
        status: invoiceType === 'invoice' ? 'sent' : 'draft',
        type: invoiceType,
        createdAt: Timestamp.now()
      };

      const collectionName = invoiceType === 'invoice' ? 'invoices' : 'quotations';
      const docRef = await addDoc(collection(db, 'businesses', businessId, collectionName), documentData);

      // If it's a manual invoice, we should create a transaction for it so it shows in ledger
      if (invoiceType === 'invoice' && creationMode === 'manual') {
        const transactionRef = await addDoc(collection(db, 'businesses', businessId, 'transactions'), {
          amount: totalAmount,
          type: 'credit',
          partyId: selectedParty,
          partyName: party?.name || 'Unknown',
          description: `Invoice ${invoiceNumber}`,
          status: 'unpaid',
          date: invoiceDate,
          businessId,
          invoiceId: docRef.id,
          updatedAt: Timestamp.now()
        });

        // Update party balance
        const partyRef = doc(db, 'businesses', businessId, 'parties', selectedParty);
        await updateDoc(partyRef, {
          totalDue: increment(totalAmount)
        });
      }

      toast.success(`${invoiceType === 'invoice' ? 'Invoice' : 'Quotation'} generated successfully`);
      setActiveTab('list');
      setActiveListTab(invoiceType === 'invoice' ? 'invoices' : 'quotations');
      
      // Reset state
      setSelectedParty('');
      setSelectedTransactions([]);
      setManualItems([{ description: '', quantity: 1, rate: 0 }]);
      setInvoiceType('invoice');
      setCreationMode('select');
    } catch (error) {
      console.error(error);
      toast.error(`Failed to generate ${invoiceType}`);
    } finally {
      setLoading(false);
    }
  };

  const downloadPDF = async (invoice: Invoice) => {
    setLoading(true);
    setInvoiceToDownload(invoice);
    
    // Give it a moment to render in the hidden div
    setTimeout(async () => {
      if (!downloadRef.current) {
        setLoading(false);
        setInvoiceToDownload(null);
        return;
      }
      
      try {
        const canvas = await html2canvas(downloadRef.current, {
          scale: 2,
          useCORS: true,
          logging: false
        });
        const imgData = canvas.toDataURL('image/png');
        const pdf = new jsPDF('p', 'mm', 'a4');
        const imgProps = pdf.getImageProperties(imgData);
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
        
        pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
        pdf.save(`Invoice_${invoice.invoiceNumber}.pdf`);
        toast.success('PDF Downloaded');
      } catch (error) {
        toast.error('Failed to generate PDF');
        console.error(error);
      } finally {
        setLoading(false);
        setInvoiceToDownload(null);
      }
    }, 500);
  };

  const [previewInvoice, setPreviewInvoice] = useState<Invoice | null>(null);
  const [invoiceToDelete, setInvoiceToDelete] = useState<string | null>(null);
  const [invoiceToDownload, setInvoiceToDownload] = useState<Invoice | null>(null);
  const downloadRef = useRef<HTMLDivElement>(null);

  const openPreview = (invoice: Invoice) => {
    setPreviewInvoice(invoice);
    setActiveTab('preview');
  };

  const updateInvoiceStatus = async (invoice: Invoice, newStatus: Invoice['status']) => {
    if (!businessId) return;
    setLoading(true);
    try {
      const invRef = doc(db, 'businesses', businessId, 'invoices', invoice.id);
      await setDoc(invRef, { status: newStatus }, { merge: true });
      
      // If marked as paid, update all associated transactions to paid and update party balance
      if (newStatus === 'paid') {
        const batch = writeBatch(db);
        invoice.items.forEach((item: any) => {
          const transRef = doc(db, 'businesses', businessId, 'transactions', item.id);
          batch.update(transRef, { status: 'paid' });
        });
        
        // Update party total due (subtract the paid amount)
        const partyRef = doc(db, 'businesses', businessId, 'parties', invoice.partyId);
        batch.update(partyRef, {
          totalDue: increment(-invoice.totalAmount)
        });
        
        await batch.commit();
      }
      
      toast.success(`Invoice marked as ${newStatus}`);
    } catch (error) {
      console.error('Update status error:', error);
      toast.error('Failed to update status');
    } finally {
      setLoading(false);
    }
  };

  const deleteInvoice = async (id: string) => {
    if (!businessId) return;
    
    setLoading(true);
    try {
      const collectionName = activeListTab === 'invoices' ? 'invoices' : 'quotations';
      await deleteDoc(doc(db, 'businesses', businessId, collectionName, id));
      toast.success(`${activeListTab === 'invoices' ? 'Invoice' : 'Quotation'} deleted`);
      setInvoiceToDelete(null);
    } catch (error) {
      toast.error(`Failed to delete ${activeListTab === 'invoices' ? 'invoice' : 'quotation'}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Invoices</h2>
          <p className="text-slate-500">Generate and manage professional invoices.</p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setShowSettings(true)}
            className="p-3 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-xl transition-all shadow-sm"
            title="Invoice Settings"
          >
            <SettingsIcon size={20} />
          </button>
          <button 
            onClick={() => setActiveTab('create')}
            className="flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white px-6 py-3 rounded-xl font-semibold transition-all shadow-lg shadow-emerald-500/20"
          >
            <Plus size={20} />
            Create Invoice
          </button>
        </div>
      </header>

      {/* Tabs */}
      <div className="flex border-b border-slate-200">
        <button 
          onClick={() => {
            setActiveTab('list');
            setActiveListTab('invoices');
          }}
          className={`px-6 py-3 font-medium transition-all border-b-2 ${activeTab === 'list' && activeListTab === 'invoices' ? 'border-emerald-500 text-emerald-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
        >
          Invoices
        </button>
        <button 
          onClick={() => {
            setActiveTab('list');
            setActiveListTab('quotations');
          }}
          className={`px-6 py-3 font-medium transition-all border-b-2 ${activeTab === 'list' && activeListTab === 'quotations' ? 'border-emerald-500 text-emerald-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
        >
          Quotations
        </button>
        <button 
          onClick={() => setActiveTab('create')}
          className={`px-6 py-3 font-medium transition-all border-b-2 ${activeTab === 'create' ? 'border-emerald-500 text-emerald-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
        >
          New {invoiceType === 'invoice' ? 'Invoice' : 'Quotation'}
        </button>
        {activeTab === 'preview' && (
          <button 
            className="px-6 py-3 font-medium transition-all border-b-2 border-emerald-500 text-emerald-600"
          >
            Preview
          </button>
        )}
      </div>

      <AnimatePresence mode="wait">
        {activeTab === 'list' && (
          <motion.div 
            key="list"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-4"
          >
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100">
                      <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Number</th>
                      <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Party</th>
                      <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Date</th>
                      <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Amount</th>
                      {activeListTab === 'invoices' && <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Status</th>}
                      <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(activeListTab === 'invoices' ? invoices : quotations).length === 0 ? (
                      <tr>
                        <td colSpan={activeListTab === 'invoices' ? 6 : 5} className="px-6 py-12 text-center text-slate-500">
                          <FileText size={48} className="mx-auto mb-4 opacity-20" />
                          <p>No {activeListTab} generated yet.</p>
                        </td>
                      </tr>
                    ) : (
                      (activeListTab === 'invoices' ? invoices : quotations).map((inv) => (
                        <tr key={inv.id} className="hover:bg-slate-50/50 transition-colors group">
                          <td className="px-6 py-4 font-mono text-sm text-slate-900">#{inv.invoiceNumber}</td>
                          <td className="px-6 py-4 font-semibold text-slate-900">{inv.partyName}</td>
                          <td className="px-6 py-4 text-sm text-slate-600">{format(new Date(inv.date), 'MMM dd, yyyy')}</td>
                          <td className="px-6 py-4 font-bold text-slate-900">₹{inv.totalAmount.toLocaleString()}</td>
                          {activeListTab === 'invoices' && (
                            <td className="px-6 py-4">
                              <select 
                                value={inv.status}
                                onChange={(e) => updateInvoiceStatus(inv, e.target.value as Invoice['status'])}
                                className={`text-[10px] uppercase tracking-wider font-bold px-2 py-1 rounded-full border-none cursor-pointer focus:ring-0 appearance-none text-center min-w-[80px] ${
                                  inv.status === 'paid' ? 'bg-emerald-100 text-emerald-600' : 
                                  inv.status === 'sent' ? 'bg-blue-100 text-blue-600' : 
                                  inv.status === 'overdue' ? 'bg-red-100 text-red-600' : 'bg-slate-100 text-slate-600'
                                }`}
                              >
                                <option value="draft">Draft</option>
                                <option value="sent">Sent</option>
                                <option value="paid">Paid</option>
                                <option value="overdue">Overdue</option>
                              </select>
                            </td>
                          )}
                          <td className="px-6 py-4 text-right space-x-2">
                            <button 
                              onClick={() => openPreview(inv)}
                              className="p-2 text-slate-400 hover:text-emerald-500 transition-colors"
                              title="View Preview"
                            >
                              <Eye size={18} />
                            </button>
                            <button 
                              onClick={() => downloadPDF(inv)}
                              className="p-2 text-slate-400 hover:text-blue-500 transition-colors"
                              title="Download PDF"
                            >
                              <Download size={18} />
                            </button>
                            <button 
                              onClick={() => setInvoiceToDelete(inv.id)}
                              className="p-2 text-slate-400 hover:text-red-500 transition-colors"
                              title="Delete"
                            >
                              <Trash2 size={18} />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </motion.div>
        )}

        {activeTab === 'create' && (
          <motion.div 
            key="create"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="grid grid-cols-1 lg:grid-cols-3 gap-6"
          >
            <div className="lg:col-span-1 space-y-6">
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 space-y-4">
                <h3 className="font-bold text-slate-900">Document Type</h3>
                <div className="flex gap-2 p-1 bg-slate-100 rounded-xl">
                  <button 
                    onClick={() => setInvoiceType('invoice')}
                    className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${invoiceType === 'invoice' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                  >
                    Invoice
                  </button>
                  <button 
                    onClick={() => setInvoiceType('quotation')}
                    className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${invoiceType === 'quotation' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                  >
                    Quotation
                  </button>
                </div>

                <h3 className="font-bold text-slate-900 pt-2">Billing Method</h3>
                <div className="flex gap-2 p-1 bg-slate-100 rounded-xl">
                  <button 
                    onClick={() => setCreationMode('select')}
                    className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${creationMode === 'select' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                  >
                    Select Ledger
                  </button>
                  <button 
                    onClick={() => setCreationMode('manual')}
                    className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${creationMode === 'manual' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                  >
                    Manual Entry
                  </button>
                </div>

                <div className="space-y-2 pt-4">
                  <label className="text-sm font-medium text-slate-700">Document Number</label>
                  <input 
                    type="text" 
                    value={invoiceNumber}
                    onChange={(e) => setInvoiceNumber(e.target.value)}
                    className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Select Party</label>
                  <select 
                    value={selectedParty}
                    onChange={(e) => setSelectedParty(e.target.value)}
                    className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  >
                    <option value="">Choose a party...</option>
                    {parties.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">Date</label>
                    <input 
                      type="date" 
                      value={invoiceDate}
                      onChange={(e) => setInvoiceDate(e.target.value)}
                      className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">Due Date</label>
                    <input 
                      type="date" 
                      value={dueDate}
                      onChange={(e) => setDueDate(e.target.value)}
                      className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                    />
                  </div>
                </div>

                <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-100">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-emerald-800 font-medium text-sm">Total Amount</span>
                    <span className="text-xl font-bold text-emerald-900">₹{calculateTotal().toLocaleString()}</span>
                  </div>
                  <button 
                    onClick={handleGenerateInvoice}
                    disabled={loading || !selectedParty || (creationMode === 'select' && selectedTransactions.length === 0)}
                    className="w-full bg-emerald-500 hover:bg-emerald-600 text-white py-3 rounded-xl font-bold transition-all shadow-lg shadow-emerald-500/20 disabled:opacity-50"
                  >
                    {loading ? 'Processing...' : `Generate ${invoiceType === 'invoice' ? 'Invoice' : 'Quotation'}`}
                  </button>
                </div>
              </div>
            </div>

            <div className="lg:col-span-2 space-y-4">
              {creationMode === 'select' ? (
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                  <h3 className="font-bold text-slate-900 mb-4">Select Transactions</h3>
                  {!selectedParty ? (
                    <div className="py-12 text-center text-slate-400">
                      <Search size={48} className="mx-auto mb-4 opacity-20" />
                      <p>Select a party to see their unpaid transactions.</p>
                    </div>
                  ) : transactions.length === 0 ? (
                    <div className="py-12 text-center text-slate-400">
                      <CheckCircle2 size={48} className="mx-auto mb-4 text-emerald-500 opacity-20" />
                      <p>No unpaid transactions for this party.</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {transactions.map(t => (
                        <div 
                          key={t.id}
                          onClick={() => toggleTransaction(t.id)}
                          className={`flex items-center justify-between p-4 rounded-xl border cursor-pointer transition-all ${
                            selectedTransactions.includes(t.id) 
                              ? 'border-emerald-500 bg-emerald-50' 
                              : 'border-slate-100 hover:border-slate-200'
                          }`}
                        >
                          <div className="flex items-center gap-4">
                            <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
                              selectedTransactions.includes(t.id) ? 'bg-emerald-500 border-emerald-500' : 'border-slate-300'
                            }`}>
                              {selectedTransactions.includes(t.id) && <Plus size={14} className="text-white rotate-45" />}
                            </div>
                            <div>
                              <p className="font-semibold text-slate-900">{t.description || 'No description'}</p>
                              <p className="text-xs text-slate-500">{format(new Date(t.date), 'MMM dd, yyyy')}</p>
                            </div>
                          </div>
                          <span className={`font-bold ${t.type === 'credit' ? 'text-emerald-600' : 'text-red-600'}`}>
                            {t.type === 'credit' ? '+' : '-'} ₹{t.amount.toLocaleString()}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                  <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                    <div>
                      <h3 className="font-bold text-slate-900">Manual Item Entry</h3>
                      <p className="text-sm text-slate-500">Add items manually for this {invoiceType}.</p>
                    </div>
                    <button 
                      onClick={addManualItem}
                      className="flex items-center gap-2 text-emerald-600 hover:text-emerald-700 font-bold text-sm"
                    >
                      <Plus size={16} />
                      Add Item
                    </button>
                  </div>
                  <div className="p-6 space-y-4">
                    {manualItems.map((item, index) => (
                      <div key={index} className="grid grid-cols-12 gap-4 items-end bg-slate-50 p-4 rounded-xl border border-slate-100">
                        <div className="col-span-12 md:col-span-5 space-y-2">
                          <label className="text-xs font-bold text-slate-500 uppercase">Description</label>
                          <input 
                            type="text"
                            value={item.description}
                            onChange={(e) => updateManualItem(index, 'description', e.target.value)}
                            placeholder="Item description"
                            className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                          />
                        </div>
                        <div className="col-span-4 md:col-span-2 space-y-2">
                          <label className="text-xs font-bold text-slate-500 uppercase">Qty</label>
                          <input 
                            type="number"
                            value={item.quantity}
                            onChange={(e) => updateManualItem(index, 'quantity', parseFloat(e.target.value))}
                            className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                          />
                        </div>
                        <div className="col-span-4 md:col-span-2 space-y-2">
                          <label className="text-xs font-bold text-slate-500 uppercase">Rate</label>
                          <input 
                            type="number"
                            value={item.rate}
                            onChange={(e) => updateManualItem(index, 'rate', parseFloat(e.target.value))}
                            className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                          />
                        </div>
                        <div className="col-span-3 md:col-span-2 space-y-2">
                          <label className="text-xs font-bold text-slate-500 uppercase">Total</label>
                          <div className="px-3 py-2 font-bold text-slate-900">
                            ₹{(item.quantity * item.rate).toLocaleString()}
                          </div>
                        </div>
                        <div className="col-span-1 flex justify-end">
                          <button 
                            onClick={() => removeManualItem(index)}
                            className="p-2 text-slate-400 hover:text-red-500 transition-colors"
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}

        {activeTab === 'preview' && previewInvoice && (
          <motion.div 
            key="preview"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="flex flex-col items-center gap-6"
          >
            <div className="flex gap-4 w-full max-w-[210mm]">
              <button 
                onClick={() => setActiveTab('list')}
                className="flex-1 bg-white border border-slate-200 py-3 rounded-xl font-bold text-slate-600 hover:bg-slate-50 transition-all"
              >
                Back to List
              </button>
              <button 
                onClick={() => downloadPDF(previewInvoice)}
                className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white py-3 rounded-xl font-bold transition-all shadow-lg shadow-emerald-500/20"
              >
                Download PDF
              </button>
            </div>

            {/* Invoice Template */}
            <div 
              ref={invoiceRef}
              className="bg-white w-full max-w-[210mm] min-h-[297mm] p-12"
              style={{ 
                fontFamily: 'Inter, sans-serif', 
                color: '#1e293b',
                border: '1px solid #f1f5f9',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
              }}
            >
              {/* Header */}
              <div className="flex justify-between items-start mb-12">
                <div className="flex gap-6">
                  {settings.logoUrl && (
                    <img src={settings.logoUrl} alt="Logo" className="w-24 h-24 object-contain" referrerPolicy="no-referrer" />
                  )}
                  <div>
                    <h1 className="text-4xl font-black tracking-tighter mb-2" style={{ color: settings.color }}>
                      {settings.companyName || 'BUSINESS NAME'}
                    </h1>
                    <div className="text-sm space-y-1" style={{ color: '#64748b' }}>
                      <p>{settings.address}</p>
                      <p>{settings.phone}</p>
                      <p>{settings.email}</p>
                      {settings.gstin && <p>GSTIN: {settings.gstin}</p>}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <h2 className="text-5xl font-bold uppercase tracking-widest mb-4" style={{ color: '#e2e8f0' }}>
                    {previewInvoice.type === 'quotation' ? 'Quotation' : 'Invoice'}
                  </h2>
                  <div className="space-y-1">
                    <p className="text-sm font-bold" style={{ color: '#0f172a' }}>#{previewInvoice.invoiceNumber}</p>
                    <p className="text-xs" style={{ color: '#64748b' }}>Date: {format(new Date(previewInvoice.date), 'MMM dd, yyyy')}</p>
                    {previewInvoice.type !== 'quotation' && (
                      <p className="text-xs" style={{ color: '#64748b' }}>Due: {format(new Date(previewInvoice.dueDate), 'MMM dd, yyyy')}</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Bill To */}
              <div className="mb-12">
                <h3 className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: '#94a3b8' }}>Bill To</h3>
                <p className="text-xl font-bold" style={{ color: '#0f172a' }}>{previewInvoice.partyName}</p>
                {/* Add party address here if available in party data */}
              </div>

              {/* Table */}
              <table className="w-full mb-12" style={{ borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #0f172a' }}>
                    <th className="py-4 text-left text-xs font-bold uppercase tracking-widest">Description</th>
                    {previewInvoice.items[0]?.quantity !== undefined && (
                      <>
                        <th className="py-4 text-center text-xs font-bold uppercase tracking-widest">Qty</th>
                        <th className="py-4 text-center text-xs font-bold uppercase tracking-widest">Rate</th>
                      </>
                    )}
                    <th className="py-4 text-center text-xs font-bold uppercase tracking-widest">Date</th>
                    <th className="py-4 text-right text-xs font-bold uppercase tracking-widest">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {previewInvoice.items.map((item, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td className="py-4">
                        <p className="font-semibold" style={{ color: '#0f172a' }}>{item.description || 'Service/Product'}</p>
                        <p className="text-xs capitalize" style={{ color: '#64748b' }}>{item.type}</p>
                      </td>
                      {item.quantity !== undefined && (
                        <>
                          <td className="py-4 text-center text-sm" style={{ color: '#475569' }}>{item.quantity}</td>
                          <td className="py-4 text-center text-sm" style={{ color: '#475569' }}>₹{item.rate?.toLocaleString()}</td>
                        </>
                      )}
                      <td className="py-4 text-center text-sm" style={{ color: '#475569' }}>
                        {format(new Date(item.date), 'MMM dd, yyyy')}
                      </td>
                      <td className="py-4 text-right font-bold" style={{ color: '#0f172a' }}>
                        ₹{item.amount.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Summary */}
              <div className="flex justify-end mb-12">
                <div className="w-64 space-y-3">
                  <div className="flex justify-between" style={{ color: '#64748b' }}>
                    <span>Subtotal</span>
                    <span>₹{previewInvoice.totalAmount.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between" style={{ color: '#64748b' }}>
                    <span>Tax (0%)</span>
                    <span>₹0</span>
                  </div>
                  <div className="flex justify-between items-center pt-3" style={{ borderTop: '2px solid #0f172a' }}>
                    <span className="font-bold" style={{ color: '#0f172a' }}>Total</span>
                    <span className="text-2xl font-black" style={{ color: '#0f172a' }}>₹{previewInvoice.totalAmount.toLocaleString()}</span>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="mt-auto pt-12 text-center" style={{ borderTop: '1px solid #f1f5f9' }}>
                <p className="text-sm" style={{ color: '#64748b' }}>{settings.footerText || 'Thank you for your business!'}</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Hidden Download Template */}
      <div style={{ position: 'absolute', left: '-9999px', top: '-9999px', pointerEvents: 'none' }}>
        {invoiceToDownload && (
          <div 
            ref={downloadRef}
            className="bg-white w-[210mm] min-h-[297mm] p-12"
            style={{ 
              fontFamily: 'Inter, sans-serif', 
              color: '#1e293b'
            }}
          >
            {/* Header */}
            <div className="flex justify-between items-start mb-12">
              <div className="flex gap-6">
                {settings.logoUrl && (
                  <img src={settings.logoUrl} alt="Logo" className="w-24 h-24 object-contain" referrerPolicy="no-referrer" />
                )}
                <div>
                  <h1 className="text-4xl font-black tracking-tighter mb-2" style={{ color: settings.color }}>
                    {settings.companyName || 'BUSINESS NAME'}
                  </h1>
                  <div className="text-sm space-y-1" style={{ color: '#64748b' }}>
                    <p>{settings.address}</p>
                    <p>{settings.phone}</p>
                    <p>{settings.email}</p>
                    {settings.gstin && <p>GSTIN: {settings.gstin}</p>}
                  </div>
                </div>
              </div>
              <div className="text-right">
                <h2 className="text-5xl font-bold uppercase tracking-widest mb-4" style={{ color: '#e2e8f0' }}>Invoice</h2>
                <div className="space-y-1">
                  <p className="text-sm font-bold" style={{ color: '#0f172a' }}>#{invoiceToDownload.invoiceNumber}</p>
                  <p className="text-xs" style={{ color: '#64748b' }}>Date: {format(new Date(invoiceToDownload.date), 'MMM dd, yyyy')}</p>
                  <p className="text-xs" style={{ color: '#64748b' }}>Due: {format(new Date(invoiceToDownload.dueDate), 'MMM dd, yyyy')}</p>
                </div>
              </div>
            </div>

            {/* Bill To */}
            <div className="mb-12">
              <h3 className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: '#94a3b8' }}>Bill To</h3>
              <p className="text-xl font-bold" style={{ color: '#0f172a' }}>{invoiceToDownload.partyName}</p>
            </div>

            {/* Table */}
            <table className="w-full mb-12" style={{ borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #0f172a' }}>
                  <th className="py-4 text-left text-xs font-bold uppercase tracking-widest">Description</th>
                  <th className="py-4 text-center text-xs font-bold uppercase tracking-widest">Date</th>
                  <th className="py-4 text-right text-xs font-bold uppercase tracking-widest">Amount</th>
                </tr>
              </thead>
              <tbody>
                {invoiceToDownload.items.map((item, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td className="py-4">
                      <p className="font-semibold" style={{ color: '#0f172a' }}>{item.description || 'Service/Product'}</p>
                      <p className="text-xs capitalize" style={{ color: '#64748b' }}>{item.type}</p>
                    </td>
                    <td className="py-4 text-center text-sm" style={{ color: '#475569' }}>
                      {format(new Date(item.date), 'MMM dd, yyyy')}
                    </td>
                    <td className="py-4 text-right font-bold" style={{ color: '#0f172a' }}>
                      ₹{item.amount.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Summary */}
            <div className="flex justify-end mb-12">
              <div className="w-64 space-y-3">
                <div className="flex justify-between" style={{ color: '#64748b' }}>
                  <span>Subtotal</span>
                  <span>₹{invoiceToDownload.totalAmount.toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-center pt-3" style={{ borderTop: '2px solid #0f172a' }}>
                  <span className="font-bold" style={{ color: '#0f172a' }}>Total</span>
                  <span className="text-2xl font-black" style={{ color: '#0f172a' }}>₹{invoiceToDownload.totalAmount.toLocaleString()}</span>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="mt-auto pt-12 text-center" style={{ borderTop: '1px solid #f1f5f9' }}>
              <p className="text-sm" style={{ color: '#64748b' }}>{settings.footerText || 'Thank you for your business!'}</p>
            </div>
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {invoiceToDelete && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl"
          >
            <div className="flex items-center gap-4 text-red-500 mb-4">
              <div className="p-3 bg-red-50 rounded-xl">
                <Trash2 size={24} />
              </div>
              <h3 className="text-xl font-bold text-slate-900">Delete Invoice?</h3>
            </div>
            <p className="text-slate-500 mb-6">
              Are you sure you want to delete this invoice? This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <button 
                onClick={() => setInvoiceToDelete(null)}
                className="flex-1 px-6 py-3 border border-slate-200 rounded-xl font-bold text-slate-600 hover:bg-slate-50 transition-all"
              >
                Cancel
              </button>
              <button 
                onClick={() => deleteInvoice(invoiceToDelete)}
                disabled={loading}
                className="flex-1 bg-red-500 hover:bg-red-600 text-white py-3 rounded-xl font-bold transition-all disabled:opacity-50 shadow-lg shadow-red-500/20"
              >
                {loading ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-2xl w-full max-w-6xl overflow-hidden shadow-2xl flex flex-col md:flex-row h-[90vh]"
          >
            {/* Settings Panel */}
            <div className="flex-1 flex flex-col border-r border-slate-100">
              <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                <h3 className="text-xl font-bold text-slate-900">Invoice Customization</h3>
                <button onClick={() => setShowSettings(false)} className="text-slate-400 hover:text-slate-600 md:hidden">
                  <Plus size={24} className="rotate-45" />
                </button>
              </div>
              
              <div className="flex-1 p-6 space-y-6 overflow-y-auto">
                {/* Logo Upload */}
                <div className="space-y-3">
                  <label className="text-sm font-bold text-slate-700 uppercase tracking-wider">Company Logo</label>
                  <div className="flex items-center gap-4">
                    <div className="w-20 h-20 rounded-xl border-2 border-dashed border-slate-200 flex items-center justify-center overflow-hidden bg-slate-50 relative group">
                      {settings.logoUrl ? (
                        <>
                          <img src={settings.logoUrl} alt="Logo" className="w-full h-full object-contain" referrerPolicy="no-referrer" />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <button 
                              onClick={() => setSettings(prev => ({ ...prev, logoUrl: undefined }))}
                              className="text-white p-1 hover:text-red-400"
                            >
                              <Plus size={20} className="rotate-45" />
                            </button>
                          </div>
                        </>
                      ) : (
                        <ImageIcon className="text-slate-300" size={32} />
                      )}
                    </div>
                    <div className="flex-1">
                      <label className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer transition-all">
                        <Upload size={16} />
                        {uploadingLogo ? 'Uploading...' : 'Upload Logo'}
                        <input 
                          type="file" 
                          className="hidden" 
                          accept="image/*"
                          onChange={handleLogoUpload}
                          disabled={uploadingLogo}
                        />
                      </label>
                      <p className="text-xs text-slate-400 mt-2">Recommended: Square PNG/JPG, max 2MB</p>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">Company Name</label>
                    <input 
                      type="text" 
                      value={settings.companyName}
                      onChange={(e) => setSettings({...settings, companyName: e.target.value})}
                      className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500/20"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">Address</label>
                    <textarea 
                      value={settings.address}
                      onChange={(e) => setSettings({...settings, address: e.target.value})}
                      rows={2}
                      className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500/20"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-700">Phone</label>
                      <input 
                        type="text" 
                        value={settings.phone}
                        onChange={(e) => setSettings({...settings, phone: e.target.value})}
                        className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500/20"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-700">Email</label>
                      <input 
                        type="email" 
                        value={settings.email}
                        onChange={(e) => setSettings({...settings, email: e.target.value})}
                        className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500/20"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">GSTIN (Optional)</label>
                    <input 
                      type="text" 
                      value={settings.gstin}
                      onChange={(e) => setSettings({...settings, gstin: e.target.value})}
                      className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500/20"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">Brand Color</label>
                    <div className="flex gap-2">
                      <input 
                        type="color" 
                        value={settings.color}
                        onChange={(e) => setSettings({...settings, color: e.target.value})}
                        className="w-12 h-10 p-1 rounded-lg border border-slate-200 cursor-pointer"
                      />
                      <input 
                        type="text" 
                        value={settings.color}
                        onChange={(e) => setSettings({...settings, color: e.target.value})}
                        className="flex-1 px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500/20"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">Footer Text</label>
                    <input 
                      type="text" 
                      value={settings.footerText}
                      onChange={(e) => setSettings({...settings, footerText: e.target.value})}
                      className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500/20"
                      placeholder="e.g. Thank you for your business!"
                    />
                  </div>
                </div>
              </div>

              <div className="p-6 border-t border-slate-100 flex gap-3">
                <button 
                  onClick={() => setShowSettings(false)}
                  className="flex-1 px-6 py-3 border border-slate-200 rounded-xl font-bold text-slate-600 hover:bg-slate-50 transition-all"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleSaveSettings}
                  disabled={loading}
                  className="flex-[2] bg-emerald-500 hover:bg-emerald-600 text-white py-3 rounded-xl font-bold transition-all disabled:opacity-50 shadow-lg shadow-emerald-500/20"
                >
                  {loading ? 'Saving...' : 'Save Settings'}
                </button>
              </div>
            </div>

            {/* Preview Panel */}
            <div className="hidden md:flex flex-1 bg-slate-50 flex-col">
              <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-white">
                <h3 className="text-sm font-bold text-slate-500 uppercase tracking-widest">Live Preview</h3>
                <button onClick={() => setShowSettings(false)} className="text-slate-400 hover:text-slate-600">
                  <Plus size={24} className="rotate-45" />
                </button>
              </div>
              <div className="flex-1 overflow-auto p-8 flex justify-center">
                <div className="bg-white w-full max-w-[160mm] shadow-xl border border-slate-200 p-8 text-[10px] origin-top scale-[0.85]">
                  {/* Preview Header */}
                  <div className="flex justify-between items-start mb-8">
                    <div className="flex gap-4">
                      {settings.logoUrl && (
                        <img src={settings.logoUrl} alt="Logo" className="w-12 h-12 object-contain" referrerPolicy="no-referrer" />
                      )}
                      <div>
                        <h1 className="text-xl font-black tracking-tighter mb-1" style={{ color: settings.color }}>
                          {settings.companyName || 'BUSINESS NAME'}
                        </h1>
                        <div className="text-slate-500 space-y-0.5">
                          <p>{settings.address || 'Company Address'}</p>
                          <p>{settings.phone || 'Phone Number'}</p>
                          <p>{settings.email || 'Email Address'}</p>
                          {settings.gstin && <p>GSTIN: {settings.gstin}</p>}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <h2 className="text-2xl font-bold text-slate-200 uppercase tracking-widest mb-2">Invoice</h2>
                      <div className="space-y-0.5">
                        <p className="font-bold text-slate-900">#INV-000001</p>
                        <p className="text-slate-500">Date: {format(new Date(), 'MMM dd, yyyy')}</p>
                      </div>
                    </div>
                  </div>

                  {/* Preview Bill To */}
                  <div className="mb-8">
                    <h3 className="font-bold text-slate-400 uppercase tracking-widest mb-2">Bill To</h3>
                    <p className="text-sm font-bold text-slate-900">Sample Customer Name</p>
                  </div>

                  {/* Preview Table */}
                  <table className="w-full mb-8">
                    <thead>
                      <tr className="border-b border-slate-900">
                        <th className="py-2 text-left uppercase tracking-widest">Description</th>
                        <th className="py-2 text-right uppercase tracking-widest">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      <tr>
                        <td className="py-2">
                          <p className="font-semibold text-slate-900">Sample Product/Service</p>
                          <p className="text-slate-500">Description of the service provided</p>
                        </td>
                        <td className="py-2 text-right font-bold text-slate-900">₹1,000.00</td>
                      </tr>
                    </tbody>
                  </table>

                  {/* Preview Summary */}
                  <div className="flex justify-end mb-8">
                    <div className="w-40 space-y-1">
                      <div className="flex justify-between text-slate-500">
                        <span>Subtotal</span>
                        <span>₹1,000.00</span>
                      </div>
                      <div className="flex justify-between items-center pt-2 border-t border-slate-900">
                        <span className="font-bold text-slate-900">Total</span>
                        <span className="text-lg font-black text-slate-900">₹1,000.00</span>
                      </div>
                    </div>
                  </div>

                  {/* Preview Footer */}
                  <div className="mt-auto pt-8 border-t border-slate-100 text-center">
                    <p className="text-slate-500 italic">{settings.footerText || 'Thank you for your business!'}</p>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
};

export default Invoices;
