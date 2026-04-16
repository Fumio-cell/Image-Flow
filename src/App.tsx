import React, { useState, useEffect } from 'react';
import './App.css';
import { AppLayout } from './components/layout/AppLayout';
import { usePlaybackLoop } from './hooks/usePlaybackLoop';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useProjectStore } from './store/useProjectStore';
import { getAudioData } from './utils/audioUtils';
import type { AssetItem } from './types';

function App() {
  usePlaybackLoop();
  useKeyboardShortcuts();

  const [isDragging, setIsDragging] = useState(false);
  const addAssets = useProjectStore((s) => s.addAssets);

  const handleDragOver = (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);

      const files = Array.from(e.dataTransfer.files || []);
      if (!files.length) return;

      const newAssets: AssetItem[] = [];
      const isAudioType = (f: File) => f.type.startsWith('audio/') || f.name.endsWith('.wav') || f.name.endsWith('.mp3') || f.name.endsWith('.m4a');

      useProjectStore.getState().setIsPlaying(false); // pause playback while dropping

      for (const file of files) {
          const isImage = file.type.startsWith('image/');
          const isAudio = isAudioType(file);

          if (!isImage && !isAudio) continue;

          const objectUrl = URL.createObjectURL(file);
          const id = crypto.randomUUID();

          if (isImage) {
              newAssets.push({ id, type: 'image', file, objectUrl, name: file.name });
          } else if (isAudio) {
              try {
                  const { duration, peaks } = await getAudioData(file);
                  newAssets.push({ id, type: 'audio', file, objectUrl, name: file.name, duration, peaks });
              } catch (err) {
                  console.error("Failed to parse audio", err);
              }
          }
      }

      if (newAssets.length > 0) {
          addAssets(newAssets);
      }
  };

  return (
    <div 
        className="app-container" 
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
    >
      <AppLayout />
      {isDragging && (
          <div style={{
              position: 'fixed',
              top: 0, left: 0, right: 0, bottom: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.8)',
              zIndex: 9999,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backdropFilter: 'blur(10px)',
              pointerEvents: 'none'
          }}>
              <h2 style={{ color: 'white', fontSize: '2rem', letterSpacing: '2px', fontWeight: 300 }}>
                  Drop to Add to Timeline
              </h2>
          </div>
      )}
    </div>
  );
}

export default App;
