import React, { useState, useEffect } from 'react';
import { useAuth } from '../AuthContext';
import { db, storage, ref, uploadBytes, getDownloadURL, deleteObject, uploadBytesResumable } from '../firebase';
import { collection, addDoc, onSnapshot, query, orderBy, deleteDoc, doc } from 'firebase/firestore';
import { Upload, File, Trash2, Download, Search, Folder, Plus, X } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'react-hot-toast';

const Documents: React.FC = () => {
  const { businessId, profile } = useAuth();
  const [documents, setDocuments] = useState<any[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [formData, setFormData] = useState({ name: '', category: 'Invoice' });
  const [searchQuery, setSearchQuery] = useState('');
  const [docToDelete, setDocToDelete] = useState<any>(null);

  useEffect(() => {
    if (!businessId) return;
    const docsRef = collection(db, 'businesses', businessId, 'documents');
    const unsubscribe = onSnapshot(query(docsRef, orderBy('date', 'desc')), (snapshot) => {
      setDocuments(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsubscribe();
  }, [businessId]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);
      if (!formData.name) {
        setFormData({ ...formData, name: file.name });
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!businessId || !selectedFile) {
      toast.error('Please select a file');
      return;
    }
    
    setLoading(true);
    try {
      // 1. Upload to Firebase Storage
      const storageRef = ref(storage, `businesses/${businessId}/documents/${Date.now()}_${selectedFile.name}`);
      
      const uploadTask = uploadBytesResumable(storageRef, selectedFile);
      
      await new Promise((resolve, reject) => {
        uploadTask.on('state_changed', 
          (snapshot) => {
            const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
            console.log('Upload is ' + progress + '% done');
          }, 
          (error) => {
            console.error('Detailed upload error:', {
              code: error.code,
              message: error.message,
              name: error.name,
              serverResponse: (error as any).serverResponse
            });
            reject(error);
          }, 
          () => {
            resolve(uploadTask.snapshot.ref);
          }
        );
      });

      const downloadUrl = await getDownloadURL(storageRef);

      // 2. Save metadata to Firestore
      await addDoc(collection(db, 'businesses', businessId, 'documents'), {
        name: formData.name,
        category: formData.category,
        url: downloadUrl,
        storagePath: storageRef.fullPath,
        uploadedBy: profile?.displayName,
        date: new Date().toISOString(),
        businessId,
        size: selectedFile.size,
        type: selectedFile.type
      });

      toast.success('Document uploaded successfully');
      closeModal();
    } catch (error) {
      console.error('Upload error:', error);
      toast.error('Failed to upload document. Please check your connection.');
    } finally {
      setLoading(false);
    }
  };

  const closeModal = () => {
    setShowModal(false);
    setSelectedFile(null);
    setFormData({ name: '', category: 'Invoice' });
  };

  const deleteDocItem = async (document: any) => {
    try {
      // 1. Delete from Storage if path exists
      if (document.storagePath) {
        const storageRef = ref(storage, document.storagePath);
        await deleteObject(storageRef);
      }
      
      // 2. Delete from Firestore
      await deleteDoc(doc(db, 'businesses', businessId!, 'documents', document.id));
      toast.success('Document deleted');
      setDocToDelete(null);
    } catch (error) {
      console.error('Delete error:', error);
      toast.error('Delete failed');
    }
  };

  const filteredDocuments = documents.filter(doc => 
    doc.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    doc.category.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Documents</h2>
          <p className="text-slate-500">Store and organize business files.</p>
        </div>
        <button 
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white px-6 py-3 rounded-xl font-semibold transition-all shadow-lg shadow-emerald-500/20"
        >
          <Upload size={20} />
          Upload File
        </button>
      </header>

      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
        <input 
          type="text" 
          placeholder="Search documents by name or category..." 
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-12 pr-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {filteredDocuments.map(doc => (
          <div key={doc.id} className="bg-white p-4 rounded-2xl border border-slate-100 hover:border-emerald-200 transition-all group">
            <div className="aspect-square bg-slate-50 rounded-xl flex items-center justify-center mb-4 relative overflow-hidden">
              <File size={48} className="text-slate-300" />
              <div className="absolute inset-0 bg-emerald-500/0 group-hover:bg-emerald-500/10 transition-colors flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                <a 
                  href={doc.url} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="p-2 bg-white rounded-lg shadow-md text-emerald-600 hover:scale-110 transition-transform"
                >
                  <Download size={20} />
                </a>
                <button 
                  onClick={() => setDocToDelete(doc)}
                  className="p-2 bg-white rounded-lg shadow-md text-red-500 hover:scale-110 transition-transform"
                >
                  <Trash2 size={20} />
                </button>
              </div>
            </div>
            <h3 className="font-bold text-slate-900 truncate">{doc.name}</h3>
            <div className="flex items-center justify-between mt-2">
              <span className="text-[10px] uppercase font-bold text-slate-400 flex items-center gap-1">
                <Folder size={10} />
                {doc.category}
              </span>
              <span className="text-[10px] text-slate-400">
                {format(new Date(doc.date), 'MMM dd')}
              </span>
            </div>
          </div>
        ))}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-xl font-bold text-slate-900">Upload Document</h3>
              <button onClick={closeModal} className="text-slate-400 hover:text-slate-600">
                <Plus size={24} className="rotate-45" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Select File</label>
                <div className="relative">
                  <input 
                    type="file" 
                    onChange={handleFileChange}
                    className="hidden" 
                    id="file-upload"
                  />
                  <label 
                    htmlFor="file-upload"
                    className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-slate-200 rounded-2xl cursor-pointer hover:bg-slate-50 transition-colors"
                  >
                    {selectedFile ? (
                      <div className="flex flex-col items-center">
                        <File className="text-emerald-500 mb-2" size={32} />
                        <span className="text-sm font-medium text-slate-900 truncate max-w-[200px]">
                          {selectedFile.name}
                        </span>
                        <span className="text-xs text-slate-400">
                          {(selectedFile.size / 1024).toFixed(1)} KB
                        </span>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center">
                        <Upload className="text-slate-300 mb-2" size={32} />
                        <span className="text-sm text-slate-500">Click to browse or drag and drop</span>
                      </div>
                    )}
                  </label>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Document Name</label>
                <input 
                  required
                  type="text" 
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  placeholder="e.g. March Invoice"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Category</label>
                <select 
                  value={formData.category}
                  onChange={(e) => setFormData({...formData, category: e.target.value})}
                  className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                >
                  <option value="Invoice">Invoice</option>
                  <option value="Bill">Bill</option>
                  <option value="Agreement">Agreement</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <button 
                disabled={loading || !selectedFile}
                type="submit"
                className="w-full bg-emerald-500 hover:bg-emerald-600 text-white py-3 rounded-xl font-bold transition-all disabled:opacity-50"
              >
                {loading ? 'Uploading...' : 'Save Document'}
              </button>
            </form>
          </div>
        </div>
      )}

      {docToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl p-6">
            <h3 className="text-xl font-bold text-slate-900 mb-2">Delete Document?</h3>
            <p className="text-slate-500 mb-6">Are you sure you want to delete this document? This action cannot be undone.</p>
            <div className="flex gap-3">
              <button 
                onClick={() => setDocToDelete(null)}
                className="flex-1 px-4 py-2 border border-slate-200 text-slate-600 rounded-xl font-semibold hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={() => deleteDocItem(docToDelete)}
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

export default Documents;
