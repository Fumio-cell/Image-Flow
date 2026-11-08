import React, { useRef, useEffect } from 'react';
import { useProjectStore } from '../../store/useProjectStore';
import { ImageCache } from '../../utils/imageCache';
import { VideoCache } from '../../utils/videoCache';
import { getSourceTimeSec } from '../../utils/videoTiming';
import { getFadeWindow, getFadeGain } from '../../utils/audioMix';
import { drawDownscaledImage } from '../../utils/imageDownscaler';
import { applyGlitch } from '../../utils/glitchRenderer';
import { renderDeltaFlowFrame, DELTA_FLOW_WORK_RES } from '../../utils/deltaFlowRenderer';
import { DeltaFlowFieldCache } from '../../utils/deltaFlowFieldCache';
import { renderBreathingMorphFrame, BREATHING_MORPH_WORK_RES } from '../../utils/breathingMorphRenderer';
import { BreathingMorphFieldCache } from '../../utils/breathingMorphFieldCache';
import { findPrevVisualClip } from '../../utils/prevVisualClip';
import type { Clip } from '../../types';

/** One drawable layer for the current frame — an image or a live video element. */
interface DrawEntry {
    source: HTMLImageElement | HTMLVideoElement;
    srcW: number;
    srcH: number;
    clip: Clip;
    isVideo: boolean;
}

