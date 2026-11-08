import type { AssetItem, Clip, TransitionType } from '../types';
import { findPrevVisualClip } from './prevVisualClip';

/**
 * Auto-pack: the visual lane is a row of clips. Every start time is derived from
 * the clips before it, so nothing leaves a gap or an accidental overlap.
 *
 *   start[0] = 0
 *   start[i] = end[i-1] - overlap[i]
 *
 * `Clip.transitionDurationMs` holds overlap[i], "overlap with the previous clip".
 * Audio clips are not part of the row and are never touched.
 */

export const DEFAULT_OVERLAP_MS = 1000;
/** An overlap may not exceed this share of the shorter of the two clips. */
export const MAX_OVERLAP_FRACTION = 0.4;

type AssetLike = Pick<AssetItem, 'id' | 'type'>;

const assetOf = (clip: Clip, assets: readonly AssetLike[]) => assets.find(a => a.id === clip.assetId);

/** Anything that is not an audio asset is part of the visual row (same rule as audioMix.laneOf). */
export const isVisualClip = (clip: Clip, assets: readonly AssetLike[]): boolean =>
    assetOf(clip, assets)?.type !== 'audio';

export const maxOverlapMs = (prev: Clip, cur: Clip): number =>
    Math.floor(MAX_OVERLAP_FRACTION * Math.min(prev.durationMs, cur.durationMs));

/**
 * Transition a new junction starts with: Delta Flow when both clips are images,
 * Dissolve when either is a video (Delta Flow / Breathing Morph need two stills).
 * With no neighbour (a first clip) it depends on the clip alone.
 */
export function defaultTransitionFor(prev: AssetLike | undefined, cur: AssetLike | undefined): TransitionType {
    return prev?.type === 'video' || cur?.type === 'video' ? 'dissolve' : 'delta-flow';
}

const needsStills = (t: TransitionType) => t === 'delta-flow' || t === 'breathing-morph';

export interface PackOptions {
    /** Visual clip ids in the order the row should have. Default: current start-time order. */
    order?: readonly string[];
    /**
     * Converting a freely arranged project: overlaps come from where the clips
     * sit now (not from the unused `transitionDurationMs`), and 'cut' - which is
     * just the free-mode default - becomes the default transition.
     */
    adopt?: boolean;
}

/**
 * Re-pack the visual row. Pure: returns a new clips array (same order and
 * identity for audio clips; visual clips are replaced by packed copies).
 *
 * Per junction: a 'cut' keeps overlap 0 (cut and overlap 0 mean the same thing);
 * any other transition keeps its stored overlap, falling back to the default when
 * none is stored, clamped to 40% of the shorter neighbour. Delta Flow / Breathing
 * Morph next to a video fall back to Dissolve.
 */
export function packClips(clips: readonly Clip[], assets: readonly AssetLike[], opts: PackOptions = {}): Clip[] {
    const visual = clips.filter(c => isVisualClip(c, assets));
    const byStart = [...visual].sort((a, b) => a.startTimeMs - b.startTimeMs);

    let row = byStart;
    if (opts.order) {
        const byId = new Map(visual.map(c => [c.id, c]));
        const listed = opts.order.map(id => byId.get(id)).filter((c): c is Clip => !!c);
        const seen = new Set(listed.map(c => c.id));
        row = [...listed, ...byStart.filter(c => !seen.has(c.id))];
    }

    // Where each clip overlaps its predecessor right now (only used when adopting).
    const geometricOverlap = new Map<string, number>();
    byStart.forEach((c, i) => {
        const prev = byStart[i - 1];
        geometricOverlap.set(c.id, prev ? Math.max(0, prev.startTimeMs + prev.durationMs - c.startTimeMs) : 0);
    });

    const packed = new Map<string, Clip>();
    let prev: Clip | null = null;
    for (const c of row) {
        const asset = assetOf(c, assets);
        let type = c.transitionType;
        if (opts.adopt && type === 'cut') type = defaultTransitionFor(prev ? assetOf(prev, assets) : undefined, asset);

        if (!prev) {
            packed.set(c.id, { ...c, startTimeMs: 0, transitionDurationMs: 0, transitionType: type });
        } else {
            if (needsStills(type) && defaultTransitionFor(assetOf(prev, assets), asset) === 'dissolve') type = 'dissolve';
            let overlap = 0;
            if (type !== 'cut') {
                let wanted = opts.adopt ? (geometricOverlap.get(c.id) ?? 0) : c.transitionDurationMs;
                if (!(wanted > 0)) wanted = DEFAULT_OVERLAP_MS;
                overlap = Math.max(0, Math.min(Math.round(wanted), maxOverlapMs(prev, c)));
            }
            packed.set(c.id, {
                ...c,
                startTimeMs: prev.startTimeMs + prev.durationMs - overlap,
                transitionDurationMs: overlap,
                transitionType: type,
            });
        }
        prev = packed.get(c.id)!;
    }
    return clips.map(c => packed.get(c.id) ?? c);
}

