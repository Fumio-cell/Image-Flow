import type { AssetItem, AudioEnvelope, Clip } from '../types';
import { isVisualClip } from './packClips';
import { DEMO_MODE, DEMO_MAX_SECONDS } from '../config';

/**
 * Music reaction: ONE pure "music level" in 0..1 that the preview and the export both compute from the
 * same per-asset envelope. No analyser, no playback state: level = f(time, clips, assets).
 *
 *   envelope : windowed RMS of the audio (50 ms window, 10 ms hop), normalised so the track's
 *              95th percentile is 1. Built once per audio asset at import.
 *   level(t) : instant attack, exponential release, as a pure function of t:
 *              max over k of env(t - k*hop) * exp(-k*hop / tau)   (tau 120 ms, look-back 360 ms)
 *   mix      : the active audio clips, power-summed, scaled by clip volume (muted = 0).
 *
 * No envelope means level 0 - never a flat fallback.
 */

export const ENV_HOP_MS = 10;
export const ENV_WINDOW_MS = 50;
export const RELEASE_TAU_MS = 120;
export const RELEASE_SPAN_MS = 360;

/** Envelope of decoded audio. Several channels are combined by power (mean of the squares). */
export function buildEnvelope(channels: Float32Array | readonly Float32Array[], sampleRate: number): AudioEnvelope {
    const chs = channels instanceof Float32Array ? [channels] : channels;
    const length = chs.length ? chs[0].length : 0;
    const hop = Math.max(1, Math.round(sampleRate * ENV_HOP_MS / 1000));
    const win = Math.max(1, Math.round(sampleRate * ENV_WINDOW_MS / 1000));
    const n = Math.ceil(length / hop);
    const cs = new Float64Array(length + 1);
    for (let i = 0; i < length; i++) {
        let p = 0;
        for (const ch of chs) p += ch[i] * ch[i];
        cs[i + 1] = cs[i] + p / chs.length;
    }
    const raw = new Float32Array(n);
    for (let i = 0; i < n; i++) {
        const c = i * hop;
        const a = Math.max(0, c - (win >> 1)), b = Math.min(length, c + (win >> 1));
        raw[i] = b > a ? Math.sqrt((cs[b] - cs[a]) / (b - a)) : 0;
    }
    const sorted = Float32Array.from(raw).sort();
    const p95 = n > 0 ? sorted[Math.floor(0.95 * (n - 1))] : 0;
    const scale = p95 > 1e-6 ? 1 / p95 : 0; // silence stays 0
    const values = new Float32Array(n);
    for (let i = 0; i < n; i++) values[i] = Math.min(1, raw[i] * scale);
    return { hopMs: (hop * 1000) / sampleRate, values };
}

export function envAt(env: AudioEnvelope, tMs: number): number {
    const x = tMs / env.hopMs;
    if (!(x >= 0) || x > env.values.length - 1) return 0;
    const i = Math.floor(x), f = x - i;
    const a = env.values[i], b = env.values[Math.min(i + 1, env.values.length - 1)];
    return a + (b - a) * f;
}

export function levelAt(env: AudioEnvelope, tMs: number): number {
    let best = 0;
    for (let k = 0; k * env.hopMs <= RELEASE_SPAN_MS; k++) {
        const s = tMs - k * env.hopMs;
        if (s < 0) break;
        const v = envAt(env, s) * Math.exp(-(k * env.hopMs) / RELEASE_TAU_MS);
        if (v > best) best = v;
    }
    return best;
}

/**
 * The music level at timeline time t: the active audio clips' levels, power-summed.
 * Position in the source is the mixer's: t - clip.start + clip.sourceInMs (exportUtils builds its
 * mix sources the same way), inside the clip's own window. Crossfades are not part of the level.
 */
