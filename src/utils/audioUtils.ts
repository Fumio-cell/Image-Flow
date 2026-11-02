// utils/audioUtils.ts

import { isAiff } from '../lib/audio/aiffDecoder';
import { decodeAudioFile } from '../lib/audio/decodeAudioFile';

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
    let aiff = false;
    try {
        const buffer = await file.arrayBuffer();
        aiff = isAiff(buffer);

        const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const ctx = new Ctor({ sampleRate: WAVEFORM_DECODE_RATE });
        try {
            const decoded = await decodeAudioFile(ctx, buffer);
            const peaks = decoded.numberOfChannels > 0
                ? computePeaks(decoded.getChannelData(0))
                : new Array(WAVEFORM_SAMPLES).fill(0.1);
            return { duration: decoded.duration * 1000, peaks };
        } finally {
            await ctx.close().catch(() => { /* already closed */ });
        }
    } catch (err) {
        // <audio> can't play AIFF either, so the decoder's reason is the useful one.
        if (aiff) throw err;
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

/**
 * Wrap decoded PCM in a WAV container.
 *
 * Browsers can't play AIFF in <audio>/<video>, so previewing one means handing
 * the element an equivalent WAV built in memory. Export still reads the
 * original file.
 */
export const encodeWav = (channelData: Float32Array[], sampleRate: number): Blob => {
    const channels = channelData.length;
    const frames = channelData[0]?.length ?? 0;
    const bytes = frames * channels * 2; // 16-bit
    const buffer = new ArrayBuffer(44 + bytes);
    const v = new DataView(buffer);

    const ascii = (offset: number, text: string) => {
        for (let i = 0; i < text.length; i++) v.setUint8(offset + i, text.charCodeAt(i));
    };

    ascii(0, 'RIFF');
    v.setUint32(4, 36 + bytes, true);
    ascii(8, 'WAVE');
    ascii(12, 'fmt ');
    v.setUint32(16, 16, true);      // PCM header size
    v.setUint16(20, 1, true);       // format: PCM
    v.setUint16(22, channels, true);
    v.setUint32(24, sampleRate, true);
    v.setUint32(28, sampleRate * channels * 2, true); // byte rate
    v.setUint16(32, channels * 2, true);              // block align
    v.setUint16(34, 16, true);                        // bits per sample
    ascii(36, 'data');
    v.setUint32(40, bytes, true);

    let o = 44;
    for (let i = 0; i < frames; i++) {
        for (let c = 0; c < channels; c++) {
            const clamped = Math.max(-1, Math.min(1, channelData[c][i]));
            v.setInt16(o, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
            o += 2;
        }
    }
    return new Blob([buffer], { type: 'audio/wav' });
};
