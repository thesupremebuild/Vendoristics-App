import React, { createContext, useContext, useState } from 'react';

interface NavigationContextType {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  accountingFilters: any;
  setAccountingFilters: (filters: any) => void;
}

const NavigationContext = createContext<NavigationContextType | undefined>(undefined);

export const NavigationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [accountingFilters, setAccountingFilters] = useState<any>(null);

  return (
    <NavigationContext.Provider value={{ activeTab, setActiveTab, accountingFilters, setAccountingFilters }}>
      {children}
    </NavigationContext.Provider>
  );
};

export const useNavigation = () => {
  const context = useContext(NavigationContext);
  if (context === undefined) {
    throw new Error('useNavigation must be used within a NavigationProvider');
  }
  return context;
};
