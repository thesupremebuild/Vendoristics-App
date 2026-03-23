import React from 'react';
import { useAuth } from '../AuthContext';
import { useNavigation } from '../NavigationContext';
import { 
  LayoutDashboard, 
  Receipt, 
  Users, 
  CheckSquare, 
  FileText, 
  Settings, 
  BarChart3,
  LogOut,
  Menu,
  X,
  CreditCard,
  Zap,
  MessageSquare
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface SidebarProps {}

const Sidebar: React.FC<SidebarProps> = () => {
  const { profile, logout, businesses, businessId, switchBusiness, createBusiness } = useAuth();
  const { activeTab, setActiveTab } = useNavigation();
  const [isOpen, setIsOpen] = React.useState(false);
  const [showNewBizModal, setShowNewBizModal] = React.useState(false);
  const [newBizName, setNewBizName] = React.useState('');

  const currentBusiness = businesses.find(b => b.id === businessId);

  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'accounting', label: 'Accounting', icon: Receipt },
    { id: 'ledger', label: 'Party Ledger', icon: Users },
    { id: 'tasks', label: 'Tasks', icon: CheckSquare },
    { id: 'documents', label: 'Documents', icon: FileText },
    { id: 'invoices', label: 'Invoices', icon: FileText },
    { id: 'reports', label: 'Reports', icon: BarChart3 },
    { id: 'subscription', label: 'Subscription', icon: CreditCard },
    { id: 'support', label: 'Support', icon: MessageSquare },
  ];

  if (profile?.role === 'owner') {
    menuItems.push({ id: 'admin', label: 'Admin Panel', icon: Settings });
  }

  const handleCreateBusiness = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBizName.trim()) return;
    await createBusiness(newBizName);
    setNewBizName('');
    setShowNewBizModal(false);
  };

  const toggleSidebar = () => setIsOpen(!isOpen);

  return (
    <>
      {/* Mobile Menu Button */}
      <button 
        onClick={toggleSidebar}
        className="lg:hidden fixed top-4 left-4 z-50 p-2 bg-white rounded-md shadow-md"
      >
        {isOpen ? <X size={24} /> : <Menu size={24} />}
      </button>

      {/* Sidebar */}
      <AnimatePresence>
        {(isOpen || window.innerWidth >= 1024) && (
          <motion.aside
            initial={{ x: -300 }}
            animate={{ x: 0 }}
            exit={{ x: -300 }}
            className={`fixed inset-y-0 left-0 z-40 w-64 bg-slate-900 text-white p-6 flex flex-col transition-all duration-300 lg:translate-x-0 ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}
          >
            <div className="flex items-center gap-3 mb-8">
              <div className="w-10 h-10 bg-emerald-500 rounded-lg flex items-center justify-center font-bold text-xl shrink-0">V</div>
              <div className="overflow-hidden">
                <h1 className="text-xl font-bold tracking-tight truncate">VENDORISTICS</h1>
                {currentBusiness?.subscriptionStatus === 'active' && (
                  <div className="flex items-center gap-1 text-[10px] text-emerald-400 font-bold uppercase tracking-widest">
                    <Zap size={10} fill="currentColor" />
                    Premium
                  </div>
                )}
                {currentBusiness?.subscriptionStatus === 'trial' && (
                  <div className="flex items-center gap-1 text-[10px] text-amber-400 font-bold uppercase tracking-widest">
                    Trial Mode
                  </div>
                )}
              </div>
            </div>

            {/* Business Switcher */}
            <div className="mb-8 px-2">
              <label className="text-[10px] uppercase tracking-wider font-bold text-slate-500 mb-2 block">Active Business</label>
              <select 
                value={businessId || ''}
                onChange={(e) => {
                  if (e.target.value === 'new') {
                    setShowNewBizModal(true);
                  } else {
                    switchBusiness(e.target.value);
                  }
                }}
                className="w-full bg-slate-800 border-none rounded-xl px-3 py-2.5 text-sm font-medium focus:ring-2 focus:ring-emerald-500/50 appearance-none cursor-pointer"
              >
                {businesses.map(biz => (
                  <option key={biz.id} value={biz.id}>{biz.name}</option>
                ))}
                <option value="new">+ Create New Business</option>
              </select>
            </div>

            <nav className="flex-1 space-y-2 overflow-y-auto">
              {menuItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => {
                    setActiveTab(item.id);
                    setIsOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors ${
                    activeTab === item.id 
                      ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20' 
                      : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  <item.icon size={20} />
                  <span className="font-medium">{item.label}</span>
                </button>
              ))}
            </nav>

            <div className="mt-auto pt-6 border-t border-slate-800">
              <div className="flex items-center gap-3 mb-6 px-2">
                <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center text-sm font-bold">
                  {profile?.displayName?.charAt(0) || 'U'}
                </div>
                <div className="overflow-hidden">
                  <p className="text-sm font-semibold truncate">{profile?.displayName}</p>
                  <p className="text-xs text-slate-500 capitalize">{profile?.role}</p>
                </div>
              </div>
              <button
                onClick={logout}
                className="w-full flex items-center gap-3 px-4 py-3 text-slate-400 hover:text-red-400 hover:bg-red-400/10 rounded-xl transition-colors"
              >
                <LogOut size={20} />
                <span className="font-medium">Logout</span>
              </button>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Overlay for mobile */}
      {isOpen && (
        <div 
          className="lg:hidden fixed inset-0 bg-black/50 z-30 backdrop-blur-sm"
          onClick={toggleSidebar}
        />
      )}

      {/* New Business Modal */}
      {showNewBizModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-xl font-bold text-slate-900">Create New Business</h3>
              <button onClick={() => setShowNewBizModal(false)} className="text-slate-400 hover:text-slate-600">
                <X size={24} />
              </button>
            </div>
            <form onSubmit={handleCreateBusiness} className="p-6 space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700 text-left block">Business Name</label>
                <input 
                  required
                  autoFocus
                  type="text" 
                  value={newBizName}
                  onChange={(e) => setNewBizName(e.target.value)}
                  className="w-full px-4 py-2 rounded-xl border border-slate-200 text-slate-900 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  placeholder="Enter business name"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button 
                  type="button"
                  onClick={() => setShowNewBizModal(false)}
                  className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-semibold hover:bg-slate-50 transition-all"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2.5 rounded-xl font-semibold transition-all shadow-lg shadow-emerald-500/20"
                >
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
};

export default Sidebar;
