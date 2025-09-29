'use client';

import { createContext, useContext, useCallback, useState, ReactNode } from 'react';

interface LoginTriggerContextType {
  triggerLogin: () => void;
  onLoginTrigger: (callback: () => void) => () => void;
}

const LoginTriggerContext = createContext<LoginTriggerContextType | null>(null);

export function LoginTriggerProvider({ children }: { children: ReactNode }) {
  const [listeners, setListeners] = useState<(() => void)[]>([]);

  const triggerLogin = useCallback(() => {
    listeners.forEach(listener => listener());
  }, [listeners]);

  const onLoginTrigger = useCallback((callback: () => void) => {
    setListeners(prev => [...prev, callback]);
    // Return cleanup function
    return () => {
      setListeners(prev => prev.filter(listener => listener !== callback));
    };
  }, []);

  return (
    <LoginTriggerContext.Provider value={{ triggerLogin, onLoginTrigger }}>
      {children}
    </LoginTriggerContext.Provider>
  );
}

export function useLoginTrigger() {
  const context = useContext(LoginTriggerContext);
  if (!context) {
    throw new Error('useLoginTrigger must be used within a LoginTriggerProvider');
  }
  return context;
}
