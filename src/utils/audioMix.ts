// utils/audioMix.ts
import type { AssetItem, Clip } from '../types';

/**
 * Where a clip's audio fades in and out, in timeline milliseconds.
 *
 * When two clips on the same lane overlap, the outgoing one should hand over to
 * the incoming one rather than both playing flat out — otherwise the overlap is
 * just twice the signal, which sums louder and clips.
 */
export interface FadeWindow {
    fadeInStartMs: number;
    fadeInEndMs: number;
    fadeOutStartMs: number;
    fadeOutEndMs: number;
}

const laneOf = (clip: Clip, assets: AssetItem[]): 'audio' | 'visual' =>
    assets.find(a => a.id === clip.assetId)?.type === 'audio' ? 'audio' : 'visual';

/**
 * Work out the crossfade regions for one clip, based on how far its neighbours
 * on the same lane overlap it.
 */
export function getFadeWindow(clip: Clip, clips: Clip[], assets: AssetItem[]): FadeWindow {
    const lane = laneOf(clip, assets);
    const siblings = clips
        .filter(c => laneOf(c, assets) === lane)
        .sort((a, b) => a.startTimeMs - b.startTimeMs);

    const index = siblings.findIndex(c => c.id === clip.id);
    const clipEnd = clip.startTimeMs + clip.durationMs;

    // Fade in across whatever the previous clip still covers.
    let fadeInEndMs = clip.startTimeMs;
    if (index > 0) {
        const prev = siblings[index - 1];
        const prevEnd = prev.startTimeMs + prev.durationMs;
        const overlap = Math.max(0, Math.min(prevEnd, clipEnd) - clip.startTimeMs);
        fadeInEndMs = clip.startTimeMs + overlap;
    }

    // Fade out across whatever the next clip already covers.
    let fadeOutStartMs = clipEnd;
    if (index >= 0 && index < siblings.length - 1) {
        const next = siblings[index + 1];
        const overlap = Math.max(0, clipEnd - Math.max(next.startTimeMs, clip.startTimeMs));
        fadeOutStartMs = clipEnd - overlap;
    }

    return {
        fadeInStartMs: clip.startTimeMs,
        fadeInEndMs,
        fadeOutStartMs,
        fadeOutEndMs: clipEnd,
    };
}

/**
 * Gain multiplier for a clip at a point on the timeline, 0..1.
 *
 * Uses equal-power curves (sin/cos) rather than straight lines: two linear
 * ramps crossing dip in perceived loudness halfway through, which is audible as
 * a sag in the middle of every transition.
 */
export function getFadeGain(fade: FadeWindow, timelineMs: number): number {
    let gain = 1;

    const fadeInLen = fade.fadeInEndMs - fade.fadeInStartMs;
    if (fadeInLen > 0 && timelineMs < fade.fadeInEndMs) {
        const p = Math.min(1, Math.max(0, (timelineMs - fade.fadeInStartMs) / fadeInLen));
        gain *= Math.sin((p * Math.PI) / 2);
    }

    const fadeOutLen = fade.fadeOutEndMs - fade.fadeOutStartMs;
    if (fadeOutLen > 0 && timelineMs > fade.fadeOutStartMs) {
        const p = Math.min(1, Math.max(0, (timelineMs - fade.fadeOutStartMs) / fadeOutLen));
        gain *= Math.cos((p * Math.PI) / 2);
    }

    return Math.min(1, Math.max(0, gain));
}