/** True when two clip lists have the same visual layout (positions, lengths, transitions). */
export function sameLayout(a: readonly Clip[], b: readonly Clip[]): boolean {
    if (a.length !== b.length) return false;
    return a.every((c, i) => {
        const d = b[i];
        return c.id === d.id && c.startTimeMs === d.startTimeMs && c.durationMs === d.durationMs &&
            c.transitionType === d.transitionType && c.transitionDurationMs === d.transitionDurationMs;
    });
}

/** The visual row in start-time order, optionally without one clip (the one being dragged). */
export function visualRow(clips: readonly Clip[], assets: readonly AssetLike[], excludeId?: string): Clip[] {
    return clips
        .filter(c => c.id !== excludeId && isVisualClip(c, assets))
        .sort((a, b) => a.startTimeMs - b.startTimeMs);
}

/**
 * Slot a dropped or dragged clip goes to: the number of existing clips whose
 * midpoint lies left of the mouse. Not the mouse position itself.
 */
export function insertionIndex(clips: readonly Clip[], assets: readonly AssetLike[], mouseMs: number, excludeId?: string): number {
    return visualRow(clips, assets, excludeId).filter(c => mouseMs > c.startTimeMs + c.durationMs / 2).length;
}

/** Timeline position (ms) to draw the insertion marker at for a slot. */
export function insertionMarkerMs(clips: readonly Clip[], assets: readonly AssetLike[], index: number, excludeId?: string): number {
    const row = visualRow(clips, assets, excludeId);
    if (row.length === 0) return 0;
    if (index >= row.length) { const last = row[row.length - 1]; return last.startTimeMs + last.durationMs; }
    if (index <= 0) return row[0].startTimeMs;
    const prevEnd = row[index - 1].startTimeMs + row[index - 1].durationMs;
    return (row[index].startTimeMs + prevEnd) / 2;
}

/**
 * Keep a clip's transition and overlap consistent when one of them is edited:
 * 'cut' <=> overlap 0. Returns the updates to apply (pack then clamps the overlap).
 */
export function normalizeJunctionUpdate(
    clips: readonly Clip[],
    assets: readonly AssetLike[],
    clip: Clip,
    updates: Partial<Clip>
): Partial<Clip> {
    if (updates.transitionType === 'cut') return { ...updates, transitionDurationMs: 0 };
    if (updates.transitionDurationMs !== undefined) {
        if (updates.transitionDurationMs <= 0) return { ...updates, transitionType: 'cut', transitionDurationMs: 0 };
        if ((updates.transitionType ?? clip.transitionType) === 'cut') {
            const prev = findPrevVisualClip(clips, assets, clip);
            return { ...updates, transitionType: defaultTransitionFor(prev ? assetOf(prev, assets) : undefined, assetOf(clip, assets)) };
        }
    }
    return updates;
}

/** Keys of an update that change the row's layout and so need a re-pack. */
export const PACK_TRIGGER_KEYS: readonly (keyof Clip)[] = ['startTimeMs', 'durationMs', 'transitionType', 'transitionDurationMs'];
