import { Muxer, ArrayBufferTarget } from 'mp4-muxer';
import type { Clip, ProjectSettings } from '../types';
import { drawDownscaledImage } from '../utils/imageDownscaler';
import { applyGlitch } from '../utils/glitchRenderer';

export interface ExportWorkerData {
    settings: ProjectSettings;
    clips: Clip[];
    imageBitmaps: { assetId: string, bitmap: ImageBitmap }[];
}

self.onmessage = async (e: MessageEvent<ExportWorkerData>) => {
    console.log('[Worker] Received data:', e.data);
    const { settings, clips, imageBitmaps } = e.data;

    const [wStr, hStr] = settings.resolution.split('x');
    const width = parseInt(wStr, 10);
    const height = parseInt(hStr, 10);
    console.log(`[Worker] Resolution parsed: ${width}x${height}`);

    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d')!;
    console.log('[Worker] OffscreenCanvas created');

    let maxDuration = 0;
    clips.forEach(c => {
        const end = c.startTimeMs + c.durationMs;
        if (end > maxDuration) maxDuration = end;
    });
    console.log('[Worker] Max duration:', maxDuration, 'Clips count:', clips.length);

    if (maxDuration === 0) {
        console.warn('[Worker] maxDuration is 0, returning error.');
        self.postMessage({ type: 'error', error: 'No clips found on timeline.' });
        return;
    }

    try {
        console.log('[Worker] Initializing VideoEncoder and Muxer...');

        const muxer = new Muxer({
            target: new ArrayBufferTarget(),
            video: {
                codec: 'avc',
                width,
                height
            },
            fastStart: 'in-memory'
        });

        const encoder = new VideoEncoder({
            output: (chunk, meta) => muxer.addVideoChunk(chunk, meta!),
            error: (err) => self.postMessage({ type: 'error', error: err.message })
        });

        encoder.configure({
            codec: 'avc1.640034', // Using High profile (64) level 5.2 (34) for maximum quality
            width,
            height,
            bitrate: settings.resolution === '3840x2160' ? 60_000_000 :
                settings.resolution === '1920x1920' ? 40_000_000 : 30_000_000,
            bitrateMode: 'variable',
            framerate: settings.fps
        });

        const timeStep = 1000 / settings.fps;
        let currentTimeMs = 0;
        let frameCount = 0;

        while (currentTimeMs <= maxDuration) { // <= to get the last frame
            ctx.fillStyle = '#000';
            ctx.fillRect(0, 0, width, height);

            // Enable high-quality image smoothing to prevent moiré patterns
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';

            const sortedAllClips = [...clips].sort((a, b) => a.startTimeMs - b.startTimeMs);

            const activeClips = sortedAllClips.filter(c =>
                currentTimeMs >= c.startTimeMs && currentTimeMs < c.startTimeMs + c.durationMs
            );

            for (const clip of activeClips) {
                const bitmapObj = imageBitmaps.find(b => b.assetId === clip.assetId);
                if (!bitmapObj) continue;
                const img = bitmapObj.bitmap;

                let alpha = 1.0;
                if (clip.transitionType === 'dissolve') {
                    const clipIndex = sortedAllClips.findIndex(c => c.id === clip.id);
                    if (clipIndex > 0) {
                        const prevClip = sortedAllClips[clipIndex - 1];
                        const prevEnd = prevClip.startTimeMs + prevClip.durationMs;
                        const overlapMs = Math.max(0, prevEnd - clip.startTimeMs);

                        if (overlapMs > 0 && currentTimeMs < clip.startTimeMs + overlapMs) {
                            alpha = (currentTimeMs - clip.startTimeMs) / overlapMs;
                        }
                    }
                }
                ctx.globalAlpha = Math.min(Math.max(alpha, 0), 1);

                const imgAspect = img.width / img.height;
                const canvasAspect = width / height;

                let dx = 0, dy = 0, dw = width, dh = height;
                if (clip.fitMode === 'fit') {
                    if (imgAspect > canvasAspect) {
                        dw = width; dh = width / imgAspect; dy = (height - dh) / 2;
                    } else {
                        dh = height; dw = height * imgAspect; dx = (width - dw) / 2;
                    }
                } else if (clip.fitMode === 'fill') {
                    if (imgAspect > canvasAspect) {
                        dh = height; dw = height * imgAspect; dx = (width - dw) / 2;
                    } else {
                        dw = width; dh = width / imgAspect; dy = (height - dh) / 2;
                    }
                } else if (clip.fitMode === 'center') {
                    dw = img.width; dh = img.height; dx = (width - dw) / 2; dy = (height - dh) / 2;
                }

                // Apply Ken Burns Effect (Motion)
                if (clip.motionType && clip.motionType !== 'none') {
                    const rawProgress = (currentTimeMs - clip.startTimeMs) / clip.durationMs;

                    // Apply easing curve based on motionSpeed (Scale 0.1 to 1.0 -> Power 5.0 to 0.5)
                    // Default 0.5 -> Power 1.0 (Linear)
                    const speed = clip.motionSpeed ?? 0.5;
                    const power = speed > 0 ? (0.5 / speed) : 1.0;
                    const progress = Math.pow(Math.min(Math.max(rawProgress, 0), 1), power);

                    let motionScale = 1.0;
                    let motionOffsetX = 0;
                    let motionOffsetY = 0;

                    // Adjust intensity scales
                    const intensity = clip.motionIntensity ?? 0.1;
                    const ZOOM_FACTOR = intensity * 1.5; // 0.1 -> 0.15 (prev default)
                    const PAN_FACTOR = intensity * 1.0;  // 0.1 -> 0.1 (prev default)

                    if (clip.motionType === 'zoom-in') {
                        motionScale = 1.0 + (progress * ZOOM_FACTOR);
                    } else if (clip.motionType === 'zoom-out') {
                        motionScale = (1.0 + ZOOM_FACTOR) - (progress * ZOOM_FACTOR);
                    } else if (clip.motionType === 'pan-left') {
                        motionScale = 1.0 + PAN_FACTOR;
                        const maxOffset = dw * (motionScale - 1) / 2;
                        motionOffsetX = -maxOffset + (progress * 2 * maxOffset);
                    } else if (clip.motionType === 'pan-right') {
                        motionScale = 1.0 + PAN_FACTOR;
                        const maxOffset = dw * (motionScale - 1) / 2;
                        motionOffsetX = maxOffset - (progress * 2 * maxOffset);
                    } else if (clip.motionType === 'pan-up') {
                        motionScale = 1.0 + PAN_FACTOR;
                        const maxOffset = dh * (motionScale - 1) / 2;
                        motionOffsetY = -maxOffset + (progress * 2 * maxOffset);
                    } else if (clip.motionType === 'pan-down') {
                        motionScale = 1.0 + PAN_FACTOR;
                        const maxOffset = dh * (motionScale - 1) / 2;
                        motionOffsetY = maxOffset - (progress * 2 * maxOffset);
                    }

                    const cx = dx + dw / 2;
                    const cy = dy + dh / 2;
                    const newW = dw * motionScale;
                    const newH = dh * motionScale;

                    dx = cx - newW / 2 + motionOffsetX;
                    dy = cy - newH / 2 + motionOffsetY;
                    dw = newW;
                    dh = newH;
                }

                drawDownscaledImage(ctx as any, img as any, dx, dy, dw, dh);
                
                if (clip.glitchAmount && clip.glitchIntensity) {
                    applyGlitch(ctx as any, dx, dy, dw, dh, {
                        amount: clip.glitchAmount,
                        intensity: clip.glitchIntensity,
                        seed: currentTimeMs
                    });
                }

                ctx.globalAlpha = 1.0;
            }

            const frame = new VideoFrame(canvas, { timestamp: currentTimeMs * 1000 });
            encoder.encode(frame, { keyFrame: frameCount % (settings.fps * 2) === 0 });
            frame.close();

            // Yield to let encoder breathe
            if (encoder.encodeQueueSize > 30) {
                await new Promise(r => setTimeout(r, 10));
            }

            currentTimeMs += timeStep;
            frameCount++;

            if (frameCount % 30 === 0) {
                self.postMessage({ type: 'progress', progress: currentTimeMs / maxDuration });
            }
        }

        console.log('[Worker] Render loop finished. Flushing encoder...');
        await encoder.flush();
        console.log('[Worker] Encoder flushed. Finalizing muxer...');
        muxer.finalize();
        const buffer = muxer.target.buffer;

        console.log('[Worker] Muxer finalized. Sending done message with buffer size:', buffer.byteLength);
        self.postMessage({ type: 'done', buffer }, { transfer: [buffer] } as any);

        imageBitmaps.forEach(b => b.bitmap.close());
    } catch (workerErr: any) {
        console.error('[Worker] Fatal error:', workerErr);
        self.postMessage({ type: 'error', error: workerErr.message || String(workerErr) });
    }
};