export const PreviewCanvas: React.FC = () => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    const playheadMs = useProjectStore(s => s.ui.playheadMs);
    const clips = useProjectStore(s => s.data.clips);
    const assets = useProjectStore(s => s.data.assets);
    const settings = useProjectStore(s => s.data.settings);
    const isPlaying = useProjectStore(s => s.ui.isPlaying);

    // Bumped on every effect run. Video seeks are async, so a fast scrub can
    // leave an older frame resolving after a newer one — each await re-checks
    // this and bails if it is no longer the current generation.
    const generationRef = useRef(0);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Determine target resolution
        const [wStr, hStr] = settings.resolution.split('x');
        const width = parseInt(wStr, 10);
        const height = parseInt(hStr, 10);

        // Set logical size
        if (canvas.width !== width || canvas.height !== height) {
            canvas.width = width;
            canvas.height = height;
        }

        // Sort all clips chronologically first
        const sortedAllClips = [...clips].sort((a, b) => a.startTimeMs - b.startTimeMs);

        // A clip is active if playhead is within [startTimeMs, endTimeMs)
        const activeClips = sortedAllClips.filter(c =>
            playheadMs >= c.startTimeMs && playheadMs < c.startTimeMs + c.durationMs
        );

        const generation = ++generationRef.current;
        const isStale = () => generationRef.current !== generation;

        // Keep only the videos still on screen running.
        VideoCache.pauseAllExcept(
            activeClips
                .map(c => assets.find(a => a.id === c.assetId))
                .filter(a => a?.type === 'video')
                .map(a => a!.id)
        );

        const drawFrame = async () => {
            // Images and videos are collected into one shape so the draw loop
            // below doesn't care which kind of source it is holding.
            const imagesToDraw: DrawEntry[] = [];

            for (let i = 0; i < activeClips.length; i++) {
                const clip = activeClips[i];
                const asset = assets.find(a => a.id === clip.assetId);
                if (!asset) continue;

                if (asset.type === 'image') {
                    const imgOrPromise = ImageCache.getImage(asset);
                    if (imgOrPromise instanceof Promise) {
                        const img = await imgOrPromise;
                        if (isStale()) return;
                        if (img) imagesToDraw.push({ source: img, srcW: img.width, srcH: img.height, clip, isVideo: false });
                    } else if (imgOrPromise) {
                        imagesToDraw.push({ source: imgOrPromise, srcW: imgOrPromise.width, srcH: imgOrPromise.height, clip, isVideo: false });
                    }
                } else if (asset.type === 'video') {
                    const video = VideoCache.getVideo(asset);
                    if (!video) continue;

                    const targetSec = getSourceTimeSec(clip, asset.duration, playheadMs);

                    // Hear the clip's own soundtrack at its mix level while playing,
                    // crossfading with neighbours the same way the export will.
                    const fadeGain = getFadeGain(getFadeWindow(clip, clips, assets), playheadMs);
                    VideoCache.setLevel(video, (clip.volume ?? 1) * fadeGain, clip.muted ?? false, isPlaying);
                    await VideoCache.sync(video, targetSec, isPlaying);
                    if (isStale()) return;

                    // HAVE_CURRENT_DATA or better, and actually decoded.
                    if (video.readyState >= 2 && video.videoWidth > 0) {
                        imagesToDraw.push({
                            source: video,
                            srcW: video.videoWidth,
                            srcH: video.videoHeight,
                            clip,
                            isVideo: true,
                        });
                    }
                }
            }

            if (isStale()) return;

            // Extract Audio Level (Peak)
            const audioClips = activeClips.filter(c => {
                const a = assets.find(ast => ast.id === c.assetId);
                return a && a.type === 'audio';
            });
            let currentAudioLevel = 0;
            if (audioClips.length > 0) {
                for (const ac of audioClips) {
                    const asset = assets.find(a => a.id === ac.assetId);
                    if (asset?.peaks && asset.peaks.length > 0 && asset.duration) {
                        const localMs = playheadMs - ac.startTimeMs;
                        const prog = localMs / asset.duration;
                        const idx = Math.floor(prog * asset.peaks.length);
                        if (idx >= 0 && idx < asset.peaks.length) {
                             currentAudioLevel = Math.max(currentAudioLevel, asset.peaks[idx]);
                        }
                    }
                }
            }

            // ONLY clear the background when we are ready to draw to prevent flickering
            ctx.fillStyle = '#000000';
            ctx.fillRect(0, 0, width, height);
            // Enable high-quality image smoothing to prevent moiré patterns
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';

            for (const { source, srcW, srcH, clip, isVideo } of imagesToDraw) {

                // Calculate Alpha for Dissolve
                let alpha = 1.0;

                // Delta Flow: incoming clip flows in from the previous clip's frame
                let deltaFlowPrevImg: HTMLImageElement | null = null;
                let deltaFlowPairKey: string | null = null;
                let deltaFlowProgress = 1;

                // Breathing Morph: same overlap-driven pattern as Delta Flow
                let breathingMorphPrevImg: HTMLImageElement | null = null;
                let breathingMorphPairKey: string | null = null;
                let breathingMorphProgress = 1;

                // Progress (0..1) within the overlap with the previous clip, or null
                // if there's no overlap right now. Independent of transitionType so
                // Glitch can gate on it regardless of which transition is selected.
                let overlapProgress: number | null = null;

                const prevClip = findPrevVisualClip(clips, assets, clip);
                if (prevClip) {
                    const prevEnd = prevClip.startTimeMs + prevClip.durationMs;
                    const overlapMs = Math.max(0, prevEnd - clip.startTimeMs);

                    if (overlapMs > 0 && playheadMs < clip.startTimeMs + overlapMs) {
                        overlapProgress = (playheadMs - clip.startTimeMs) / overlapMs;

                        if (clip.transitionType === 'dissolve') {
                            alpha = overlapProgress;
                        } else if (clip.transitionType === 'delta-flow' && !isVideo) {
                            // Both morph transitions precompute a displacement field from a
                            // fixed pair of stills — a per-frame video source can't satisfy that.
                            deltaFlowProgress = overlapProgress;
                            const prevEntry = imagesToDraw.find(e => e.clip.id === prevClip.id && !e.isVideo);
                            if (prevEntry) {
                                deltaFlowPrevImg = prevEntry.source as HTMLImageElement;
                                deltaFlowPairKey = `${prevClip.id}:${prevClip.assetId}->${clip.id}:${clip.assetId}`;
                            }
                        } else if (clip.transitionType === 'breathing-morph' && !isVideo) {
                            breathingMorphProgress = overlapProgress;
                            const prevEntry = imagesToDraw.find(e => e.clip.id === prevClip.id && !e.isVideo);
                            if (prevEntry) {
                                breathingMorphPrevImg = prevEntry.source as HTMLImageElement;
                                breathingMorphPairKey = `${prevClip.id}:${prevClip.assetId}->${clip.id}:${clip.assetId}`;
                            }
                        }
                    }
                }

                ctx.globalAlpha = Math.min(Math.max(alpha, 0), 1);

                // Calculate Fit/Fill/Center
                const imgAspect = srcW / srcH;
                const canvasAspect = width / height;

                let dx = 0, dy = 0, dw = width, dh = height;

                if (clip.fitMode === 'fit') {
                    if (imgAspect > canvasAspect) {
                        dw = width;
                        dh = width / imgAspect;
                        dy = (height - dh) / 2;
                    } else {
                        dh = height;
                        dw = height * imgAspect;
                        dx = (width - dw) / 2;
                    }
                } else if (clip.fitMode === 'fill') {
                    if (imgAspect > canvasAspect) {
                        dh = height;
                        dw = height * imgAspect;
                        dx = (width - dw) / 2;
                    } else {
                        dw = width;
                        dh = width / imgAspect;
                        dy = (height - dh) / 2;
                    }
                } else if (clip.fitMode === 'center') {
                    dw = srcW;
                    dh = srcH;
                    dx = (width - dw) / 2;
                    dy = (height - dh) / 2;
                }

                // Apply Ken Burns Effect (Motion)
                if (clip.motionType && clip.motionType !== 'none') {
                    const rawProgress = (playheadMs - clip.startTimeMs) / clip.durationMs;
                    
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

                    // VJ Mode: Audio Reactivity boosts the zoom scale
                    if (clip.audioReactive && currentAudioLevel > 0.05) {
                        motionScale += (currentAudioLevel * ZOOM_FACTOR * 3.0);
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

                if (clip.transitionType === 'delta-flow' && !isVideo && deltaFlowPrevImg && deltaFlowPairKey) {
                    const sensitivity = clip.deltaFlowSensitivity ?? 0.55;
                    const strength = clip.deltaFlowStrength ?? 0.60;
                    const noiseAmount = clip.deltaFlowNoiseAmount ?? 0.30;

                    const field = DeltaFlowFieldCache.getField(deltaFlowPairKey, deltaFlowPrevImg, source as HTMLImageElement, sensitivity, DELTA_FLOW_WORK_RES, dw, dh);

                    renderDeltaFlowFrame(
                        ctx, field, deltaFlowProgress,
                        { sensitivity, strength, noiseAmount },
                        dx, dy, dw, dh
                    );
                } else if (clip.transitionType === 'breathing-morph' && !isVideo && breathingMorphPrevImg && breathingMorphPairKey) {
                    const turbulence = clip.breathingTurbulence ?? 0.5;
                    const swirl = clip.breathingSwirl ?? 0.5;

                    const field = BreathingMorphFieldCache.getField(breathingMorphPairKey, breathingMorphPrevImg, source as HTMLImageElement, BREATHING_MORPH_WORK_RES, dw, dh);

                    renderBreathingMorphFrame(
                        ctx, field, breathingMorphProgress,
                        { turbulence, swirl },
                        dx, dy, dw, dh
                    );
                } else {
                    drawDownscaledImage(ctx, source, dx, dy, dw, dh, srcW, srcH);
                }

                // Glitch transition: fires only during the overlap with the previous clip
                if (clip.transitionType === 'glitch' && clip.glitchAmount && clip.glitchIntensity && overlapProgress !== null) {
                    let finalAmount = clip.glitchAmount;
                    let finalIntensity = clip.glitchIntensity;
                    let finalDisplace = clip.glitchDisplacement || 0.0;
                    if (clip.audioReactive && currentAudioLevel > 0.1) {
                        finalAmount = Math.min(1.0, finalAmount + currentAudioLevel * 0.5);
                        finalIntensity = Math.min(1.0, finalIntensity + currentAudioLevel * 0.8);
                        if (finalDisplace > 0) finalDisplace = Math.min(1.0, finalDisplace + currentAudioLevel);
                    }

                    applyGlitch(ctx, dx, dy, dw, dh, {
                        amount: finalAmount,
                        intensity: finalIntensity,
                        displacement: finalDisplace,
                        seed: playheadMs
                    });
                }

                ctx.globalAlpha = 1.0; // reset
            }
        };

        drawFrame();
    }, [playheadMs, clips, assets, settings.resolution, isPlaying]);

    return (
        <canvas
            ref={canvasRef}
            style={{
                width: '100%',
                height: '100%',
                objectFit: 'contain' // Ensures the canvas itself scales correctly inside the flex container
            }}
        />
    );
};
