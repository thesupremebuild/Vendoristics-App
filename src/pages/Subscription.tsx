import React from 'react';
import { useAuth } from '../AuthContext';
import { CreditCard, CheckCircle2, Clock, AlertTriangle } from 'lucide-react';
import { formatDistanceToNow, isAfter } from 'date-fns';

const Subscription: React.FC = () => {
  const { activeBusiness, updateSubscription } = useAuth();

  if (!activeBusiness) return null;

  const trialEndsAt = activeBusiness.trialEndsAt ? new Date(activeBusiness.trialEndsAt) : null;
  const isTrial = activeBusiness.subscriptionStatus === 'trial';
  const isActive = activeBusiness.subscriptionStatus === 'active';
  const isExpired = activeBusiness.subscriptionStatus === 'expired' || 
                    (isTrial && trialEndsAt && isAfter(new Date(), trialEndsAt));

  const handlePayment = async () => {
    // In a real app, this would trigger a payment gateway (e.g., Razorpay, Stripe)
    // For this demo, we'll simulate a successful payment
    await updateSubscription('active');
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Subscription & Billing</h1>
        <p className="text-gray-600 mt-2">Manage your business subscription and trial status.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Current Status Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
          <h2 className="text-xl font-semibold mb-6">Current Status</h2>
          
          <div className="space-y-6">
            <div className="flex items-center gap-4">
              <div className={`p-3 rounded-xl ${isActive ? 'bg-emerald-50 text-emerald-600' : isExpired ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600'}`}>
                {isActive ? <CheckCircle2 size={24} /> : isExpired ? <AlertTriangle size={24} /> : <Clock size={24} />}
              </div>
              <div>
                <p className="text-sm text-gray-500 uppercase tracking-wider font-semibold">Plan</p>
                <p className="text-lg font-bold text-gray-900">
                  {isActive ? 'Premium Plan' : isExpired ? 'Trial Expired' : 'Free Trial'}
                </p>
              </div>
            </div>

            {isTrial && trialEndsAt && !isExpired && (
              <div className="p-4 bg-blue-50 rounded-xl border border-blue-100">
                <p className="text-blue-800 font-medium">
                  Your trial ends in {formatDistanceToNow(trialEndsAt)}.
                </p>
                <p className="text-blue-600 text-sm mt-1">
                  Upgrade now to keep using all premium features.
                </p>
              </div>
            )}

            {isExpired && (
              <div className="p-4 bg-red-50 rounded-xl border border-red-100">
                <p className="text-red-800 font-medium">
                  Your trial has expired.
                </p>
                <p className="text-red-600 text-sm mt-1">
                  Please upgrade to Premium to continue using the application.
                </p>
              </div>
            )}

            {isActive && (
              <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-100">
                <p className="text-emerald-800 font-medium">
                  Your subscription is active!
                </p>
                <p className="text-emerald-600 text-sm mt-1">
                  Thank you for being a premium member.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Upgrade Card */}
        <div className="bg-gray-900 rounded-2xl shadow-xl p-8 text-white relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10">
            <CreditCard size={120} />
          </div>
          
          <div className="relative z-10">
            <h2 className="text-2xl font-bold mb-2">Premium Plan</h2>
            <div className="flex items-baseline gap-1 mb-6">
              <span className="text-4xl font-bold">₹999</span>
              <span className="text-gray-400">/one-time</span>
            </div>

            <ul className="space-y-4 mb-8">
              {[
                'Unlimited Invoices & Quotations',
                'Detailed Financial Analytics',
                'Document Storage (Unlimited)',
                'Team Collaboration',
                'Priority Support'
              ].map((feature, i) => (
                <li key={i} className="flex items-center gap-3 text-gray-300">
                  <CheckCircle2 size={18} className="text-emerald-400" />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>

            {!isActive && (
              <button
                onClick={handlePayment}
                className="w-full py-4 bg-white text-gray-900 rounded-xl font-bold hover:bg-gray-100 transition-colors flex items-center justify-center gap-2"
              >
                <CreditCard size={20} />
                Upgrade Now
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Subscription;
