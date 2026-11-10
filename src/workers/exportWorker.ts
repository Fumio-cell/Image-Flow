import { Muxer, ArrayBufferTarget, FileSystemWritableFileStreamTarget } from 'mp4-muxer';
import type { Clip, ProjectSettings } from '../types';
import { drawDownscaledImage } from '../utils/imageDownscaler';
import { applyGlitch } from '../utils/glitchRenderer';
import { renderDeltaFlowFrame, DELTA_FLOW_WORK_RES } from '../utils/deltaFlowRenderer';
import { DeltaFlowFieldCache } from '../utils/deltaFlowFieldCache';
import { renderBreathingMorphFrame, BREATHING_MORPH_WORK_RES } from '../utils/breathingMorphRenderer';
import { BreathingMorphFieldCache } from '../utils/breathingMorphFieldCache';
import { getSourceTimeSec } from '../utils/videoTiming';
import { findPrevVisualClip, type PrevLookupAsset } from '../utils/prevVisualClip';
import { exportLengthMs, exportFrameCount, exportFrameTimeMs, clipReaction, reactDelta, reactBreathing, reactGlitch, REACTION } from '../utils/audioReaction';
import { resolveGlitchParams } from '../utils/glitchParams';

export interface VideoAssetMeta {
    assetId: string;
    durationMs: number;
    width: number;
    height: number;
}

export interface ExportWorkerData {
    settings: ProjectSettings;
    clips: Clip[];
    /**
     * When present, the muxer writes straight to this file as it encodes, so
     * peak memory stays flat no matter how long the piece is. Without it we
     * fall back to buffering the whole MP4 in RAM (browsers with no File
     * System Access API).
     */
    fileHandle?: FileSystemFileHandle;
    /** Music level per video frame (frame i = exportFrameTimeMs(i, fps)), computed on the main thread. Absent when no clip reacts. */
    audioLevels?: Float32Array;
    imageBitmaps: { assetId: string, bitmap: ImageBitmap }[];
    videoAssets?: VideoAssetMeta[];
    audio?: {
        // Metadata only — the PCM itself stays on the main thread and is
        // streamed over in chunks so long tracks don't have to fit in memory twice.
        numberOfChannels: number;
        sampleRate: number;
        totalFrames: number;
    };
}

// Proves the worker module parsed and executed. If this line never appears in
// the console, the failure is module loading/resolution, not the export logic.
console.log('[Worker] module loaded');

// AAC-LC per channel — 128kbps mono / 256kbps stereo, a solidly
// high-quality/near-transparent range without ballooning export time.
const AUDIO_BITRATE_PER_CHANNEL = 128_000;
const AUDIO_CHUNK_FRAMES = 4096;

// The worker has no <video>, so it asks the main thread to seek and hand back
// ImageBitmaps. Requests are keyed by id so responses can be awaited.
type FrameResponse = { clipId: string; bitmap: ImageBitmap }[];
const pendingFrameRequests = new Map<number, (bitmaps: FrameResponse) => void>();
const pendingAudioRequests = new Map<number, (planar: Float32Array | null) => void>();
let nextRequestId = 0;

/** Pull one slice of interleaved-by-channel PCM from the main thread. */
function requestAudioChunk(frameOffset: number, frameCount: number): Promise<Float32Array | null> {
    const requestId = nextRequestId++;
    return new Promise((resolve) => {
        pendingAudioRequests.set(requestId, resolve);
        self.postMessage({ type: 'requestAudioChunk', requestId, frameOffset, frameCount });
    });
}

function requestVideoFrames(
    frames: { clipId: string; assetId: string; sourceTimeMs: number }[]
): Promise<FrameResponse> {
    if (frames.length === 0) return Promise.resolve([]);
    const requestId = nextRequestId++;
    return new Promise((resolve) => {
        pendingFrameRequests.set(requestId, resolve);
        self.postMessage({ type: 'requestVideoFrames', requestId, frames });
    });
}

