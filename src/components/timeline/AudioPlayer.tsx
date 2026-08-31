import React, { useEffect, useRef } from 'react';
import { useProjectStore } from '../../store/useProjectStore';

/**
 * Plays the audio clips on the timeline during preview.
 *
 * Each audio clip gets its own <audio> element so several can overlap, and each
 * respects where it sits on the timeline plus its own volume — matching what
 * the export will mix. Video clips' built-in audio is handled separately, by
 * the preview canvas.
 */
export const AudioPlayer: React.FC = () => {
    const isPlaying = useProjectStore(s => s.ui.isPlaying);
    const playheadMs = useProjectStore(s => s.ui.playheadMs);
    const clips = useProjectStore(s => s.data.clips);
    const assets = useProjectStore(s => s.data.assets);

    const elements = useRef<Map<string, HTMLAudioElement>>(new Map());

    const audioClips = clips.filter(c => {
        const a = assets.find(x => x.id === c.assetId);
        return a?.type === 'audio';
    });

    // Create/dispose elements as audio clips come and go.
    useEffect(() => {
        const live = new Set(audioClips.map(c => c.id));
        for (const [id, el] of elements.current) {
            if (live.has(id)) continue;
            el.pause();
            el.removeAttribute('src');
            elements.current.delete(id);
        }
        for (const clip of audioClips) {
            if (elements.current.has(clip.id)) continue;
            const asset = assets.find(a => a.id === clip.assetId);
            if (!asset) continue;
            const el = new Audio();
            el.preload = 'auto';
            el.src = asset.objectUrl;
            elements.current.set(clip.id, el);
        }
    }, [audioClips, assets]);

    // Keep every element aligned with the playhead, its clip window and level.
    useEffect(() => {
        for (const clip of audioClips) {
            const el = elements.current.get(clip.id);
            if (!el) continue;

            const clipEnd = clip.startTimeMs + clip.durationMs;
            const inRange = playheadMs >= clip.startTimeMs && playheadMs < clipEnd;

            el.volume = Math.min(1, Math.max(0, clip.volume ?? 1));
            el.muted = clip.muted ?? false;

            if (!inRange || !isPlaying) {
                if (!el.paused) el.pause();
                continue;
            }

            const targetSec = ((clip.sourceInMs ?? 0) + (playheadMs - clip.startTimeMs)) / 1000;
            if (Math.abs(el.currentTime - targetSec) > 0.15) {
                el.currentTime = targetSec;
            }
            if (el.paused) {
                el.play().catch(err => console.warn('[AudioPlayer] Playback blocked', err));
            }
        }
    }, [isPlaying, playheadMs, audioClips]);

    // Silence everything on unmount.
    useEffect(() => {
        const map = elements.current;
        return () => {
            for (const el of map.values()) {
                el.pause();
                el.removeAttribute('src');
            }
            map.clear();
        };
    }, []);

    return null;
};
