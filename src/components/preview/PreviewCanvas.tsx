import React, { useRef, useEffect } from 'react';
import { useProjectStore } from '../../store/useProjectStore';
import { ImageCache } from '../../utils/imageCache';
import { drawDownscaledImage } from '../../utils/imageDownscaler';
import { applyGlitch } from '../../utils/glitchRenderer';

export const PreviewCanvas: React.FC = () => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    const playheadMs = useProjectStore(s => s.ui.playheadMs);
    const clips = useProjectStore(s => s.data.clips);
    const assets = useProjectStore(s => s.data.assets);
    const settings = useProjectStore(s => s.data.settings);

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

        const drawFrame = async () => {
            // Pre-load all images needed for this frame
            const imagesToDraw: { img: HTMLImageElement, clip: any }[] = [];

            for (let i = 0; i < activeClips.length; i++) {
                const clip = activeClips[i];
                const asset = assets.find(a => a.id === clip.assetId);
                if (!asset || asset.type !== 'image') continue;

                let imgOrPromise = ImageCache.getImage(asset);
                if (imgOrPromise instanceof Promise) {
                    const img = await imgOrPromise;
                    if (img) imagesToDraw.push({ img, clip });
                } else if (imgOrPromise) {
                    imagesToDraw.push({ img: imgOrPromise, clip });
                }
            }

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

            for (const { img, clip } of imagesToDraw) {

                // Calculate Alpha for Dissolve
                let alpha = 1.0;

                // If THIS clip is dissolving IN
                if (clip.transitionType === 'dissolve') {
                    const clipIndex = sortedAllClips.findIndex(c => c.id === clip.id);
                    if (clipIndex > 0) {
                        const prevClip = sortedAllClips[clipIndex - 1];
                        const prevEnd = prevClip.startTimeMs + prevClip.durationMs;
                        const overlapMs = Math.max(0, prevEnd - clip.startTimeMs);

                        if (overlapMs > 0 && playheadMs < clip.startTimeMs + overlapMs) {
                            alpha = (playheadMs - clip.startTimeMs) / overlapMs;
                        }
                    }
                }

                ctx.globalAlpha = Math.min(Math.max(alpha, 0), 1);

                // Calculate Fit/Fill/Center
                const imgAspect = img.width / img.height;
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
                    dw = img.width;
                    dh = img.height;
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

                drawDownscaledImage(ctx, img, dx, dy, dw, dh);

                if (clip.glitchAmount && clip.glitchIntensity) {
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
    }, [playheadMs, clips, assets, settings.resolution]);

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
