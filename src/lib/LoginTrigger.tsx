'use client';

import { createContext, useContext, useCallback, useState, ReactNode } from 'react';

interface LoginTriggerContextType {
  triggerLogin: () => void;
  onLoginTrigger: (callback: () => void) => () => void;
  loginState: 'idle' | 'logging-in' | 'logged-in' | 'logged-out';
  setLoginState: (state: 'idle' | 'logging-in' | 'logged-in' | 'logged-out') => void;
  currentUser: any;
  setCurrentUser: (user: any) => void;
}

const LoginTriggerContext = createContext<LoginTriggerContextType | null>(null);

export function LoginTriggerProvider({ children }: { children: ReactNode }) {
  const [listeners, setListeners] = useState<(() => void)[]>([]);
  const [loginState, setLoginState] = useState<'idle' | 'logging-in' | 'logged-in' | 'logged-out'>('idle');
  const [currentUser, setCurrentUser] = useState<any>(null);

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
    <LoginTriggerContext.Provider value={{ triggerLogin, onLoginTrigger, loginState, setLoginState, currentUser, setCurrentUser }}>
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
