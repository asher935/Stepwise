
import React from 'react';
import { AppProvider, useApp } from './store';
import Lobby from './components/Lobby';
import EditorShell from './components/EditorShell';
import DebugOverlay from './components/DebugOverlay';

const AppContent: React.FC = () => {
  const { session } = useApp();

  return (
    <div className="relative w-full h-screen overflow-hidden selection:bg-purple-500/30 selection:text-white">
      {session.status === 'idle' ? (
        <Lobby />
      ) : (
        <EditorShell />
      )}
      <DebugOverlay />
    </div>
  );
};

const App: React.FC = () => {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
};

export default App;
