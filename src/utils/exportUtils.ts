import { useProjectStore } from '../store/useProjectStore';
import { seekVideo } from './videoCache';
import { isAiff, decodeAiffToAudioBuffer } from './aiffDecoder';

interface FrameRequest {
    clipId: string;
    assetId: string;
    sourceTimeMs: number;
}

export const startMP4Export = async (
    onProgress: (progress: number) => void,
    onComplete: (url: string | null) => void,
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

        const disposeAudio = () => {
            mixSources.length = 0;
            decodeCache.clear();
            if (audioCtxRef) {
                audioCtxRef.close().catch(() => { /* already closed */ });
                audioCtxRef = null;
            }
        };

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
        let audioPayload: { numberOfChannels: number; sampleRate: number; totalFrames: number } | undefined;
        let audioCtxRef: AudioContext | null = null;
        const decodeCache = new Map<string, AudioBuffer>();

        /**
         * One contributor to the final mix: either the standalone audio asset
         * (laid at the timeline origin) or a video clip's own soundtrack,
         * positioned and scaled the way the clip is on the timeline.
         */
        interface MixSource {
            buffer: AudioBuffer;
            startFrame: number;   // where it lands on the export timeline
            sourceInFrame: number; // offset into its own media
            lengthFrames: number;  // how much of it to use
            gain: number;
        }
        const mixSources: MixSource[] = [];
        // 1b/1c. Every clip that carries sound contributes to the mix, placed at
        // its own spot on the timeline with its own level: audio clips the user
        // positioned, plus each video clip's built-in soundtrack.
        const SAMPLE_RATE = 48000;
        const ensureCtx = () => {
            if (!audioCtxRef) {
                const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
                // 48kHz: broadly supported for AAC and at least matches most
                // source material, so decoding here doubles as the resample.
                audioCtxRef = new Ctor({ sampleRate: SAMPLE_RATE });
            }
            return audioCtxRef;
        };

        const decodeAsset = async (asset: typeof assets[number]): Promise<AudioBuffer | null> => {
            const cached = decodeCache.get(asset.id);
            if (cached) return cached;
            if (!asset.file) return null;
            const raw = await asset.file.arrayBuffer();
            const ctx = ensureCtx();
            const decoded = isAiff(raw)
                ? decodeAiffToAudioBuffer(raw, ctx)
                : await ctx.decodeAudioData(raw);
            decodeCache.set(asset.id, decoded);
            return decoded;
        };

        for (const clip of clips) {
            if (clip.muted) continue;
            const asset = assets.find(a => a.id === clip.assetId);
            if (!asset) continue;

            const carriesAudio =
                asset.type === 'audio' ||
                (asset.type === 'video' && asset.hasAudio === true);
            if (!carriesAudio) continue;

            try {
                const decoded = await decodeAsset(asset);
                if (!decoded) continue;
                const rate = decoded.sampleRate;
                mixSources.push({
                    buffer: decoded,
                    startFrame: Math.round((clip.startTimeMs / 1000) * rate),
                    sourceInFrame: Math.round(((clip.sourceInMs ?? 0) / 1000) * rate),
                    lengthFrames: Math.round((clip.durationMs / 1000) * rate),
                    gain: clip.volume ?? 1,
                });
            } catch (err) {
                console.warn('[ExportUtils] Could not decode audio for clip; it will be silent.', asset.name, err);
            }
        }

        if (mixSources.length > 0) {
            const numberOfChannels = Math.max(...mixSources.map(m => m.buffer.numberOfChannels));
            const sampleRate = mixSources[0].buffer.sampleRate;
            const totalFrames = Math.max(
                ...mixSources.map(m => m.startFrame + Math.min(m.lengthFrames, m.buffer.length - m.sourceInFrame))
            );
            audioPayload = { numberOfChannels, sampleRate, totalFrames: Math.max(0, totalFrames) };
            console.log(`[ExportUtils] Mixing ${mixSources.length} audio source(s), ${numberOfChannels}ch @ ${sampleRate}Hz`);
        }

        // 2. Init worker
        // Pick the destination first. Streaming into it keeps memory flat, which
        // is what makes long exports possible at all — buffering a 30-minute
        // 1080p master in RAM would be gigabytes.
        let fileHandle: FileSystemFileHandle | undefined;
        const picker = (window as unknown as {
            showSaveFilePicker?: (o: unknown) => Promise<FileSystemFileHandle>;
        }).showSaveFilePicker;

        if (picker) {
            try {
                fileHandle = await picker({
                    suggestedName: `image-flow-export-${Date.now()}.mp4`,
                    types: [{ description: 'MP4 video', accept: { 'video/mp4': ['.mp4'] } }],
                });
            } catch (pickErr) {
                if ((pickErr as DOMException)?.name === 'AbortError') {
                    onError('Export cancelled.');
                    return;
                }
                console.warn('[ExportUtils] Save dialog unavailable, falling back to in-memory export.', pickErr);
            }
        } else {
            console.warn('[ExportUtils] File System Access API not supported; exporting via memory. Long exports may run out of RAM.');
        }

        const workerUrl = new URL('../workers/exportWorker.ts', import.meta.url);
        console.log('[ExportUtils] Initializing Worker from:', workerUrl.href);

        // If the module can't even be fetched, say so plainly instead of
        // surfacing an empty Event later.
        try {
            const probe = await fetch(workerUrl.href, { method: 'GET' });
            console.log('[ExportUtils] Worker script fetch:', probe.status, probe.statusText, probe.headers.get('content-type'));
            if (!probe.ok) {
                throw new Error(`Worker script not reachable: HTTP ${probe.status} at ${workerUrl.href}`);
            }
        } catch (probeErr) {
            console.error('[ExportUtils] Worker script probe failed:', probeErr);
        }

        const worker = new Worker(workerUrl, { type: 'module' });

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

            if (e.data.type === 'requestAudioChunk') {
                const { requestId, frameOffset, frameCount } = e.data as {
                    requestId: number; frameOffset: number; frameCount: number;
                };
                let planar: Float32Array | null = null;
                if (mixSources.length > 0 && audioPayload) {
                    const ch = audioPayload.numberOfChannels;
                    planar = new Float32Array(frameCount * ch);

                    // Sum every source that overlaps this window, then clamp.
                    for (const src of mixSources) {
                        const usable = Math.min(src.lengthFrames, src.buffer.length - src.sourceInFrame);
                        if (usable <= 0) continue;
                        const from = Math.max(frameOffset, src.startFrame);
                        const to = Math.min(frameOffset + frameCount, src.startFrame + usable);
                        if (to <= from) continue;

                        for (let c = 0; c < ch; c++) {
                            // Mono sources feed every output channel.
                            const srcCh = Math.min(c, src.buffer.numberOfChannels - 1);
                            const data = src.buffer.getChannelData(srcCh);
                            const outBase = c * frameCount;
                            for (let i = from; i < to; i++) {
                                const srcIdx = src.sourceInFrame + (i - src.startFrame);
                                planar[outBase + (i - frameOffset)] += data[srcIdx] * src.gain;
                            }
                        }
                    }
                    for (let i = 0; i < planar.length; i++) {
                        if (planar[i] > 1) planar[i] = 1;
                        else if (planar[i] < -1) planar[i] = -1;
                    }
                }
                worker.postMessage(
                    { type: 'audioChunk', requestId, planar },
                    planar ? [planar.buffer] : []
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
                disposeAudio();
                onError(e.data.error);
            } else if (e.data.type === 'done') {
                worker.terminate();
                disposeVideos();
                disposeAudio();
                if (e.data.streamedToDisk) {
                    console.log('[ExportUtils] Export written directly to disk.');
                    onComplete(null); // Already saved; nothing to download.
                } else {
                    console.log('[ExportUtils] Received done, creating Blob...');
                    const blob = new Blob([e.data.buffer], { type: 'video/mp4' });
                    onComplete(URL.createObjectURL(blob));
                }
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
            disposeAudio();
            onError(
                `Worker error: ${detail.message}\n` +
                `at ${detail.filename}:${detail.lineno}:${detail.colno}\n` +
                `event: ${detail.eventType}\n${detail.stack}`
            );
        };

        // 3. Start encode
        console.log('[ExportUtils] Sending data to worker. Bitmaps length:', imageBitmaps.length, 'Audio:', !!audioPayload);
        const transferList: Transferable[] = imageBitmaps.map(b => b.bitmap);
        worker.postMessage({
            settings,
            clips,
            fileHandle,
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
