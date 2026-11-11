import { create } from 'zustand';
import type { ProjectData, AssetItem, Clip, ProjectSettings, Resolution } from '../types';
import { autoResolutionFor, resolutionEntry } from '../utils/pickResolution';
import {
    DEFAULT_OVERLAP_MS, PACK_TRIGGER_KEYS, defaultTransitionFor, isVisualClip,
    normalizeJunctionUpdate, packClips, visualRow,
} from '../utils/packClips';

interface UIState {
    selectedClipId: string | null;
    playheadMs: number;
    isPlaying: boolean;
    previewQuality: 'Draft' | 'Full';
    zoomScale: number; // Pixels per ms
    /** One line shown in the Settings pane after the automatic resolution choice. Not part of the project or the undo history. */
    resolutionNotice: string | null;
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
    /** The user picks a resolution by hand: one undo step, and the automatic choice never overrides it. */
    setResolution: (resolution: Resolution) => void;
    dismissResolutionNotice: () => void;

    // Assets
    addAssets: (assets: AssetItem[]) => void;
    updateAsset: (id: string, updates: Partial<AssetItem>) => void;
    removeAsset: (id: string) => void;
    reorderComponents?: () => void; // if needed

    // Clips
    addClip: (clip: Clip) => void;
    updateClip: (id: string, updates: Partial<Clip>) => void;
    updateClipTransient: (id: string, updates: Partial<Clip>) => void;
    removeClip: (id: string) => void;
    setClips: (clips: Clip[]) => void; // for bulk reorder
    replaceProject: (data: ProjectData) => void; // swap the WHOLE project (e.g. the sample): one undo step

    // Auto-pack (visual lane). Each is exactly one undo step.
    insertClipAt: (clip: Clip, index: number) => void;   // slot in the visual row, then re-pack
    moveClipToIndex: (id: string, index: number) => void; // slot among the other visual clips, then re-pack
    setAutoPack: (on: boolean) => void;                   // ON re-packs a freely arranged project once

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
        autoPack: true, // a new project starts as a packed row
    },
    assets: [],
    clips: []
};

const initialUI: UIState = {
    selectedClipId: null,
    playheadMs: 0,
    isPlaying: false,
    previewQuality: 'Full',
    zoomScale: 0.1, // 100px = 1 second
    resolutionNotice: null
};

const MAX_HISTORY = 30;

/**
 * Apply a clip update. With Auto-pack on, an edit that changes the layout of a
 * visual clip (length, transition, overlap) re-packs the row, so the clips after
 * it ripple. With it off this is the plain merge it always was.
 */
