// utils/videoCache.ts
import type { AssetItem } from '../types';

const SEEK_TOLERANCE_SEC = 0.02;  // Close enough — don't pay for a seek
const SEEK_TIMEOUT_MS = 2000;
const PLAYBACK_DRIFT_SEC = 0.15;  // Only correct playback when it slips this far

/**
 * Seek a video and wait for the frame to actually be ready.
 *
 * Never rejects: near the end of a file (and on some codecs) 'seeked' can fail
 * to fire at all, and a rejection here would kill the whole preview frame.
 * On timeout we resolve anyway and let the caller draw whatever is decoded.
 */
export const seekVideo = (video: HTMLVideoElement, timeSec: number): Promise<void> => {
    return new Promise((resolve) => {
        if (Math.abs(video.currentTime - timeSec) < SEEK_TOLERANCE_SEC) {
            resolve();
            return;
        }

        let settled = false;
        const finish = () => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            video.removeEventListener('seeked', finish);
            video.removeEventListener('error', finish);
            resolve();
        };

        const timer = setTimeout(finish, SEEK_TIMEOUT_MS);
        video.addEventListener('seeked', finish);
        video.addEventListener('error', finish);

        try {
            video.currentTime = timeSec;
        } catch {
            finish();
        }
    });
};

class VideoCacheHandler {
    private cache: Map<string, HTMLVideoElement> = new Map();

    /** Get (or lazily create) the <video> backing this asset. */
    getVideo(asset: AssetItem): HTMLVideoElement | null {
        if (asset.type !== 'video' || !asset.objectUrl) return null;

        const existing = this.cache.get(asset.id);
        if (existing) return existing;

        const video = document.createElement('video');
        // Starts muted so scrubbing is silent; playback unmutes it per clip
        // via setLevel() below.
        video.muted = true;
        video.playsInline = true;
        video.preload = 'auto';
        video.crossOrigin = 'anonymous';
        video.src = asset.objectUrl;
        video.load();

        this.cache.set(asset.id, video);
        return video;
    }

    /**
     * Align a video to the requested source time.
     *
     * Paused: seek and wait, so scrubbing lands on the exact frame.
     * Playing: let the element run and only nudge currentTime when it drifts —
     * awaiting a seek every frame collapses the frame rate.
     */
    /**
     * Apply a clip's mix level. Audio only makes sense while playing — during a
     * scrub the element is paused and stays silent regardless.
     */
    setLevel(video: HTMLVideoElement, volume: number, muted: boolean, isPlaying: boolean) {
        video.volume = Math.min(1, Math.max(0, volume));
        video.muted = muted || !isPlaying;
    }

    async sync(video: HTMLVideoElement, targetSec: number, isPlaying: boolean): Promise<void> {
        if (!isPlaying) {
            if (!video.paused) video.pause();
            await seekVideo(video, targetSec);
            return;
        }

        if (Math.abs(video.currentTime - targetSec) > PLAYBACK_DRIFT_SEC) {
            video.currentTime = targetSec;
        }
        if (video.paused) {
            try {
                await video.play();
            } catch {
                // Autoplay rejection is non-fatal; the frame still draws.
            }
        }
    }

    /** Pause every cached video except the ones still on screen. */
    pauseAllExcept(activeIds: string[]) {
        const active = new Set(activeIds);
        for (const [id, video] of this.cache) {
            if (!active.has(id) && !video.paused) video.pause();
        }
    }

    /** Drop videos for assets that no longer exist. */
    prune(liveIds: string[]) {
        const live = new Set(liveIds);
        for (const [id, video] of this.cache) {
            if (live.has(id)) continue;
            video.pause();
            video.removeAttribute('src');
            video.load();
            this.cache.delete(id);
        }
    }

    clear() {
        this.prune([]);
    }
}

export const VideoCache = new VideoCacheHandler();
