import type { AssetItem, Clip } from '../types';

/** The only asset fields the lookup needs, so the export worker can supply them without a full AssetItem. */
export type PrevLookupAsset = Pick<AssetItem, 'id' | 'type'>;

/**
 * The clip a transition is computed against: the previous VISUAL clip (an image
 * or a video) in start-time order.
 *
 * Audio clips are skipped. They share the project's clip list but never draw a
 * frame, so letting one stand in as "the previous clip" made every transition
 * that followed it fall back to a hard cut.
 *
 * A clip counts as audio only when its asset is an audio asset (the same rule
 * `laneOf` in audioMix.ts uses). Ties on start time keep list order, as the
 * all-clips sort this replaces did, so a project without audio resolves exactly
 * as before.
 *
 * Returns null when `current` is the first visual clip (or is not a visual clip).
 */
export function findPrevVisualClip(
    clips: readonly Clip[],
    assets: readonly PrevLookupAsset[],
    current: Clip
): Clip | null {
    const visual = clips
        .filter(c => assets.find(a => a.id === c.assetId)?.type !== 'audio')
        .sort((a, b) => a.startTimeMs - b.startTimeMs);
    const index = visual.findIndex(c => c.id === current.id);
    return index > 0 ? visual[index - 1] : null;
}
