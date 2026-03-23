import React, { useState } from 'react';
import { AuthProvider, useAuth } from './AuthContext';
import { NavigationProvider, useNavigation } from './NavigationContext';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import Accounting from './pages/Accounting';
import PartyLedger from './pages/PartyLedger';
import Tasks from './pages/Tasks';
import Documents from './pages/Documents';
import Invoices from './pages/Invoices';
import Reports from './pages/Reports';
import AdminPanel from './pages/AdminPanel';
import Subscription from './pages/Subscription';
import Support from './pages/Support';
import { Toaster } from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { LogIn, ShieldCheck, Zap, Globe, Smartphone, AlertCircle } from 'lucide-react';
import { isAfter } from 'date-fns';

const AppContent: React.FC = () => {
  const { user, profile, loading, login, activeBusiness } = useAuth();
  const { activeTab, setActiveTab } = useNavigation();

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-500 font-medium animate-pulse">Initializing VENDORISTICS...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col lg:flex-row">
        {/* Left Side - Hero */}
        <div className="lg:w-1/2 bg-slate-900 p-12 flex flex-col justify-between text-white relative overflow-hidden">
          <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
          <div className="absolute bottom-0 left-0 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2" />
          
          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-12">
              <div className="w-12 h-12 bg-emerald-500 rounded-xl flex items-center justify-center font-bold text-2xl">V</div>
              <h1 className="text-2xl font-bold tracking-tight">VENDORISTICS</h1>
            </div>
            
            <motion.div 
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="max-w-md"
            >
              <h2 className="text-5xl font-bold leading-tight mb-6">
                Manage your business with <span className="text-emerald-500">precision.</span>
              </h2>
              <p className="text-slate-400 text-lg mb-10">
                The all-in-one platform for small business owners to track finances, manage tasks, and collaborate with their team.
              </p>
              
              <div className="space-y-6">
                <div className="flex items-center gap-4">
                  <div className="p-2 bg-emerald-500/10 rounded-lg text-emerald-500">
                    <ShieldCheck size={24} />
                  </div>
                  <p className="font-medium">Secure Google Authentication</p>
                </div>
                <div className="flex items-center gap-4">
                  <div className="p-2 bg-indigo-500/10 rounded-lg text-indigo-500">
                    <Zap size={24} />
                  </div>
                  <p className="font-medium">Real-time Financial Tracking</p>
                </div>
                <div className="flex items-center gap-4">
                  <div className="p-2 bg-amber-500/10 rounded-lg text-amber-500">
                    <Smartphone size={24} />
                  </div>
                  <p className="font-medium">Mobile-First Responsive Design</p>
                </div>
              </div>
            </motion.div>
          </div>
          
          <div className="relative z-10 text-slate-500 text-sm">
            © 2026 VENDORISTICS. Built for modern entrepreneurs.
          </div>
        </div>

        {/* Right Side - Login */}
        <div className="lg:w-1/2 flex items-center justify-center p-8">
          <motion.div 
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="w-full max-w-md bg-white p-10 rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 text-center"
          >
            <h3 className="text-3xl font-bold text-slate-900 mb-2">Welcome Back</h3>
            <p className="text-slate-500 mb-10">Sign in to access your business dashboard</p>
            
            <button 
              onClick={login}
              className="w-full flex items-center justify-center gap-4 bg-white hover:bg-slate-50 text-slate-900 border-2 border-slate-100 py-4 rounded-2xl font-bold transition-all hover:shadow-lg active:scale-95"
            >
              <img src="https://www.google.com/favicon.ico" alt="Google" className="w-6 h-6" />
              Continue with Google
            </button>
            
            <div className="mt-10 pt-10 border-t border-slate-50">
              <p className="text-xs text-slate-400 uppercase tracking-widest font-bold mb-6">Trusted by businesses worldwide</p>
              <div className="flex justify-center gap-8 opacity-30 grayscale">
                <Globe size={24} />
                <ShieldCheck size={24} />
                <Zap size={24} />
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    );
  }

  const renderContent = () => {
    const trialEndsAt = activeBusiness?.trialEndsAt ? new Date(activeBusiness.trialEndsAt) : null;
    const isTrial = activeBusiness?.subscriptionStatus === 'trial';
    const isActive = activeBusiness?.subscriptionStatus === 'active';
    const isExpired = activeBusiness?.subscriptionStatus === 'expired' || 
                      (isTrial && trialEndsAt && isAfter(new Date(), trialEndsAt));

    if (isExpired && activeTab !== 'subscription') {
      return <Subscription />;
    }

    switch (activeTab) {
      case 'dashboard': return <Dashboard />;
      case 'accounting': return <Accounting />;
      case 'ledger': return <PartyLedger />;
      case 'tasks': return <Tasks />;
      case 'documents': return <Documents />;
      case 'invoices': return <Invoices />;
      case 'reports': return <Reports />;
      case 'subscription': return <Subscription />;
      case 'support': return <Support />;
      case 'admin': return profile?.role === 'owner' ? <AdminPanel /> : <Dashboard />;
      default: return <Dashboard />;
    }
  };

  const trialEndsAt = activeBusiness?.trialEndsAt ? new Date(activeBusiness.trialEndsAt) : null;
  const isTrial = activeBusiness?.subscriptionStatus === 'trial';
  const isExpired = activeBusiness?.subscriptionStatus === 'expired' || 
                    (isTrial && trialEndsAt && isAfter(new Date(), trialEndsAt));

  return (
    <div className="min-h-screen bg-slate-50 flex">
      <Sidebar />
      
      <main className="flex-1 lg:ml-64 p-4 lg:p-10">
        <div className="max-w-7xl mx-auto">
          {isTrial && !isExpired && (
            <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-center justify-between">
              <div className="flex items-center gap-3 text-amber-800">
                <AlertCircle size={20} />
                <p className="font-medium">
                  You are on a 7-day free trial. Upgrade to Premium for ₹999 to keep all features.
                </p>
              </div>
              <button 
                onClick={() => setActiveTab('subscription')}
                className="px-4 py-2 bg-amber-600 text-white rounded-xl text-sm font-bold hover:bg-amber-700 transition-colors"
              >
                Upgrade Now
              </button>
            </div>
          )}

          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ y: 10, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -10, opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              {renderContent()}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <NavigationProvider>
        <AppContent />
        <Toaster position="top-right" />
      </NavigationProvider>
    </AuthProvider>
  );
}
