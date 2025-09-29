'use client';

import { createContext, useContext, useRef } from 'react';

interface ClearTriggerContextType {
  triggerClear: () => void;
  setClearHandler: (handler: () => void) => void;
}

const ClearTriggerContext = createContext<ClearTriggerContextType | null>(null);

export function ClearTriggerProvider({ children }: { children: React.ReactNode }) {
  const clearHandlerRef = useRef<(() => void) | null>(null);

  const triggerClear = () => {
    if (clearHandlerRef.current) {
      clearHandlerRef.current();
    }
  };

  const setClearHandler = (handler: () => void) => {
    clearHandlerRef.current = handler;
  };

  return (
    <ClearTriggerContext.Provider value={{ triggerClear, setClearHandler }}>
      {children}
    </ClearTriggerContext.Provider>
  );
}

export function useClearTrigger() {
  const context = useContext(ClearTriggerContext);
  if (!context) {
    throw new Error('useClearTrigger must be used within a ClearTriggerProvider');
  }
  return context;
}
