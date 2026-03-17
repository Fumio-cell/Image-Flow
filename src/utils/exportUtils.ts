import { useProjectStore } from '../store/useProjectStore';

export const startMP4Export = async (
    onProgress: (progress: number) => void,
    onComplete: (url: string) => void,
    onError: (err: string) => void
) => {
    try {
        const state = useProjectStore.getState();
        const { settings, clips, assets } = state.data;

        if (!('VideoEncoder' in window)) {
            throw new Error("export non-supported: This browser doesn't support WebCodecs API.");
        }

        // 1. Prepare image bitmaps for worker
        const imageAssets = assets.filter(a => a.type === 'image');
        const imageBitmaps = await Promise.all(
            imageAssets.map(async (a) => {
                const bitmap = await createImageBitmap(a.file);
                return { assetId: a.id, bitmap };
            })
        );

        // 2. Init worker
        console.log('[ExportUtils] Initializing Worker...');
        const worker = new Worker(new URL('../workers/exportWorker.ts', import.meta.url), { type: 'module' });

        worker.onmessage = (e) => {
            console.log('[ExportUtils] Received from worker:', e.data.type, e.data);
            if (e.data.type === 'progress') {
                onProgress(e.data.progress);
            } else if (e.data.type === 'error') {
                console.error('[ExportUtils] Worker returned error:', e.data.error);
                worker.terminate();
                onError(e.data.error);
            } else if (e.data.type === 'done') {
                console.log('[ExportUtils] Received done, creating Blob...');
                const blob = new Blob([e.data.buffer], { type: 'video/mp4' });
                const url = URL.createObjectURL(blob);
                worker.terminate();
                onComplete(url);
            }
        };

        worker.onerror = (err) => {
            console.error('[ExportUtils] Worker onerror triggered:', err);
            worker.terminate();
            onError(err.message || 'Worker syntax or runtime error');
        };

        // 3. Start encode
        console.log('[ExportUtils] Sending data to worker. Bitmaps length:', imageBitmaps.length);
        worker.postMessage({
            settings,
            clips,
            imageBitmaps
        }, imageBitmaps.map(b => b.bitmap) as any); // Transfer ownership of bitmaps to worker

    } catch (err: any) {
        onError(err.message || String(err));
    }
};
