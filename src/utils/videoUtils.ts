// utils/videoUtils.ts

const METADATA_TIMEOUT_MS = 10000;
const POSTER_MAX_WIDTH = 320;

export interface VideoData {
    duration: number; // Milliseconds, to match audio assets
    width: number;
    height: number;
    posterUrl?: string; // Undefined if thumbnail capture failed
    hasAudio: boolean;
    peaks?: number[];   // Waveform envelope for the timeline, if audio is present
}

const WAVEFORM_SAMPLES = 1000;
// Decoding at a low rate is plenty for a waveform and keeps a long clip's
// envelope extraction down to a few MB instead of hundreds.
const WAVEFORM_DECODE_RATE = 8000;

/**
 * Pull a waveform envelope out of a video's audio track.
 *
 * Returns hasAudio:false for silent files — decodeAudioData rejects when
 * there's no audio stream, which is exactly how we detect it.
 */
const extractAudioPeaks = async (
    file: File
): Promise<{ hasAudio: boolean; peaks?: number[] }> => {
    let ctx: AudioContext | null = null;
    try {
        const buffer = await file.arrayBuffer();
        const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        ctx = new Ctor({ sampleRate: WAVEFORM_DECODE_RATE });
        const decoded = await ctx.decodeAudioData(buffer);
        if (decoded.numberOfChannels === 0 || decoded.length === 0) {
            return { hasAudio: false };
        }

        const data = decoded.getChannelData(0);
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
        return { hasAudio: true, peaks };
    } catch {
        // No audio stream, or a codec the browser won't decode — either way the
        // video is still perfectly usable, just silent.
        return { hasAudio: false };
    } finally {
        if (ctx) await ctx.close().catch(() => { /* already closed */ });
    }
};

/**
 * Probe a video file for duration/dimensions and grab a poster frame.
 *
 * The <video> is never attached to the DOM, so its .width/.height are 0 —
 * always read videoWidth/videoHeight instead.
 *
 * If the poster frame can't be captured (tainted canvas, codec quirk, seek
 * that never fires) the asset is still usable: posterUrl is simply omitted.
 */
export const getVideoData = async (file: File): Promise<VideoData> => {
    const objectUrl = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.crossOrigin = 'anonymous';

    const cleanup = () => {
        video.removeAttribute('src');
        video.load();
        URL.revokeObjectURL(objectUrl);
    };

    try {
        const meta = await new Promise<VideoData>((resolve, reject) => {
            const timer = setTimeout(
                () => reject(new Error('Timed out reading video metadata')),
                METADATA_TIMEOUT_MS
            );

            video.onloadedmetadata = () => {
                clearTimeout(timer);
                const duration = Number.isFinite(video.duration) ? video.duration * 1000 : 0;
                resolve({
                    duration,
                    width: video.videoWidth,
                    height: video.videoHeight,
                    hasAudio: false, // filled in after the poster step
                });
            };
            video.onerror = () => {
                clearTimeout(timer);
                reject(new Error('Failed to load video'));
            };

            video.src = objectUrl;
        });

        const posterUrl = await capturePoster(video, meta);
        const { hasAudio, peaks } = await extractAudioPeaks(file);
        return { ...meta, posterUrl, hasAudio, peaks };
    } finally {
        cleanup();
    }
};

/** Seek slightly past the start and paint one frame. Resolves undefined on failure. */
const capturePoster = async (
    video: HTMLVideoElement,
    meta: VideoData
): Promise<string | undefined> => {
    try {
        const targetSec = Math.min(0.1, video.duration / 2);

        await new Promise<void>((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('Poster seek timed out')), METADATA_TIMEOUT_MS);
            video.onseeked = () => {
                clearTimeout(timer);
                resolve();
            };
            video.onerror = () => {
                clearTimeout(timer);
                reject(new Error('Video error while seeking for poster'));
            };
            video.currentTime = targetSec;
        });

        if (!meta.width || !meta.height) return undefined;

        const scale = Math.min(1, POSTER_MAX_WIDTH / meta.width);
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(meta.width * scale));
        canvas.height = Math.max(1, Math.round(meta.height * scale));

        const ctx = canvas.getContext('2d');
        if (!ctx) return undefined;
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        return canvas.toDataURL('image/jpeg', 0.7);
    } catch (err) {
        // A missing thumbnail is cosmetic — keep the asset usable.
        console.warn('Failed to capture video poster frame', err);
        return undefined;
    }
};
