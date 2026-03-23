import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { doc, onSnapshot, setDoc, getDoc, collection, query, where, updateDoc, getDocs, deleteDoc } from 'firebase/firestore';
import { auth, db, loginWithGoogle, logout, handleFirestoreError, OperationType, testConnection } from './firebase';
import { toast } from 'react-hot-toast';

interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: 'owner' | 'staff';
  businessId: string;
}

interface Business {
  id: string;
  name: string;
  ownerId: string;
  createdAt?: string;
  trialEndsAt?: string;
  subscriptionStatus?: 'trial' | 'active' | 'expired';
}

interface AuthContextType {
  user: FirebaseUser | null;
  profile: UserProfile | null;
  loading: boolean;
  businessId: string | null;
  activeBusiness: Business | null;
  businesses: Business[];
  switchBusiness: (id: string) => Promise<void>;
  createBusiness: (name: string) => Promise<void>;
  updateSubscription: (status: 'active') => Promise<void>;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  isGuest: boolean;
  skipLogin: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [loading, setLoading] = useState(true);
  const [isGuest, setIsGuest] = useState(false);

  useEffect(() => {
    testConnection();
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        // Fetch businesses owned by the user
        const businessesRef = collection(db, 'businesses');
        const q = query(businessesRef, where('ownerId', '==', firebaseUser.uid));
        
        onSnapshot(q, (snapshot) => {
          setBusinesses(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Business)));
        });

        try {
          const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
          if (userDoc.exists()) {
            setProfile(userDoc.data() as UserProfile);
          } else {
            // New user - check for invitations first
            const invRef = collection(db, 'invitations');
            const invQuery = query(invRef, where('email', '==', firebaseUser.email?.toLowerCase()), where('status', '==', 'pending'));
            const invSnap = await getDocs(invQuery);

            let businessId = `biz_${firebaseUser.uid}`;
            let role: 'owner' | 'staff' = 'owner';

            if (!invSnap.empty) {
              const invitation = invSnap.docs[0].data();
              businessId = invitation.businessId;
              role = invitation.role;
              
              // Mark invitation as accepted or delete it
              await deleteDoc(doc(db, 'invitations', invSnap.docs[0].id));
              toast.success(`Joined ${invitation.businessName || 'Business'}`);
            } else {
              // No invitation - create a default business
              const now = new Date();
              const trialEndsAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
              await setDoc(doc(db, 'businesses', businessId), {
                id: businessId,
                name: `${firebaseUser.displayName || 'User'}'s Business`,
                ownerId: firebaseUser.uid,
                createdAt: now.toISOString(),
                trialEndsAt: trialEndsAt.toISOString(),
                subscriptionStatus: 'trial'
              });
            }

            const newProfile: UserProfile = {
              uid: firebaseUser.uid,
              email: firebaseUser.email || '',
              displayName: firebaseUser.displayName || '',
              role: role,
              businessId: businessId
            };
            
            await setDoc(doc(db, 'users', firebaseUser.uid), newProfile);
            setProfile(newProfile);
          }
        } catch (error) {
          handleFirestoreError(error, OperationType.GET, `users/${firebaseUser.uid}`);
        }
      } else {
        setProfile(null);
        setBusinesses([]);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const switchBusiness = async (id: string) => {
    if (!user || !profile) return;
    try {
      await updateDoc(doc(db, 'users', user.uid), { businessId: id });
      setProfile({ ...profile, businessId: id });
      toast.success('Switched business');
    } catch (error) {
      toast.error('Failed to switch business');
    }
  };

  const createBusiness = async (name: string) => {
    if (!user || !profile) return;
    try {
      const businessId = `biz_${Date.now()}`;
      const now = new Date();
      const trialEndsAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      await setDoc(doc(db, 'businesses', businessId), {
        id: businessId,
        name,
        ownerId: user.uid,
        createdAt: now.toISOString(),
        trialEndsAt: trialEndsAt.toISOString(),
        subscriptionStatus: 'trial'
      });
      // Automatically switch to the new business
      await switchBusiness(businessId);
      toast.success('Business created');
    } catch (error) {
      toast.error('Failed to create business');
    }
  };

  const updateSubscription = async (status: 'active') => {
    const businessId = profile?.businessId;
    if (!businessId) return;
    try {
      await updateDoc(doc(db, 'businesses', businessId), {
        subscriptionStatus: status
      });
      toast.success('Subscription updated successfully!');
    } catch (error) {
      toast.error('Failed to update subscription');
    }
  };

  const login = async () => {
    try {
      await loginWithGoogle();
    } catch (error) {
      console.error("Login failed", error);
    }
  };

  const handleLogout = async () => {
    try {
      if (isGuest) {
        setIsGuest(false);
        setProfile(null);
        setBusinesses([]);
      } else {
        await logout();
      }
    } catch (error) {
      console.error("Logout failed", error);
    }
  };

  const skipLogin = () => {
    setIsGuest(true);
    setProfile({
      uid: 'guest_uid',
      email: 'guest@example.com',
      displayName: 'Guest User',
      role: 'owner',
      businessId: 'biz_guest'
    });
    setBusinesses([{
      id: 'biz_guest',
      name: 'Guest Business',
      ownerId: 'guest_uid',
      subscriptionStatus: 'trial',
      trialEndsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    }]);
    setLoading(false);
  };

  const activeBusiness = businesses.find(b => b.id === profile?.businessId) || null;

  return (
    <AuthContext.Provider value={{ 
      user, 
      profile, 
      loading, 
      businessId: profile?.businessId || null,
      activeBusiness,
      businesses,
      switchBusiness,
      createBusiness,
      updateSubscription,
      login, 
      logout: handleLogout,
      isGuest,
      skipLogin
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