export function reactionLevelAt(timeMs: number, clips: readonly Clip[], assets: readonly AssetItem[]): number {
    let sum = 0;
    for (const c of clips) {
        if (c.muted || timeMs < c.startTimeMs || timeMs >= c.startTimeMs + c.durationMs) continue;
        const a = assets.find(x => x.id === c.assetId);
        if (!a || a.type !== 'audio' || !a.envelope) continue;
        const v = levelAt(a.envelope, timeMs - c.startTimeMs + (c.sourceInMs ?? 0)) * (c.volume ?? 1);
        sum += v * v;
    }
    return Math.min(1, Math.sqrt(sum));
}

/** How hard each effect reacts at r = 1, where r = musicReaction * level. */
export const REACTION = {
    zoom: 3.0,                                                              // x ZOOM_FACTOR (as before)
    glitchAmount: 0.5, glitchIntensity: 0.8, glitchDisplacement: 1.0,       // as before
    deltaStrength: 0.4, deltaNoise: 0.25,
    swirl: 0.3, turbulence: 0.4,
} as const;

export const DEFAULT_MUSIC_REACTION = 0.5;

/** The reaction r for a clip at a music level: 0 unless Audio Reactive is on. */
export const clipReaction = (clip: Clip, level: number): number =>
    clip.audioReactive ? Math.min(1, Math.max(0, clip.musicReaction ?? DEFAULT_MUSIC_REACTION)) * level : 0;

const c01 = (v: number) => Math.min(1, Math.max(0, v));
export const reactDelta = (strength: number, noiseAmount: number, r: number) =>
    ({ strength: c01(strength + REACTION.deltaStrength * r), noiseAmount: c01(noiseAmount + REACTION.deltaNoise * r) });
export const reactBreathing = (turbulence: number, swirl: number, r: number) =>
    ({ turbulence: c01(turbulence + REACTION.turbulence * r), swirl: c01(swirl + REACTION.swirl * r) });
export const reactGlitch = (g: { amount: number; intensity: number; displacement: number }, r: number) => ({
    amount: c01(g.amount + REACTION.glitchAmount * r),
    intensity: c01(g.intensity + REACTION.glitchIntensity * r),
    displacement: g.displacement > 0 ? c01(g.displacement + REACTION.glitchDisplacement * r) : g.displacement,
});

// ---- Export timing: ONE rule for the main thread and the worker ----------------------------------------

type AssetKind = Pick<AssetItem, 'id' | 'type'>;

/**
 * Length of the project in ms before any demo cap: the end of the last VISUAL clip (an audio-only project
 * falls back to the largest end over all clips).
 */
export function projectLengthMs(clips: readonly Clip[], assets: readonly AssetKind[]): number {
    const visual = clips.filter(c => isVisualClip(c, assets));
    let length = 0;
    for (const c of visual.length > 0 ? visual : clips) length = Math.max(length, c.startTimeMs + c.durationMs);
    return length;
}

/** Length of the exported video in ms: the project length, then the demo cap. */
export function exportLengthMs(clips: readonly Clip[], assets: readonly AssetKind[]): number {
    const length = projectLengthMs(clips, assets);
    return DEMO_MODE ? Math.min(length, DEMO_MAX_SECONDS * 1000) : length;
}

/** Frames in the export: ceil(length * fps / 1000), integer math (no division by a rounded step). */
export const exportFrameCount = (lengthMs: number, fps: number): number => Math.ceil(lengthMs * fps / 1000);

/** Timeline time of export frame i. */
export const exportFrameTimeMs = (i: number, fps: number): number => (i * 1000) / fps;

/** One music level per export frame, computed on the main thread and handed to the worker. */
export function exportAudioLevels(clips: readonly Clip[], assets: readonly AssetItem[], fps: number): Float32Array {
    const n = exportFrameCount(exportLengthMs(clips, assets), fps);
    const levels = new Float32Array(n);
    for (let i = 0; i < n; i++) levels[i] = reactionLevelAt(exportFrameTimeMs(i, fps), clips, assets);
    return levels;
}
