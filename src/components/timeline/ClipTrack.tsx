import React, { useRef } from 'react';
import { useProjectStore } from '../../store/useProjectStore';
import type { Clip } from '../../types';

const HANDLE_WIDTH = 8; // px — the grabbable area on each edge
const MIN_DURATION_MS = 100;

export const ClipTrack: React.FC = () => {
    const clips = useProjectStore(s => s.data.clips);
    const assets = useProjectStore(s => s.data.assets);
    const zoomScale = useProjectStore(s => s.ui.zoomScale);
    const addClip = useProjectStore(s => s.addClip);
    const updateClipTransient = useProjectStore(s => s.updateClipTransient);
    const saveHistory = useProjectStore(s => s.saveHistory);
    const setSelectedClipId = useProjectStore(s => s.setSelectedClipId);
    const selectedClipId = useProjectStore(s => s.ui.selectedClipId);

    const trackRef = useRef<HTMLDivElement>(null);

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        const assetId = e.dataTransfer.getData('text/plain');
        if (!assetId) return;

        if (!trackRef.current) return;
        const rect = trackRef.current.getBoundingClientRect();
        const dropX = e.clientX - rect.left + trackRef.current.scrollLeft;

        const startTimeMs = dropX / zoomScale;

        const newClip: Clip = {
            id: crypto.randomUUID(),
            assetId,
            startTimeMs: Math.round(startTimeMs),
            durationMs: 3000,
            transitionType: 'cut',
            transitionDurationMs: 0,
            fitMode: 'fit',
            motionType: 'none',
            motionIntensity: 0.1,
            motionSpeed: 0.5
        };

        addClip(newClip);
        setSelectedClipId(newClip.id);
    };

    // Format ms to human-readable string
    const formatMs = (ms: number) => {
        const s = ms / 1000;
        if (s < 60) return `${s.toFixed(1)}s`;
        const m = Math.floor(s / 60);
        const rem = (s % 60).toFixed(0);
        return `${m}:${rem.padStart(2, '0')}`;
    };

    return (
        <div
            ref={trackRef}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            style={{
                height: '160px',
                borderBottom: '2px solid var(--panel-border)',
                position: 'relative',
                backgroundColor: 'rgba(255, 255, 255, 0.05)',
                outline: '1px dashed rgba(255,255,255,0.2)',
                outlineOffset: '-4px'
            }}
        >
            {(() => {
                const sortedClips = [...clips].sort((a, b) => a.startTimeMs - b.startTimeMs);
                return sortedClips.map((clip, index) => {
                    const asset = assets.find(a => a.id === clip.assetId);
                    const left = clip.startTimeMs * zoomScale;
                    const width = clip.durationMs * zoomScale;
                    const isSelected = clip.id === selectedClipId;

                    let overlapMs = 0;
                    if (index > 0) {
                        const prevClip = sortedClips[index - 1];
                        const prevEnd = prevClip.startTimeMs + prevClip.durationMs;
                        overlapMs = Math.max(0, prevEnd - clip.startTimeMs);
                    }

                    // --- MOVE handler (middle area) ---
                    const handleClipMouseDown = (e: React.MouseEvent) => {
                        e.stopPropagation();
                        setSelectedClipId(clip.id);

                        const startX = e.clientX;
                        const originalStartTimeMs = clip.startTimeMs;

                        const handleMouseMove = (moveEvent: MouseEvent) => {
                            const deltaX = moveEvent.clientX - startX;
                            const deltaMs = deltaX / zoomScale;
                            let newStartTimeMs = Math.round(originalStartTimeMs + deltaMs);
                            if (newStartTimeMs < 0) newStartTimeMs = 0;
                            updateClipTransient(clip.id, { startTimeMs: newStartTimeMs });
                        };

                        const handleMouseUp = () => {
                            saveHistory();
                            window.removeEventListener('mousemove', handleMouseMove);
                            window.removeEventListener('mouseup', handleMouseUp);
                        };

                        window.addEventListener('mousemove', handleMouseMove);
                        window.addEventListener('mouseup', handleMouseUp);
                    };

                    // --- LEFT EDGE handler (trim start) ---
                    const handleLeftEdge = (e: React.MouseEvent) => {
                        e.stopPropagation();
                        setSelectedClipId(clip.id);

                        const startX = e.clientX;
                        const originalStart = clip.startTimeMs;
                        const originalDuration = clip.durationMs;
                        const originalEnd = originalStart + originalDuration;

                        const handleMouseMove = (moveEvent: MouseEvent) => {
                            const deltaX = moveEvent.clientX - startX;
                            const deltaMs = deltaX / zoomScale;
                            let newStart = Math.round(originalStart + deltaMs);
                            if (newStart < 0) newStart = 0;
                            // Don't let start go past end
                            if (newStart > originalEnd - MIN_DURATION_MS) newStart = originalEnd - MIN_DURATION_MS;
                            const newDuration = originalEnd - newStart;
                            updateClipTransient(clip.id, { startTimeMs: newStart, durationMs: newDuration });
                        };

                        const handleMouseUp = () => {
                            saveHistory();
                            window.removeEventListener('mousemove', handleMouseMove);
                            window.removeEventListener('mouseup', handleMouseUp);
                        };

                        window.addEventListener('mousemove', handleMouseMove);
                        window.addEventListener('mouseup', handleMouseUp);
                    };

                    // --- RIGHT EDGE handler (trim end / change duration) ---
                    const handleRightEdge = (e: React.MouseEvent) => {
                        e.stopPropagation();
                        setSelectedClipId(clip.id);

                        const startX = e.clientX;
                        const originalDuration = clip.durationMs;

                        const handleMouseMove = (moveEvent: MouseEvent) => {
                            const deltaX = moveEvent.clientX - startX;
                            const deltaMs = deltaX / zoomScale;
                            let newDuration = Math.round(originalDuration + deltaMs);
                            if (newDuration < MIN_DURATION_MS) newDuration = MIN_DURATION_MS;
                            updateClipTransient(clip.id, { durationMs: newDuration });
                        };

                        const handleMouseUp = () => {
                            saveHistory();
                            window.removeEventListener('mousemove', handleMouseMove);
                            window.removeEventListener('mouseup', handleMouseUp);
                        };

                        window.addEventListener('mousemove', handleMouseMove);
                        window.addEventListener('mouseup', handleMouseUp);
                    };

                    return (
                        <div
                            key={clip.id}
                            onMouseDown={handleClipMouseDown}
                            style={{
                                position: 'absolute',
                                top: '4px',
                                left: `${left}px`,
                                width: `${Math.max(2, width)}px`,
                                height: '152px',
                                backgroundColor: 'var(--clip-bg)',
                                border: isSelected ? '2px solid var(--clip-selected)' : '1px solid var(--clip-border)',
                                borderRadius: 'var(--radius-sm)',
                                overflow: 'hidden',
                                cursor: 'grab',
                                display: 'flex',
                                flexDirection: 'column',
                                userSelect: 'none'
                            }}
                        >
                            {/* Thumbnail */}
                            {asset?.type === 'image' && (
                                <img src={asset.objectUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.5, pointerEvents: 'none' }} draggable={false} />
                            )}

                            {/* Clip name */}
                            <div style={{ position: 'absolute', top: '2px', left: '10px', right: '10px', fontSize: '10px', color: '#fff', textShadow: '1px 1px 2px #000', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {asset?.name || 'Unknown'}
                            </div>

                            {/* Duration label */}
                            <div style={{ position: 'absolute', bottom: '2px', right: '10px', fontSize: '9px', color: 'rgba(255,255,255,0.7)', textShadow: '1px 1px 2px #000' }}>
                                {formatMs(clip.durationMs)}
                            </div>

                            {/* Dissolve overlap indicator */}
                            {clip.transitionType === 'dissolve' && overlapMs > 0 && (
                                <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${overlapMs * zoomScale}px`, backgroundColor: 'rgba(59,130,246,0.25)', borderRight: '1px dashed rgba(59,130,246,0.5)' }} title={`Dissolve: ${overlapMs}ms`} />
                            )}

                            {/* LEFT resize handle */}
                            <div
                                onMouseDown={handleLeftEdge}
                                style={{
                                    position: 'absolute',
                                    left: 0,
                                    top: 0,
                                    bottom: 0,
                                    width: `${HANDLE_WIDTH}px`,
                                    cursor: 'ew-resize',
                                    background: isSelected
                                        ? 'linear-gradient(to right, rgba(59,130,246,0.5), transparent)'
                                        : 'linear-gradient(to right, rgba(255,255,255,0.15), transparent)',
                                    borderRadius: 'var(--radius-sm) 0 0 var(--radius-sm)',
                                    zIndex: 2
                                }}
                            />

                            {/* RIGHT resize handle */}
                            <div
                                onMouseDown={handleRightEdge}
                                style={{
                                    position: 'absolute',
                                    right: 0,
                                    top: 0,
                                    bottom: 0,
                                    width: `${HANDLE_WIDTH}px`,
                                    cursor: 'ew-resize',
                                    background: isSelected
                                        ? 'linear-gradient(to left, rgba(59,130,246,0.5), transparent)'
                                        : 'linear-gradient(to left, rgba(255,255,255,0.15), transparent)',
                                    borderRadius: '0 var(--radius-sm) var(--radius-sm) 0',
                                    zIndex: 2
                                }}
                            />
                        </div>
                    );
                });
            })()}

            {clips.length === 0 ? (
                <div style={{ 
                    position: 'absolute', 
                    inset: '8px',
                    border: '2px dashed rgba(255,255,255,0.2)',
                    borderRadius: '8px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center', 
                    justifyContent: 'center',
                    color: 'rgba(255,255,255,0.4)', 
                    fontSize: '14px', 
                    fontWeight: 'bold', 
                    pointerEvents: 'none', 
                    textAlign: 'center' 
                }}>
                    DRAG IMAGES HERE
                    <div style={{ fontSize: '10px', marginTop: '4px', opacity: 0.7 }}>DROP FROM ASSETS PANE ON THE LEFT</div>
                </div>
            ) : (
                <div style={{ position: 'absolute', top: '8px', left: '12px', color: 'rgba(255,255,255,0.05)', fontSize: '32px', fontWeight: 'bold', pointerEvents: 'none' }}>
                    CLIPS
                </div>
            )}
        </div>
    );
};
