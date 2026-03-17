import { create } from 'zustand';
import type { ProjectData, AssetItem, Clip, ProjectSettings } from '../types';

interface UIState {
    selectedClipId: string | null;
    playheadMs: number;
    isPlaying: boolean;
    previewQuality: 'Draft' | 'Full';
    zoomScale: number; // Pixels per ms
}

interface ProjectStoreState {
    data: ProjectData;
    history: {
        past: ProjectData[];
        future: ProjectData[];
    };
    ui: UIState;
}

interface ProjectStoreActions {
    // Internal / Manual History
    _saveHistory: () => void;
    saveHistory: () => void;

    // History
    undo: () => void;
    redo: () => void;

    // Settings
    updateSettings: (updates: Partial<ProjectSettings>) => void;

    // Assets
    addAssets: (assets: AssetItem[]) => void;
    updateAsset: (id: string, updates: Partial<AssetItem>) => void;
    reorderComponents?: () => void; // if needed

    // Clips
    addClip: (clip: Clip) => void;
    updateClip: (id: string, updates: Partial<Clip>) => void;
    updateClipTransient: (id: string, updates: Partial<Clip>) => void;
    removeClip: (id: string) => void;
    setClips: (clips: Clip[]) => void; // for bulk reorder

    // UI
    setSelectedClipId: (id: string | null) => void;
    setPlayheadMs: (ms: number) => void;
    setIsPlaying: (playing: boolean) => void;
    setPreviewQuality: (quality: 'Draft' | 'Full') => void;
    setZoomScale: (scale: number) => void;
}

const initialData: ProjectData = {
    settings: {
        resolution: '1920x1080',
        fps: 30,
    },
    assets: [],
    clips: []
};

const initialUI: UIState = {
    selectedClipId: null,
    playheadMs: 0,
    isPlaying: false,
    previewQuality: 'Full',
    zoomScale: 0.1 // 100px = 1 second
};

const MAX_HISTORY = 30;

export const useProjectStore = create<ProjectStoreState & ProjectStoreActions>((set, get) => ({
    data: initialData,
    history: {
        past: [],
        future: []
    },
    ui: initialUI,

    _saveHistory: () => {
        const { data, history } = get();
        // Keep reference shallow clone
        const clonedData: ProjectData = {
            settings: { ...data.settings },
            assets: [...data.assets],
            clips: data.clips.map(c => ({ ...c }))
        };

        set({
            history: {
                past: [...history.past, clonedData].slice(-MAX_HISTORY),
                future: [] // clear future on new action
            }
        });
    },

    undo: () => {
        const { data, history } = get();
        if (history.past.length === 0) return;

        const previous = history.past[history.past.length - 1];
        const newPast = history.past.slice(0, -1);

        const clonedCurrent: ProjectData = {
            settings: { ...data.settings },
            assets: [...data.assets],
            clips: data.clips.map(c => ({ ...c }))
        };

        set({
            data: previous,
            history: {
                past: newPast,
                future: [clonedCurrent, ...history.future]
            }
        });
    },

    redo: () => {
        const { data, history } = get();
        if (history.future.length === 0) return;

        const next = history.future[0];
        const newFuture = history.future.slice(1);

        const clonedCurrent: ProjectData = {
            settings: { ...data.settings },
            assets: [...data.assets],
            clips: data.clips.map(c => ({ ...c }))
        };

        set({
            data: next,
            history: {
                past: [...history.past, clonedCurrent],
                future: newFuture
            }
        });
    },

    saveHistory: () => {
        get()._saveHistory();
    },

    updateSettings: (updates) => {
        get()._saveHistory();
        set((state) => ({
            data: {
                ...state.data,
                settings: { ...state.data.settings, ...updates }
            }
        }));
    },

    addAssets: (assets) => {
        get()._saveHistory();
        set((state) => ({
            data: {
                ...state.data,
                assets: [...state.data.assets, ...assets]
            }
        }));
    },

    updateAsset: (id, updates) => {
        get()._saveHistory();
        set((state) => ({
            data: {
                ...state.data,
                assets: state.data.assets.map(a => a.id === id ? { ...a, ...updates } : a)
            }
        }));
    },

    addClip: (clip) => {
        get()._saveHistory();
        set((state) => ({
            data: {
                ...state.data,
                clips: [...state.data.clips, clip]
            }
        }));
    },

    updateClip: (id, updates) => {
        get()._saveHistory();
        set((state) => ({
            data: {
                ...state.data,
                clips: state.data.clips.map(c => c.id === id ? { ...c, ...updates } : c)
            }
        }));
    },

    updateClipTransient: (id, updates) => {
        set((state) => ({
            data: {
                ...state.data,
                clips: state.data.clips.map(c => c.id === id ? { ...c, ...updates } : c)
            }
        }));
    },

    removeClip: (id) => {
        get()._saveHistory();
        set((state) => ({
            data: {
                ...state.data,
                clips: state.data.clips.filter(c => c.id !== id)
            },
            ui: {
                ...state.ui,
                selectedClipId: state.ui.selectedClipId === id ? null : state.ui.selectedClipId
            }
        }));
    },

    setClips: (clips) => {
        get()._saveHistory();
        set((state) => ({
            data: {
                ...state.data,
                clips
            }
        }));
    },

    // UI Actions (do not trigger history)
    setSelectedClipId: (id) => set((state) => ({ ui: { ...state.ui, selectedClipId: id } })),
    setPlayheadMs: (ms) => set((state) => ({ ui: { ...state.ui, playheadMs: ms } })),
    setIsPlaying: (playing) => set((state) => ({ ui: { ...state.ui, isPlaying: playing } })),
    setPreviewQuality: (quality) => set((state) => ({ ui: { ...state.ui, previewQuality: quality } })),
    setZoomScale: (scale: number) => set((state) => ({ ui: { ...state.ui, zoomScale: scale } }))
}));

// FOR TESTING
(window as any).useProjectStore = useProjectStore;
