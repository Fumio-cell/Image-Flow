import './App.css';
import { AppLayout } from './components/layout/AppLayout';
import { usePlaybackLoop } from './hooks/usePlaybackLoop';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';

function App() {
  usePlaybackLoop();
  useKeyboardShortcuts();

  return (
    <div className="app-container">
      <AppLayout />
    </div>
  );
}

export default App;
