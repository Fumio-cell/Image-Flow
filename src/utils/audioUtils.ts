// utils/audioUtils.ts

import { isAiff, decodeAiff } from './aiffDecoder';

const WAVEFORM_SAMPLES = 1000;
// A waveform doesn't need full fidelity. Decoding at a low rate is far faster
// and lighter for long files — a 7-minute stereo WAV drops from hundreds of MB
// of PCM to a few MB.
const WAVEFORM_DECODE_RATE = 8000;
const METADATA_TIMEOUT_MS = 15000;

const computePeaks = (data: Float32Array): number[] => {
    const blockSize = Math.max(1, Math.floor(data.length / WAVEFORM_SAMPLES));
    const peaks = new Array<number>(WAVEFORM_SAMPLES);
    for (let i = 0; i < WAVEFORM_SAMPLES; i++) {
        let max = 0;
        const start = i * blockSize;
        for (let j = 0; j < blockSize; j++) {
            const v = Math.abs(data[start + j] || 0);
            if (v > max) max = v;
        }
        peaks[i] = max;
    }
    return peaks;
};

/**
 * Read an audio file's length and waveform.
 *
 * Falls back to <audio> metadata (with a flat waveform) when the browser can't
 * decode the codec, so an unsupported format still gives a usable clip length
 * instead of failing outright. Always settles — an earlier version could hang
 * forever if decoding outran its timeout, which looked like the file silently
 * refusing to import.
 */
export const getAudioData = async (file: File): Promise<{ duration: number; peaks: number[] }> => {
    try {
        const buffer = await file.arrayBuffer();

        // No browser decodes AIFF, so read it ourselves before trying Web Audio.
        if (isAiff(buffer)) {
            const { channelData, sampleRate, length } = decodeAiff(buffer);
            return {
                duration: (length / sampleRate) * 1000,
                peaks: channelData.length > 0 ? computePeaks(channelData[0]) : new Array(WAVEFORM_SAMPLES).fill(0.1),
            };
        }

        const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const ctx = new Ctor({ sampleRate: WAVEFORM_DECODE_RATE });
        try {
            const decoded = await ctx.decodeAudioData(buffer);
            const peaks = decoded.numberOfChannels > 0
                ? computePeaks(decoded.getChannelData(0))
                : new Array(WAVEFORM_SAMPLES).fill(0.1);
            return { duration: decoded.duration * 1000, peaks };
        } finally {
            await ctx.close().catch(() => { /* already closed */ });
        }
    } catch (err) {
        console.warn('[audioUtils] decodeAudioData failed, falling back to <audio> metadata', file.name, err);
        return metadataOnly(file);
    }
};

/** Last resort: ask the media element how long it is, and draw a flat line. */
const metadataOnly = (file: File): Promise<{ duration: number; peaks: number[] }> => {
    return new Promise((resolve, reject) => {
        const objectUrl = URL.createObjectURL(file);
        const audio = new Audio();
        let settled = false;

        const finish = (result: { duration: number; peaks: number[] } | null, err?: Error) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            URL.revokeObjectURL(objectUrl);
            if (result) resolve(result);
            else reject(err ?? new Error('Could not read audio'));
        };

        const timer = setTimeout(
            () => finish(null, new Error(`Timed out reading audio: ${file.name}`)),
            METADATA_TIMEOUT_MS
        );

        const onReady = () => {
            const duration = Number.isFinite(audio.duration) ? audio.duration * 1000 : 0;
            if (duration > 0) finish({ duration, peaks: new Array(WAVEFORM_SAMPLES).fill(0.1) });
            else finish(null, new Error(`Audio reported no duration: ${file.name}`));
        };

        audio.onloadedmetadata = onReady;
        audio.onerror = () => finish(null, new Error(`Browser cannot play this audio: ${file.name}`));
        audio.preload = 'metadata';
        audio.src = objectUrl;

        // If metadata somehow arrived before the handler was attached, don't wait.
        if (audio.readyState >= 1) onReady();
    });
};