function applyClipUpdate(state: ProjectStoreState, id: string, updates: Partial<Clip>): Clip[] {
    const { clips, assets } = state.data;
    const target = clips.find(c => c.id === id);
    const packing = state.data.settings.autoPack === true && !!target && isVisualClip(target, assets) &&
        PACK_TRIGGER_KEYS.some(k => k in updates);
    const effective = packing ? normalizeJunctionUpdate(clips, assets, target!, updates) : updates;
    const next = clips.map(c => c.id === id ? { ...c, ...effective } : c);
    return packing ? packClips(next, assets) : next;
}

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

        set((state) => ({
            data: previous,
            history: {
                past: newPast,
                future: [clonedCurrent, ...history.future]
            },
            ui: { ...state.ui, resolutionNotice: null }
        }));
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

        set((state) => ({
            data: next,
            history: {
                past: [...history.past, clonedCurrent],
                future: newFuture
            },
            ui: { ...state.ui, resolutionNotice: null }
        }));
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

    setResolution: (resolution) => {
        get()._saveHistory();
        set((state) => ({
            data: { ...state.data, settings: { ...state.data.settings, resolution, resolutionSource: 'manual' } },
            ui: { ...state.ui, resolutionNotice: null }
        }));
    },

    dismissResolutionNotice: () => set((state) => ({ ui: { ...state.ui, resolutionNotice: null } })),

    // The first visual asset of an empty project also picks the resolution, inside the same history step as the import.
    addAssets: (assets) => {
        get()._saveHistory();
        set((state) => {
            const auto = autoResolutionFor(state.data, assets);
            const changed = !!auto && auto.resolution !== state.data.settings.resolution;
            return {
                data: {
                    ...state.data,
                    settings: auto ? { ...state.data.settings, resolution: auto.resolution, resolutionSource: 'auto' } : state.data.settings,
                    assets: [...state.data.assets, ...assets]
                },
                ui: changed && auto
                    ? { ...state.ui, resolutionNotice: `Resolution set to ${resolutionEntry(auto.resolution).label} to match your first ${auto.kind}.` }
                    : state.ui
            };
        });
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

    removeAsset: (id) => {
        get()._saveHistory();
        set((state) => {
            const asset = state.data.assets.find(a => a.id === id);
            if (asset?.objectUrl) URL.revokeObjectURL(asset.objectUrl);

            // Clips referencing this asset no longer have anything to render, so drop them too
            const removedClipIds = new Set(
                state.data.clips.filter(c => c.assetId === id).map(c => c.id)
            );

            const assets = state.data.assets.filter(a => a.id !== id);
            const remaining = state.data.clips.filter(c => c.assetId !== id);
            const touchesRow = state.data.clips.some(c => c.assetId === id && isVisualClip(c, state.data.assets));

            return {
                data: {
                    ...state.data,
                    assets,
                    clips: state.data.settings.autoPack === true && touchesRow ? packClips(remaining, assets) : remaining
                },
                ui: {
                    ...state.ui,
                    selectedClipId: state.ui.selectedClipId && removedClipIds.has(state.ui.selectedClipId)
                        ? null
                        : state.ui.selectedClipId
                }
            };
        });
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
            data: { ...state.data, clips: applyClipUpdate(state, id, updates) }
        }));
    },

    updateClipTransient: (id, updates) => {
        set((state) => ({
            data: { ...state.data, clips: applyClipUpdate(state, id, updates) }
        }));
    },

    removeClip: (id) => {
        get()._saveHistory();
        set((state) => {
            const target = state.data.clips.find(c => c.id === id);
            const remaining = state.data.clips.filter(c => c.id !== id);
            return {
                data: {
                    ...state.data,
                    // Ripple: the clips after a deleted one close the gap.
                    clips: state.data.settings.autoPack === true && target && isVisualClip(target, state.data.assets)
                        ? packClips(remaining, state.data.assets)
                        : remaining
                },
                ui: {
                    ...state.ui,
                    selectedClipId: state.ui.selectedClipId === id ? null : state.ui.selectedClipId
                }
            };
        });
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

    // Old assets keep their object URLs (no revoke): undo brings the previous project back as it was.
    replaceProject: (data) => {
        get()._saveHistory();
        set((state) => ({
            data,
            ui: { ...state.ui, selectedClipId: null, playheadMs: 0, isPlaying: false, resolutionNotice: null }
        }));
    },

    insertClipAt: (clip, index) => {
        const { clips, assets } = get().data;
        const row = visualRow(clips, assets).map(c => c.id);
        const slot = Math.max(0, Math.min(index, row.length));
        const asset = assets.find(a => a.id === clip.assetId);
        const prevId = row[slot - 1];
        const prevAsset = prevId ? assets.find(a => a.id === clips.find(c => c.id === prevId)?.assetId) : undefined;
        const placed: Clip = {
            ...clip,
            transitionType: defaultTransitionFor(prevAsset, asset),
            transitionDurationMs: DEFAULT_OVERLAP_MS
        };
        row.splice(slot, 0, placed.id);
        get()._saveHistory();
        set((state) => ({
            data: { ...state.data, clips: packClips([...state.data.clips, placed], state.data.assets, { order: row }) }
        }));
    },

    moveClipToIndex: (id, index) => {
        const { clips, assets } = get().data;
        const row = visualRow(clips, assets).map(c => c.id);
        if (!row.includes(id)) return;
        const others = row.filter(x => x !== id);
        others.splice(Math.max(0, Math.min(index, others.length)), 0, id);
        if (others.every((x, i) => x === row[i])) return; // back in its own slot: nothing to do
        get()._saveHistory();
        set((state) => ({
            data: { ...state.data, clips: packClips(state.data.clips, state.data.assets, { order: others }) }
        }));
    },

    // The toggle lives in settings, so it is part of the undo history: one step per switch,
    // and undo / redo bring back the toggle together with the positions.
    setAutoPack: (on) => {
        const state = get();
        if (on === (state.data.settings.autoPack === true)) return;
        if (!on) {
            get()._saveHistory();
            set((s) => ({ data: { ...s.data, settings: { ...s.data.settings, autoPack: false } } }));
            return;
        }
        // Switching ON re-packs what was arranged freely, in the same step.
        const packed = packClips(state.data.clips, state.data.assets, { adopt: true });
        get()._saveHistory();
        set((s) => ({ data: { ...s.data, settings: { ...s.data.settings, autoPack: true }, clips: packed } }));
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
