// utils/videoTiming.ts
import type { Clip } from '../types';

/**
 * Map a timeline position to a source time inside a video asset.
 *
 * Preview and export MUST both go through this. Duplicating the arithmetic is
 * how you end up with an export that doesn't match what the preview showed —
 * the hardest class of bug to isolate in this pipeline.
 *
 * @param clip            The clip being drawn.
 * @param assetDurationMs Source media length in milliseconds (0 if unknown).
 * @param timelineMs      Current playhead position on the timeline.
 * @returns Source time in seconds, clamped inside the media.
 */
export function getSourceTimeSec(
    clip: Clip,
    assetDurationMs: number | undefined,
    timelineMs: number
): number {
    const sourceMs = (clip.sourceInMs ?? 0) + (timelineMs - clip.startTimeMs);
    // Back off a hair from the very end: seeking exactly to duration often
    // lands past the last decodable frame.
    const maxSec = assetDurationMs ? Math.max(0, assetDurationMs / 1000 - 0.001) : 0;
    return Math.min(Math.max(sourceMs / 1000, 0), maxSec);
}
