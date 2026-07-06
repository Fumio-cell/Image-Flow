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

        // 1b. Decode the project's audio track (if any) to raw PCM so the
        // worker can re-encode it at a high, consistent bitrate rather than
        // just muxing the source file through untouched. Decoding requires
        // an AudioContext, which isn't available inside the worker, so this
        // has to happen here on the main thread.
        let audioPayload: { channelData: Float32Array[]; numberOfChannels: number; sampleRate: number } | undefined;
        const audioAsset = assets.find(a => a.type === 'audio');
        if (audioAsset) {
            try {
                const arrayBuffer = await audioAsset.file.arrayBuffer();
                const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;
                // 48kHz: a standard, broadly-supported rate for AAC that also
                // matches/exceeds most source material, so decoding into it
                // here doubles as the resample step.
                const audioCtx = new AudioContextCtor({ sampleRate: 48000 });
                const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
                const numberOfChannels = audioBuffer.numberOfChannels;
                const channelData: Float32Array[] = [];
                for (let c = 0; c < numberOfChannels; c++) {
                    // .slice() copies out of the AudioBuffer's own storage so
                    // the buffer we transfer to the worker is independent
                    // (transferring detaches the underlying ArrayBuffer).
                    channelData.push(audioBuffer.getChannelData(c).slice());
                }
                audioPayload = { channelData, numberOfChannels, sampleRate: audioBuffer.sampleRate };
                await audioCtx.close();
            } catch (err) {
                console.error('[ExportUtils] Failed to decode audio for export; exporting without audio.', err);
                audioPayload = undefined;
            }
        }

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
        console.log('[ExportUtils] Sending data to worker. Bitmaps length:', imageBitmaps.length, 'Audio:', !!audioPayload);
        const transferList: Transferable[] = imageBitmaps.map(b => b.bitmap);
        if (audioPayload) {
            transferList.push(...audioPayload.channelData.map(c => c.buffer));
        }
        worker.postMessage({
            settings,
            clips,
            imageBitmaps,
            audio: audioPayload
        }, transferList); // Transfer ownership of bitmaps/audio buffers to worker

    } catch (err: any) {
        onError(err.message || String(err));
    }
};
