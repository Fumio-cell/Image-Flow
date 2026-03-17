import React, { useEffect, useRef } from 'react';
import { useProjectStore } from '../../store/useProjectStore';

export const AudioPlayer: React.FC = () => {
    const isPlaying = useProjectStore(s => s.ui.isPlaying);
    const playheadMs = useProjectStore(s => s.ui.playheadMs);
    const assets = useProjectStore(s => s.data.assets);

    const audioAsset = assets.find(a => a.type === 'audio');
    const audioRef = useRef<HTMLAudioElement>(null);

    useEffect(() => {
        const audio = audioRef.current;
        if (!audio || !audioAsset) return;

        if (isPlaying) {
            // Keep it synced
            const targetTime = playheadMs / 1000;
            if (Math.abs(audio.currentTime - targetTime) > 0.1) {
                audio.currentTime = targetTime;
            }
            audio.play().catch(e => console.warn("Audio play blocked", e));
        } else {
            audio.pause();
            audio.currentTime = playheadMs / 1000;
        }
    }, [isPlaying, audioAsset]);

    useEffect(() => {
        const audio = audioRef.current;
        if (!audio || isPlaying) return;
        // Scrubbing sync when paused
        audio.currentTime = playheadMs / 1000;
    }, [playheadMs, isPlaying]);

    if (!audioAsset) return null;

    return <audio ref={audioRef} src={audioAsset.objectUrl} />;
};
