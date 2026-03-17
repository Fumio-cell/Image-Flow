import { useEffect, useRef } from 'react';
import { useProjectStore } from '../store/useProjectStore';

export const usePlaybackLoop = () => {
    const isPlaying = useProjectStore(s => s.ui.isPlaying);

    const lastTimeRef = useRef<number>(0);
    const requestRef = useRef<number>(0);

    useEffect(() => {
        if (!isPlaying) {
            if (requestRef.current) cancelAnimationFrame(requestRef.current);
            return;
        }

        lastTimeRef.current = performance.now();

        const loop = (time: number) => {
            const delta = time - lastTimeRef.current;
            lastTimeRef.current = time;

            const state = useProjectStore.getState();
            const currentMs = state.ui.playheadMs;

            let maxDuration = 0;
            state.data.clips.forEach(c => {
                const end = c.startTimeMs + c.durationMs;
                if (end > maxDuration) maxDuration = end;
            });
            state.data.assets.forEach(a => {
                if (a.duration && a.duration > maxDuration) maxDuration = a.duration;
            });

            const nextMs = currentMs + delta;

            if (nextMs >= maxDuration && maxDuration > 0) {
                state.setPlayheadMs(maxDuration);
                state.setIsPlaying(false);
            } else {
                state.setPlayheadMs(nextMs);
                requestRef.current = requestAnimationFrame(loop);
            }
        };

        requestRef.current = requestAnimationFrame(loop);

        return () => cancelAnimationFrame(requestRef.current);
    }, [isPlaying]);
};
