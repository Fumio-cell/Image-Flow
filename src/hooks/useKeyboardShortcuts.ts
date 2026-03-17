import { useEffect } from 'react';
import { useProjectStore } from '../store/useProjectStore';

export const useKeyboardShortcuts = () => {
    const isPlaying = useProjectStore(s => s.ui.isPlaying);
    const setIsPlaying = useProjectStore(s => s.setIsPlaying);
    const selectedClipId = useProjectStore(s => s.ui.selectedClipId);
    const removeClip = useProjectStore(s => s.removeClip);
    const undo = useProjectStore(s => s.undo);
    const redo = useProjectStore(s => s.redo);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Ignore if typing in an input
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) {
                return;
            }

            if (e.code === 'Space') {
                e.preventDefault();
                setIsPlaying(!isPlaying);
            }

            if ((e.code === 'Delete' || e.code === 'Backspace') && selectedClipId) {
                e.preventDefault();
                removeClip(selectedClipId);
            }

            // Undo / Redo
            if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
                if (e.shiftKey) {
                    redo();
                } else {
                    undo();
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isPlaying, setIsPlaying, selectedClipId, removeClip, undo, redo]);
};