self.onmessage = async (e: MessageEvent<ExportWorkerData | { type: string; requestId: number; bitmaps: FrameResponse; planar: Float32Array | null }>) => {
    if ((e.data as { type?: string }).type === 'audioChunk') {
        const { requestId, planar } = e.data as { requestId: number; planar: Float32Array | null };
        const resolve = pendingAudioRequests.get(requestId);
        if (resolve) {
            pendingAudioRequests.delete(requestId);
            resolve(planar);
        }
        return;
    }

    // Frame deliveries are replies to our own requests, not a new export job.
    if ((e.data as { type?: string }).type === 'videoFrames') {
        const { requestId, bitmaps } = e.data as { type: 'videoFrames'; requestId: number; bitmaps: FrameResponse };
        const resolve = pendingFrameRequests.get(requestId);
        if (resolve) {
            pendingFrameRequests.delete(requestId);
            resolve(bitmaps);
        }
        return;
    }

    console.log('[Worker] Received export job');
    const job = e.data as ExportWorkerData;
    if (!job || !job.settings) {
        // Should be impossible now that frame replies return early above, but if
        // it ever happens again this reports instead of dying silently.
        self.postMessage({
            type: 'error',
            error: `Worker received a message with no settings (keys: ${Object.keys(job ?? {}).join(',') || 'none'})`,
        });
        return;
    }
    const { settings, clips, imageBitmaps, videoAssets, audio, fileHandle, audioLevels } = job;
    let musicLevelMisses = 0; // reads past the end of audioLevels (must stay 0; such a read gives level 0)
    const videoMetaById = new Map((videoAssets ?? []).map(v => [v.assetId, v]));
    // The worker is only handed image and video assets, so a clip pointing at
    // anything else is an audio clip. Give the previous-clip lookup that view.
    const imageIds = new Set(imageBitmaps.map(b => b.assetId));
    const lookupAssets: PrevLookupAsset[] = clips.map(c => ({
        id: c.assetId,
        type: videoMetaById.has(c.assetId) ? 'video' : imageIds.has(c.assetId) ? 'image' : 'audio',
    }));
    const hasAudio = !!audio && audio.totalFrames > 0 && typeof AudioEncoder !== 'undefined';
    if (audio && !hasAudio && typeof AudioEncoder === 'undefined') {
        console.warn('[Worker] AudioEncoder not supported in this browser; exporting without audio.');
    }

    const [wStr, hStr] = settings.resolution.split('x');
    const width = parseInt(wStr, 10);
    const height = parseInt(hStr, 10);
    console.log(`[Worker] Resolution parsed: ${width}x${height}`);

    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d')!;
    console.log('[Worker] OffscreenCanvas created');

    // The video ends where the last VISUAL clip ends. A longer audio clip is cut
    // there; a shorter one leaves silence (the audio track is padded below).
    // With no visual clip at all (an audio-only project) the length is the largest
    // end over all clips, as it always was.
    // (One shared rule, also used by the main thread to size the music levels.)
    const maxDuration = exportLengthMs(clips, lookupAssets);
    console.log('[Worker] Max duration:', maxDuration, 'Clips count:', clips.length);

    if (maxDuration === 0) {
        console.warn('[Worker] maxDuration is 0, returning error.');
        self.postMessage({ type: 'error', error: 'No clips found on timeline.' });
        return;
    }

    // Upper bounds so the muxer can reserve metadata space up front and still
    // write Fast Start output while streaming (no in-memory buffering).
    // Overshooting only wastes a little reserved header space; undershooting
    // aborts the export, so both estimates are deliberately generous.
    const expectedVideoChunks = Math.ceil(maxDuration / (1000 / settings.fps)) + 16;
    // AAC-LC emits one chunk per 1024 samples regardless of how large the
    // AudioData blocks we feed it are — count in encoder frames, not input blocks.
    const AAC_FRAME_SAMPLES = 1024;
    const expectedAudioChunks = hasAudio
        ? Math.ceil(Math.ceil((maxDuration / 1000) * audio!.sampleRate) / AAC_FRAME_SAMPLES) + 64
        : undefined;

    let writableStream: FileSystemWritableFileStream | null = null;

    try {
        console.log('[Worker] Initializing VideoEncoder and Muxer...');

        if (fileHandle) {
            writableStream = await fileHandle.createWritable();
            console.log('[Worker] Streaming output straight to disk.');
        } else {
            console.log('[Worker] No file handle — buffering output in memory.');
        }

        const muxer = new Muxer({
            target: writableStream
                ? new FileSystemWritableFileStreamTarget(writableStream)
                : new ArrayBufferTarget(),
            video: {
                codec: 'avc',
                width,
                height
            },
            audio: hasAudio ? {
                codec: 'aac',
                numberOfChannels: audio!.numberOfChannels,
                sampleRate: audio!.sampleRate
            } : undefined,
            // Streaming can't buffer everything, so reserve space instead; the
            // in-memory fallback keeps the original behaviour.
            fastStart: writableStream
                ? { expectedVideoChunks, expectedAudioChunks }
                : 'in-memory'
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

        let currentTimeMs = 0;
        let frameCount = 0;
        // Frame count and frame times come from the shared helpers, so the main thread (music levels)
        // and this loop cannot disagree. 7000 ms at 30 fps is 210 frames (0 .. 6966.7 ms); the old `<=`
        // loop also encoded a frame AT 7000 ms, where no clip is active (a black last frame).
        const totalVideoFrames = exportFrameCount(maxDuration, settings.fps);
        // Integer microsecond timestamp of frame i, from the same shared frame-time helper.
        const frameTimestampUs = (i: number) => Math.round(exportFrameTimeMs(i, settings.fps) * 1000);

        while (frameCount < totalVideoFrames) {
            currentTimeMs = exportFrameTimeMs(frameCount, settings.fps);
            // Music level for this frame. Past the end of the array it is 0 (counted, never thrown).
            let currentAudioLevel = 0;
            if (audioLevels) {
                if (frameCount < audioLevels.length) currentAudioLevel = audioLevels[frameCount];
                else musicLevelMisses++;
            }
            ctx.fillStyle = '#000';
            ctx.fillRect(0, 0, width, height);

            // Enable high-quality image smoothing to prevent moiré patterns
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';

            const sortedAllClips = [...clips].sort((a, b) => a.startTimeMs - b.startTimeMs);

            const activeClips = sortedAllClips.filter(c =>
                currentTimeMs >= c.startTimeMs && currentTimeMs < c.startTimeMs + c.durationMs
            );

            // Ask for every video frame this timestamp needs in one round trip —
            // one request per clip would multiply the seek latency.
            const videoRequests = activeClips
                .filter(c => videoMetaById.has(c.assetId))
                .map(c => {
                    const meta = videoMetaById.get(c.assetId)!;
                    return {
                        clipId: c.id,
                        assetId: c.assetId,
                        sourceTimeMs: getSourceTimeSec(c, meta.durationMs, currentTimeMs) * 1000,
                    };
                });
            const videoFrames = await requestVideoFrames(videoRequests);
            const videoFrameByClip = new Map(videoFrames.map(f => [f.clipId, f.bitmap]));

            // Every video bitmap fetched for this frame must be closed once drawn —
            // at 1080p a leak here reaches GBs within a few hundred frames.
            const frameBitmapsToClose: ImageBitmap[] = videoFrames.map(f => f.bitmap);

            /** Resolve a clip to its drawable source, image or video alike. */
            const sourceForClip = (c: Clip): ImageBitmap | null => {
                const vf = videoFrameByClip.get(c.id);
                if (vf) return vf;
                return imageBitmaps.find(b => b.assetId === c.assetId)?.bitmap ?? null;
            };

            for (const clip of activeClips) {
                const img = sourceForClip(clip);
                if (!img) continue;
                const isVideo = videoMetaById.has(clip.assetId);

                let alpha = 1.0;
                let deltaFlowPrevImg: ImageBitmap | null = null;
                let deltaFlowPairKey: string | null = null;
                let deltaFlowProgress = 1;

                // Breathing Morph: same overlap-driven pattern as Delta Flow
                let breathingMorphPrevImg: ImageBitmap | null = null;
                let breathingMorphPairKey: string | null = null;
                let breathingMorphProgress = 1;

                // Progress (0..1) within the overlap with the previous clip, or null
                // if there's no overlap right now. Independent of transitionType so
                // Glitch can gate on it regardless of which transition is selected.
                let overlapProgress: number | null = null;

                const prevClip = findPrevVisualClip(clips, lookupAssets, clip);
                if (prevClip) {
                    const prevEnd = prevClip.startTimeMs + prevClip.durationMs;
                    const overlapMs = Math.max(0, prevEnd - clip.startTimeMs);

                    if (overlapMs > 0 && currentTimeMs < clip.startTimeMs + overlapMs) {
                        overlapProgress = (currentTimeMs - clip.startTimeMs) / overlapMs;

                        if (clip.transitionType === 'dissolve') {
                            alpha = overlapProgress;
                        } else if (clip.transitionType === 'delta-flow' && !isVideo) {
                            // Matches the preview: these build a displacement field from a
                            // fixed pair of stills, so a moving source can't drive them.
                            deltaFlowProgress = overlapProgress;
                            const prevBitmapObj = !videoMetaById.has(prevClip.assetId)
                                ? imageBitmaps.find(b => b.assetId === prevClip.assetId)
                                : undefined;
                            if (prevBitmapObj) {
                                deltaFlowPrevImg = prevBitmapObj.bitmap;
                                deltaFlowPairKey = `${prevClip.id}:${prevClip.assetId}->${clip.id}:${clip.assetId}`;
                            }
                        } else if (clip.transitionType === 'breathing-morph' && !isVideo) {
                            breathingMorphProgress = overlapProgress;
                            const prevBitmapObj = !videoMetaById.has(prevClip.assetId)
                                ? imageBitmaps.find(b => b.assetId === prevClip.assetId)
                                : undefined;
                            if (prevBitmapObj) {
                                breathingMorphPrevImg = prevBitmapObj.bitmap;
                                breathingMorphPairKey = `${prevClip.id}:${prevClip.assetId}->${clip.id}:${clip.assetId}`;
                            }
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

                    motionScale += clipReaction(clip, currentAudioLevel) * ZOOM_FACTOR * REACTION.zoom;
                    const cx = dx + dw / 2;
                    const cy = dy + dh / 2;
                    const newW = dw * motionScale;
                    const newH = dh * motionScale;

                    dx = cx - newW / 2 + motionOffsetX;
                    dy = cy - newH / 2 + motionOffsetY;
                    dw = newW;
                    dh = newH;
                }

                if (clip.transitionType === 'delta-flow' && !isVideo && deltaFlowPrevImg && deltaFlowPairKey) {
                    const sensitivity = clip.deltaFlowSensitivity ?? 0.55;
                    const strength = clip.deltaFlowStrength ?? 0.60;
                    const noiseAmount = clip.deltaFlowNoiseAmount ?? 0.30;

                    const field = DeltaFlowFieldCache.getField(deltaFlowPairKey, deltaFlowPrevImg, img, sensitivity, DELTA_FLOW_WORK_RES, dw, dh);

                    renderDeltaFlowFrame(
                        ctx as any, field, deltaFlowProgress,
                        { sensitivity, ...reactDelta(strength, noiseAmount, clipReaction(clip, currentAudioLevel)) },
                        dx, dy, dw, dh
                    );
                } else if (clip.transitionType === 'breathing-morph' && !isVideo && breathingMorphPrevImg && breathingMorphPairKey) {
                    const turbulence = clip.breathingTurbulence ?? 0.5;
                    const swirl = clip.breathingSwirl ?? 0.5;

                    const field = BreathingMorphFieldCache.getField(breathingMorphPairKey, breathingMorphPrevImg, img, BREATHING_MORPH_WORK_RES, dw, dh);

                    renderBreathingMorphFrame(
                        ctx as any, field, breathingMorphProgress,
                        reactBreathing(turbulence, swirl, clipReaction(clip, currentAudioLevel)),
                        dx, dy, dw, dh
                    );
                } else {
                    drawDownscaledImage(ctx as any, img as any, dx, dy, dw, dh);
                }

                // Glitch transition: fires only during the overlap with the previous clip
                const glitch = resolveGlitchParams(clip);
                if (clip.transitionType === 'glitch' && glitch.amount && glitch.intensity && overlapProgress !== null) {
                    const g = reactGlitch(glitch, clipReaction(clip, currentAudioLevel));
                    applyGlitch(ctx as any, dx, dy, dw, dh, {
                        amount: g.amount,
                        intensity: g.intensity,
                        displacement: g.displacement,
                        seed: currentTimeMs
                    });
                }

                ctx.globalAlpha = 1.0;
            }

            // Free the decoded video frames now that they're composited.
            for (const bmp of frameBitmapsToClose) bmp.close();
            frameBitmapsToClose.length = 0;

            // Every frame gets an explicit timestamp AND duration. The encoded chunk's duration is copied from
            // the input frame; a frame without one yields chunk.duration === null on Chrome 157+ (older Chromium
            // gave 0), and mp4-muxer throws on null. Durations tile exactly: dur(i) = ts(i + 1) - ts(i); the last
            // frame repeats the previous one (a single-frame export uses one frame period).
            const timestampUs = frameTimestampUs(frameCount);
            const durationUs = frameCount + 1 < totalVideoFrames
                ? frameTimestampUs(frameCount + 1) - timestampUs
                : totalVideoFrames > 1
                    ? timestampUs - frameTimestampUs(frameCount - 1)
                    : Math.round(1_000_000 / settings.fps);
            const frame = new VideoFrame(canvas, { timestamp: timestampUs, duration: durationUs });
            encoder.encode(frame, { keyFrame: frameCount % (settings.fps * 2) === 0 });
            frame.close();

            // Yield to let encoder breathe
            if (encoder.encodeQueueSize > 30) {
                await new Promise(r => setTimeout(r, 10));
            }

            frameCount++;

            if (frameCount % 30 === 0) {
                self.postMessage({ type: 'progress', progress: frameCount / totalVideoFrames });
            }
        }

        console.log('[Worker] Render loop finished. Flushing video encoder...');
        await encoder.flush();
        console.log('[Worker] Video encoder flushed.');

        if (hasAudio) {
            console.log('[Worker] Encoding audio track...');
            const { numberOfChannels, sampleRate } = audio!;
            // Exactly the video's length: audio outlasting the picture is cut, and audio
            // that ends early is followed by silence (the mixer returns zeros past its end).
            const totalFrames = Math.floor((maxDuration / 1000) * sampleRate);

            if (totalFrames > 0) {
                let audioEncoderError: Error | null = null;
                const audioEncoder = new AudioEncoder({
                    output: (chunk, meta) => muxer.addAudioChunk(chunk, meta!),
                    error: (err) => { audioEncoderError = err; }
                });
                audioEncoder.configure({
                    codec: 'mp4a.40.2', // AAC-LC
                    numberOfChannels,
                    sampleRate,
                    bitrate: AUDIO_BITRATE_PER_CHANNEL * numberOfChannels
                });

                let frameOffset = 0;
                while (frameOffset < totalFrames) {
                    const frames = Math.min(AUDIO_CHUNK_FRAMES, totalFrames - frameOffset);
                    const chunk = await requestAudioChunk(frameOffset, frames);
                    if (!chunk) break; // Source went away mid-export.
                    const planar = new Float32Array(chunk.length);
                    planar.set(chunk);

                    const audioData = new AudioData({
                        format: 'f32-planar',
                        sampleRate,
                        numberOfFrames: frames,
                        numberOfChannels,
                        timestamp: Math.round((frameOffset / sampleRate) * 1_000_000),
                        data: planar
                    });
                    audioEncoder.encode(audioData);
                    audioData.close();
                    frameOffset += frames;

                    if (audioEncoder.encodeQueueSize > 30) {
                        await new Promise(r => setTimeout(r, 10));
                    }
                }

                await audioEncoder.flush();
                audioEncoder.close();
                if (audioEncoderError) throw audioEncoderError;
                console.log('[Worker] Audio track encoded.');
            }
        }

        console.log('[Worker] Finalizing muxer...');
        muxer.finalize();

        if (writableStream) {
            await writableStream.close();
            writableStream = null;
            console.log('[Worker] File written to disk.');
            // Nothing to hand back — the file already exists on disk.
            self.postMessage({ type: 'done', streamedToDisk: true, musicLevelMisses });
        } else {
            const buffer = (muxer.target as ArrayBufferTarget).buffer;
            console.log('[Worker] Muxer finalized. Sending done message with buffer size:', buffer.byteLength);
            self.postMessage({ type: 'done', buffer, musicLevelMisses }, { transfer: [buffer] } as any);
        }

        imageBitmaps.forEach(b => b.bitmap.close());
    } catch (workerErr: any) {
        console.error('[Worker] Fatal error:', workerErr);
        if (writableStream) {
            // Leave no half-written file behind.
            try { await writableStream.abort(); } catch { /* already gone */ }
        }
        self.postMessage({ type: 'error', error: workerErr.message || String(workerErr) });
    }
};
