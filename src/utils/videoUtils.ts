// utils/videoUtils.ts

const METADATA_TIMEOUT_MS = 10000;
const POSTER_MAX_WIDTH = 320;

export interface VideoData {
    duration: number; // Milliseconds, to match audio assets
    width: number;
    height: number;
    posterUrl?: string; // Undefined if thumbnail capture failed
}

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
                });
            };
            video.onerror = () => {
                clearTimeout(timer);
                reject(new Error('Failed to load video'));
            };

            video.src = objectUrl;
        });

        const posterUrl = await capturePoster(video, meta);
        return { ...meta, posterUrl };
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
