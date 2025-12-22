
import React, { createContext, useContext, useState, useCallback } from 'react';
import { Session, Step, DebugLog } from './types';

interface AppContextType {
  session: Session;
  debugLogs: DebugLog[];
  setSession: React.Dispatch<React.SetStateAction<Session>>;
  addStep: (step: Omit<Step, 'number'>) => void;
  insertStep: (index: number, stepData: Omit<Step, 'number'>) => void;
  removeStep: (id: string) => void;
  updateStep: (id: string, updates: Partial<Step>) => void;
  addDebugLog: (type: string, data: any) => void;
  resetSession: () => void;
  loadSession: (importedSession: Partial<Session>) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

const INITIAL_SESSION: Session = {
  id: '',
  title: 'Untitled Guide',
  initialUrl: '',
  steps: [],
  status: 'idle',
  connected: false
};

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session>(INITIAL_SESSION);
  const [debugLogs, setDebugLogs] = useState<DebugLog[]>([]);

  const addStep = useCallback((stepData: Omit<Step, 'number'>) => {
    setSession(prev => {
      const newStep: Step = {
        ...stepData,
        number: prev.steps.length + 1
      };
      return {
        ...prev,
        steps: [...prev.steps, newStep]
      };
    });
  }, []);

  const insertStep = useCallback((index: number, stepData: Omit<Step, 'number'>) => {
    setSession(prev => {
      const newSteps = [...prev.steps];
      const newStep: Step = {
        ...stepData,
        number: index + 1
      };
      newSteps.splice(index, 0, newStep);
      
      // Re-index everything to ensure order is preserved
      const reindexed = newSteps.map((s, idx) => ({
        ...s,
        number: idx + 1
      }));

      return {
        ...prev,
        steps: reindexed
      };
    });
  }, []);

  const removeStep = useCallback((id: string) => {
    setSession(prev => ({
      ...prev,
      steps: prev.steps.filter(s => s.id !== id).map((s, idx) => ({ ...s, number: idx + 1 }))
    }));
  }, []);

  const updateStep = useCallback((id: string, updates: Partial<Step>) => {
    setSession(prev => ({
      ...prev,
      steps: prev.steps.map(s => s.id === id ? { ...s, ...updates } : s)
    }));
  }, []);

  const addDebugLog = useCallback((type: string, data: any) => {
    setDebugLogs(prev => [{ timestamp: Date.now(), type, data }, ...prev].slice(0, 50));
  }, []);

  const resetSession = useCallback(() => {
    setSession(INITIAL_SESSION);
  }, []);

  const loadSession = useCallback((importedSession: Partial<Session>) => {
    setSession(prev => ({
      ...prev,
      ...importedSession,
      status: 'recording',
      connected: true
    }));
  }, []);

  return (
    <AppContext.Provider value={{
      session,
      debugLogs,
      setSession,
      addStep,
      insertStep,
      removeStep,
      updateStep,
      addDebugLog,
      resetSession,
      loadSession
    }}>
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within AppProvider');
  return context;
};
