import React, { useRef } from 'react';
import { ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';
import { useProjectStore } from '../../store/useProjectStore';
import { AudioTrack } from './AudioTrack';
import { ClipTrack } from './ClipTrack';
import { AudioPlayer } from './AudioPlayer';

export const TimelineContainer: React.FC = () => {
    const playheadMs = useProjectStore(s => s.ui.playheadMs);
    const setPlayheadMs = useProjectStore(s => s.setPlayheadMs);
    const zoomScale = useProjectStore(s => s.ui.zoomScale);
    const setZoomScale = useProjectStore(s => s.setZoomScale);

    const clips = useProjectStore(s => s.data.clips);
    const assets = useProjectStore(s => s.data.assets);

    const tracksRef = useRef<HTMLDivElement>(null);

    const playheadX = playheadMs * zoomScale;

    // Calculate the total duration of the project
    let maxDurationMs = 0;
    clips.forEach(c => {
        const end = c.startTimeMs + c.durationMs;
        if (end > maxDurationMs) maxDurationMs = end;
    });

    const audioAsset = assets.find(a => a.type === 'audio');
    if (audioAsset && audioAsset.duration) {
        if (audioAsset.duration > maxDurationMs) {
            maxDurationMs = audioAsset.duration;
        }
    }

    // Add extra space at the end of the timeline
    const timelineWidthPx = maxDurationMs * zoomScale + 200;

    // Zoom handlers
    const handleZoomIn = () => {
        setZoomScale(Math.min(1.0, zoomScale * 1.5));
    };

    const handleZoomOut = () => {
        setZoomScale(Math.max(0.005, zoomScale / 1.5));
    };

    const handleFitAll = () => {
        if (maxDurationMs <= 0) return;
        const container = tracksRef.current;
        if (!container) return;
        const availableWidth = container.clientWidth - 40; // small padding
        const newScale = availableWidth / maxDurationMs;
        setZoomScale(Math.max(0.005, Math.min(1.0, newScale)));
    };

    // Scrub handler — accounts for scroll offset
    const handleScrub = (e: React.MouseEvent<HTMLDivElement>) => {
        const container = tracksRef.current;
        if (!container) return;
        const rect = container.getBoundingClientRect();
        const clickX = e.clientX - rect.left + container.scrollLeft;
        setPlayheadMs(Math.max(0, clickX / zoomScale));

        const handleMouseMove = (moveEvent: MouseEvent) => {
            const moveX = moveEvent.clientX - rect.left + container.scrollLeft;
            setPlayheadMs(Math.max(0, moveX / zoomScale));
        };
        const handleMouseUp = () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
    };

    // Generate time ruler ticks
    const generateTicks = () => {
        if (maxDurationMs <= 0) return null;
        // Pick an interval that gives readable ticks at the current zoom
        const pxPerSec = zoomScale * 1000;
        let intervalSec = 1;
        if (pxPerSec < 15) intervalSec = 30;
        else if (pxPerSec < 30) intervalSec = 10;
        else if (pxPerSec < 60) intervalSec = 5;
        else if (pxPerSec < 150) intervalSec = 2;

        const totalSec = Math.ceil(maxDurationMs / 1000);
        const ticks: React.ReactNode[] = [];
        for (let s = 0; s <= totalSec; s += intervalSec) {
            const x = s * 1000 * zoomScale;
            const min = Math.floor(s / 60);
            const sec = s % 60;
            const label = `${min}:${String(sec).padStart(2, '0')}`;
            ticks.push(
                <div key={s} style={{
                    position: 'absolute',
                    left: `${x}px`,
                    top: 0,
                    height: '100%',
                    display: 'flex',
                    alignItems: 'center'
                }}>
                    <div style={{ width: '1px', height: '8px', backgroundColor: 'var(--text-inactive)' }} />
                    <span style={{ fontSize: '9px', color: 'var(--text-inactive)', marginLeft: '3px', whiteSpace: 'nowrap' }}>
                        {label}
                    </span>
                </div>
            );
        }
        return ticks;
    };

    return (
        <div style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            position: 'relative',
            overflow: 'hidden'
        }}>
            {/* Timeline Header — time ruler + zoom controls */}
            <div
                style={{
                    height: '28px',
                    backgroundColor: 'var(--panel-border)',
                    borderBottom: '1px solid var(--panel-bg)',
                    display: 'flex',
                    alignItems: 'center',
                    paddingLeft: '8px',
                    flexShrink: 0,
                    justifyContent: 'space-between'
                }}
            >
                {/* Time ruler ticks (scrollable area mirrored) */}
                <div style={{ flex: 1, position: 'relative', height: '100%', overflow: 'hidden' }}>
                    {generateTicks()}
                </div>

                {/* Zoom controls */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '2px', paddingRight: '8px', flexShrink: 0 }}>
                    <button
                        className="btn btn-icon"
                        onClick={handleZoomOut}
                        title="Zoom Out"
                        style={{ padding: '2px 4px' }}
                    >
                        <ZoomOut size={14} />
                    </button>
                    <button
                        className="btn btn-icon"
                        onClick={handleFitAll}
                        title="Fit All (全体表示)"
                        style={{ padding: '2px 4px' }}
                    >
                        <Maximize2 size={14} />
                    </button>
                    <button
                        className="btn btn-icon"
                        onClick={handleZoomIn}
                        title="Zoom In"
                        style={{ padding: '2px 4px' }}
                    >
                        <ZoomIn size={14} />
                    </button>
                </div>
            </div>

            {/* Timeline Tracks Area */}
            <div
                ref={tracksRef}
                className="timeline-tracks"
                style={{ flex: 1, position: 'relative', overflowX: 'auto', overflowY: 'auto', display: 'flex' }}
            >
                {/* Track Labels - Sticky Column */}
                <div style={{
                    width: '60px',
                    backgroundColor: 'var(--panel-bg)',
                    borderRight: '1px solid var(--panel-border)',
                    position: 'sticky',
                    left: 0,
                    zIndex: 20,
                    display: 'flex',
                    flexDirection: 'column',
                    flexShrink: 0
                }}>
                    <div style={{ height: '28px', borderBottom: '1px solid var(--panel-bg)' }} /> {/* Header spacer */}
                    <div style={{ height: '160px', opacity: 0.6, borderBottom: '2px solid var(--panel-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', writingMode: 'vertical-rl', transform: 'rotate(180deg)', fontSize: '11px', color: 'var(--text-main)', letterSpacing: '2px', fontWeight: 'bold' }}>
                        CLIPS
                    </div>
                    <div style={{ height: '80px', opacity: 0.6, borderBottom: '1px solid var(--panel-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', writingMode: 'vertical-rl', transform: 'rotate(180deg)', fontSize: '11px', color: 'var(--text-main)', letterSpacing: '2px', fontWeight: 'bold' }}>
                        AUDIO
                    </div>
                </div>

                <div
                    style={{ 
                        flex: 1, 
                        minWidth: `${Math.max(100, timelineWidthPx)}px`, 
                        height: '100%', 
                        position: 'relative',
                        display: 'flex',
                        flexDirection: 'column'
                    }}
                    onMouseDown={handleScrub}
                >
                    <AudioPlayer />

                    {/* Playhead line */}
                    <div style={{
                        position: 'absolute',
                        top: 0,
                        bottom: 0,
                        left: `${playheadX}px`,
                        width: '2px',
                        backgroundColor: 'var(--timeline-playhead)',
                        zIndex: 10,
                        pointerEvents: 'none'
                    }} />

                    <ClipTrack />
                    <AudioTrack />
                </div>
            </div>
        </div>
    );
};
