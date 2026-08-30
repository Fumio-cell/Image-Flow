import { useProjectStore } from '../store/useProjectStore';
import { seekVideo } from './videoCache';

interface FrameRequest {
    clipId: string;
    assetId: string;
    sourceTimeMs: number;
}

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

        // 1a. Prepare a <video> per video asset. The worker has no DOM, so it
        // asks us for frames as it needs them and we seek/grab here.
        const videoAssets = assets.filter(a => a.type === 'video');
        const videoElements = new Map<string, HTMLVideoElement>();
        await Promise.all(videoAssets.map(a => new Promise<void>((resolve) => {
            const video = document.createElement('video');
            video.muted = true;
            video.playsInline = true;
            video.preload = 'auto';
            video.crossOrigin = 'anonymous';
            const done = () => { videoElements.set(a.id, video); resolve(); };
            video.onloadeddata = done;
            video.onerror = () => {
                console.error('[ExportUtils] Failed to load video for export:', a.name);
                resolve(); // Export continues; this clip just won't draw.
            };
            video.src = a.objectUrl;
            video.load();
        })));

        const disposeVideos = () => {
            for (const v of videoElements.values()) {
                v.removeAttribute('src');
                v.load();
            }
            videoElements.clear();
        };

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

        worker.onmessage = async (e) => {
            if (e.data.type === 'requestVideoFrames') {
                const { requestId, frames } = e.data as { requestId: number; frames: FrameRequest[] };
                const bitmaps: { clipId: string; bitmap: ImageBitmap }[] = [];

                for (const req of frames) {
                    const video = videoElements.get(req.assetId);
                    if (!video) continue;
                    try {
                        await seekVideo(video, req.sourceTimeMs / 1000);
                        if (video.readyState < 2 || video.videoWidth === 0) continue;
                        bitmaps.push({ clipId: req.clipId, bitmap: await createImageBitmap(video) });
                    } catch (err) {
                        console.error('[ExportUtils] Failed to grab video frame', err);
                    }
                }

                // Ownership moves to the worker; these are unusable here afterwards.
                worker.postMessage(
                    { type: 'videoFrames', requestId, bitmaps },
                    bitmaps.map(b => b.bitmap)
                );
                return;
            }

            console.log('[ExportUtils] Received from worker:', e.data.type, e.data);
            if (e.data.type === 'progress') {
                onProgress(e.data.progress);
            } else if (e.data.type === 'error') {
                console.error('[ExportUtils] Worker returned error:', e.data.error);
                worker.terminate();
                disposeVideos();
                onError(e.data.error);
            } else if (e.data.type === 'done') {
                console.log('[ExportUtils] Received done, creating Blob...');
                const blob = new Blob([e.data.buffer], { type: 'video/mp4' });
                const url = URL.createObjectURL(blob);
                worker.terminate();
                disposeVideos();
                onComplete(url);
            }
        };

        worker.onerror = (err) => {
            // A bare Event (no message) usually means the worker threw before it
            // could report, or a structured-clone failure — surface everything we
            // can rather than swallowing it.
            const ev = err as ErrorEvent;
            const detail = {
                message: ev?.message || '(empty)',
                filename: ev?.filename || '(none)',
                lineno: ev?.lineno ?? -1,
                colno: ev?.colno ?? -1,
                stack: ev?.error?.stack || '(no stack)',
                eventType: (err as Event)?.constructor?.name ?? typeof err,
            };
            console.error('[ExportUtils] Worker onerror triggered:', detail, err);
            worker.terminate();
            disposeVideos();
            onError(
                `Worker error: ${detail.message}\n` +
                `at ${detail.filename}:${detail.lineno}:${detail.colno}\n` +
                `event: ${detail.eventType}\n${detail.stack}`
            );
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
            videoAssets: videoAssets.map(a => ({
                assetId: a.id,
                durationMs: a.duration ?? 0,
                width: a.width ?? 0,
                height: a.height ?? 0,
            })),
            audio: audioPayload
        }, transferList); // Transfer ownership of bitmaps/audio buffers to worker

    } catch (err: any) {
        onError(err.message || String(err));
    }
};
