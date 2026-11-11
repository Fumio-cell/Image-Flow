import React, { useRef } from 'react';
import { useProjectStore } from '../../store/useProjectStore';
import type { Clip } from '../../types';
import { insertionIndex, insertionMarkerMs } from '../../utils/packClips';
import { JunctionChip } from './JunctionChip';
import { formatSecondsLabel } from './timeFormat';

const HANDLE_WIDTH = 8; // px — the grabbable area on each edge
const MIN_DURATION_MS = 100;
const AUTO_START_TIP = 'Start is set automatically in Auto-pack mode.';
const DRAG_THRESHOLD_PX = 4; // a press that moves less than this is a click, not a reorder

interface ClipTrackProps {
    /** Which lane this is. Both lanes share the same move/trim behaviour. */
    kind?: 'visual' | 'audio';
}

export const ClipTrack: React.FC<ClipTrackProps> = ({ kind = 'visual' }) => {
    const clips = useProjectStore(s => s.data.clips);
    const assets = useProjectStore(s => s.data.assets);
    const zoomScale = useProjectStore(s => s.ui.zoomScale);
    const addClip = useProjectStore(s => s.addClip);
    const updateClipTransient = useProjectStore(s => s.updateClipTransient);
    const saveHistory = useProjectStore(s => s.saveHistory);
    const setSelectedClipId = useProjectStore(s => s.setSelectedClipId);
    const selectedClipId = useProjectStore(s => s.ui.selectedClipId);
    const autoPack = useProjectStore(s => s.data.settings.autoPack === true);
    const insertClipAt = useProjectStore(s => s.insertClipAt);
    const moveClipToIndex = useProjectStore(s => s.moveClipToIndex);
    // Auto-pack governs the visual lane only; the audio lane stays free-form.
    const packed = autoPack && kind === 'visual';
    // This lane's own clips (the visual lane holds everything that is not audio).
    const laneOwnClipCount = clips.filter(c => (kind === 'audio') === (assets.find(a => a.id === c.assetId)?.type === 'audio')).length;

    // Reorder drag state: the clip being dragged and where its insertion marker sits (timeline ms).
    const [draggingId, setDraggingId] = React.useState<string | null>(null);
    const [markerMs, setMarkerMs] = React.useState<number | null>(null);

    const trackRef = useRef<HTMLDivElement>(null);

    const [isDragOver, setIsDragOver] = React.useState(false);

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        if (!isDragOver) setIsDragOver(true);
    };
    const handleDragLeave = () => setIsDragOver(false);

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(false);
        const assetId = e.dataTransfer.getData('text/plain');
        if (!assetId) return;

        const dropped = assets.find(a => a.id === assetId);
        if (!dropped) return;

        // Accept the drop on either lane. The clip is rendered in whichever lane
        // matches its asset type, so silently ignoring a "wrong lane" drop just
        // looked like the app was broken.
        const droppedIsAudio = dropped.type === 'audio';
        if ((kind === 'audio') !== droppedIsAudio) {
            const targetLane = droppedIsAudio ? 'audio' : 'visual';
            console.log(`[ClipTrack] Routing ${dropped.name} to the ${targetLane} lane.`);
        }

        if (!trackRef.current) return;
        const rect = trackRef.current.getBoundingClientRect();
        const dropX = e.clientX - rect.left + trackRef.current.scrollLeft;

        const startTimeMs = dropX / zoomScale;

        // Video and audio clips default to the full source length; stills stay at 3s.
        const durationMs = (dropped.type === 'video' || dropped.type === 'audio') && dropped.duration
            ? Math.round(dropped.duration)
            : 3000;

        // Auto-pack: a visual asset goes into the nearest slot of the row (not to the mouse x)
        // and the row is re-packed. Audio keeps its free placement below.
        if (autoPack && !droppedIsAudio) {
            const slotClip: Clip = {
                id: crypto.randomUUID(),
                assetId,
                startTimeMs: 0,
                durationMs,
                sourceInMs: 0,
                volume: 1,
                muted: false,
                transitionType: 'cut',   // replaced by the store with the junction's default
                transitionDurationMs: 0,
                fitMode: 'fit',
                motionType: 'none',
                motionIntensity: 0.1,
                motionSpeed: 0.5
            };
            insertClipAt(slotClip, insertionIndex(clips, assets, startTimeMs));
            setSelectedClipId(slotClip.id);
            return;
        }

        const newClip: Clip = {
            id: crypto.randomUUID(),
            assetId,
            startTimeMs: Math.round(startTimeMs),
            durationMs,
            sourceInMs: 0,
            volume: 1,   // Video audio is live from the moment it's placed.
            muted: false,
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

    // Time shown in seconds with one decimal (the data stays in milliseconds)
    const formatMs = formatSecondsLabel;

    return (
        <div
            ref={trackRef}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            style={{
                height: kind === 'audio' ? '90px' : '160px',
                borderBottom: 'var(--rule-hair) solid var(--line)',
                position: 'relative',
                backgroundColor: 'var(--ink-panel)',
                outline: isDragOver ? '2px dashed var(--acid)' : '1px dashed var(--line-control)',
                outlineOffset: '-4px',
                transition: 'outline-color 120ms ease-out'
            }}
        >
            {(() => {
                const laneClips = clips.filter(c => {
                    const a = assets.find(x => x.id === c.assetId);
                    const isAudio = a?.type === 'audio';
                    return (kind === 'audio') === isAudio;
                });
                const sortedClips = [...laneClips].sort((a, b) => a.startTimeMs - b.startTimeMs);
                const clipElements = sortedClips.map((clip, index) => {
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

                    // --- REORDER handler (Auto-pack, visual lane): drag to a slot, marker shows where ---
                    const handlePackedMouseDown = (e: React.MouseEvent) => {
                        e.stopPropagation();
                        setSelectedClipId(clip.id);

                        const startX = e.clientX;
                        let dragging = false;
                        let slot = -1;

                        const handleMouseMove = (moveEvent: MouseEvent) => {
                            if (!dragging && Math.abs(moveEvent.clientX - startX) < DRAG_THRESHOLD_PX) return;
                            dragging = true;
                            setDraggingId(clip.id);
                            const { clips: cs, assets: as } = useProjectStore.getState().data;
                            const rect = trackRef.current!.getBoundingClientRect();
                            const mouseMs = (moveEvent.clientX - rect.left) / zoomScale;
                            slot = insertionIndex(cs, as, mouseMs, clip.id);
                            setMarkerMs(insertionMarkerMs(cs, as, slot, clip.id));
                        };

                        const handleMouseUp = () => {
                            window.removeEventListener('mousemove', handleMouseMove);
                            window.removeEventListener('mouseup', handleMouseUp);
                            if (dragging && slot >= 0) moveClipToIndex(clip.id, slot); // one undo step; own slot = no-op
                            setDraggingId(null);
                            setMarkerMs(null);
                        };

                        window.addEventListener('mousemove', handleMouseMove);
                        window.addEventListener('mouseup', handleMouseUp);
                    };

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
                        let historySaved = false;

                        const handleMouseMove = (moveEvent: MouseEvent) => {
                            const deltaX = moveEvent.clientX - startX;
                            const deltaMs = deltaX / zoomScale;
                            let newDuration = Math.round(originalDuration + deltaMs);
                            if (newDuration < MIN_DURATION_MS) newDuration = MIN_DURATION_MS;
                            if (packed) {
                                // Auto-pack: the row ripples live. Snapshot BEFORE the first change so the
                                // whole drag is one undo step that restores the exact earlier positions.
                                if (newDuration === useProjectStore.getState().data.clips.find(c => c.id === clip.id)?.durationMs) return;
                                if (!historySaved) { saveHistory(); historySaved = true; }
                            }
                            updateClipTransient(clip.id, { durationMs: newDuration });
                        };

                        const handleMouseUp = () => {
                            if (!packed) saveHistory();
                            window.removeEventListener('mousemove', handleMouseMove);
                            window.removeEventListener('mouseup', handleMouseUp);
                        };

                        window.addEventListener('mousemove', handleMouseMove);
                        window.addEventListener('mouseup', handleMouseUp);
                    };

                    return (
                        <div
                            key={clip.id}
                            onMouseDown={packed ? handlePackedMouseDown : handleClipMouseDown}
                            // Keyboard: Tab to a clip, Enter or Space selects it (dragging and trimming stay mouse-only).
                            tabIndex={0}
                            role="button"
                            aria-pressed={isSelected}
                            aria-label={`${asset?.name ?? 'Clip'}, starts at ${(clip.startTimeMs / 1000).toFixed(1)} seconds`}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.code === 'Space') { e.preventDefault(); e.stopPropagation(); setSelectedClipId(clip.id); }
                            }}
                            style={{
                                opacity: draggingId === clip.id ? 0.45 : 1,
                                // Auto-pack overlaps neighbours; a selected clip rises so its end handle can be grabbed.
                                zIndex: packed && isSelected ? 3 : undefined,
                                position: 'absolute',
                                top: '4px',
                                left: `${left}px`,
                                width: `${Math.max(2, width)}px`,
                                height: kind === 'audio' ? '82px' : '152px',
                                backgroundColor: 'var(--ink-panel)',
                                border: isSelected ? '2px solid var(--acid)' : 'var(--rule-hair) solid var(--line-control)',
                                borderRadius: 'var(--radius-none)',
                                overflow: 'hidden',
                                cursor: 'grab',
                                display: 'flex',
                                flexDirection: 'column',
                                userSelect: 'none'
                            }}
                        >
                            {/* Thumbnail */}
                            {asset?.type === 'image' && (
                                <img src={asset.objectUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.5, pointerEvents: 'none', borderRadius: 'var(--radius-thumb)' }} draggable={false} />
                            )}
                            {asset?.type === 'audio' && asset.peaks && (
                                <div style={{
                                    position: 'absolute', inset: 0,
                                    display: 'flex', alignItems: 'center', gap: '1px',
                                    padding: '0 2px', pointerEvents: 'none',
                                    opacity: clip.muted ? 0.3 : 1
                                }}>
                                    {asset.peaks.filter((_, i) => i % 4 === 0).map((pk, i) => (
                                        <div key={i} style={{
                                            flex: 1,
                                            height: `${Math.max(2, Math.min(1, pk) * 60 * (clip.volume ?? 1))}px`,
                                            background: 'var(--paper-dim)'
                                        }} />
                                    ))}
                                </div>
                            )}
                            {asset?.type === 'video' && asset.hasAudio && asset.peaks && (
                                <div style={{
                                    position: 'absolute', left: 0, right: 0, bottom: 0, height: '22px',
                                    display: 'flex', alignItems: 'flex-end', gap: '1px',
                                    background: 'var(--ink)', pointerEvents: 'none', overflow: 'hidden',
                                    zIndex: 2, // sits above the poster thumbnail
                                    opacity: clip.muted ? 0.25 : 1
                                }}>
                                    {asset.peaks.filter((_, i) => i % 8 === 0).map((pk, i) => (
                                        <div key={i} style={{
                                            flex: 1,
                                            height: `${Math.max(2, Math.min(1, pk) * 20 * (clip.volume ?? 1))}px`,
                                            background: 'var(--paper-dim)',
                                            opacity: 0.85
                                        }} />
                                    ))}
                                </div>
                            )}
                            {asset?.type === 'video' && asset.posterUrl && (
                                <img src={asset.posterUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.5, pointerEvents: 'none', borderRadius: 'var(--radius-thumb)' }} draggable={false} />
                            )}

                            {/* Clip name */}
                            <div className="t-label" style={{ position: 'absolute', top: '2px', left: '10px', maxWidth: 'calc(100% - 20px)', color: 'var(--paper)', backgroundColor: 'var(--ink)', padding: '0 var(--space-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {asset?.name || 'Unknown'}
                            </div>

                            {/* Duration label */}
                            <div className="t-label" style={{ position: 'absolute', bottom: '2px', right: '10px', color: 'var(--paper-dim)', backgroundColor: 'var(--ink)', padding: '0 var(--space-1)' }}>
                                {formatMs(clip.durationMs)}
                            </div>

                            {/* Dissolve overlap indicator */}
                            {clip.transitionType === 'dissolve' && overlapMs > 0 && (
                                <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${overlapMs * zoomScale}px`, backgroundColor: 'var(--line)', borderRight: 'var(--rule-hair) dashed var(--paper-dim)' }} title={`Dissolve: ${formatSecondsLabel(overlapMs)}`} />
                            )}

                            {/* LEFT resize handle. In Auto-pack the start is derived, so it is shown disabled. */}
                            <div
                                onMouseDown={packed ? undefined : handleLeftEdge}
                                title={packed ? AUTO_START_TIP : undefined}
                                style={{
                                    position: 'absolute',
                                    left: 0,
                                    top: 0,
                                    bottom: 0,
                                    width: `${HANDLE_WIDTH}px`,
                                    cursor: packed ? 'not-allowed' : 'ew-resize',
                                    opacity: packed ? 0.35 : 1,
                                    backgroundColor: isSelected ? 'var(--acid)' : 'var(--line)',
                                    borderRadius: 'var(--radius-none)',
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
                                    backgroundColor: isSelected ? 'var(--acid)' : 'var(--line)',
                                    borderRadius: 'var(--radius-none)',
                                    zIndex: 2
                                }}
                            />
                        </div>
                    );
                });
                // Auto-pack: a chip on every junction (clip i-1 -> clip i) to see and change the transition there.
                const chips = packed
                    ? sortedClips.map((clip, index) => index === 0 ? null : (
                        <JunctionChip key={`junction-${clip.id}`} clip={clip} prev={sortedClips[index - 1]} number={index} zoomScale={zoomScale} />
                    ))
                    : null;
                return <>{clipElements}{chips}</>;
            })()}

            {markerMs !== null && (
                <div style={{
                    position: 'absolute', top: 0, bottom: 0, left: `${markerMs * zoomScale - 1.5}px`, width: 'var(--rule-signature)',
                    backgroundColor: 'var(--acid)', zIndex: 15, pointerEvents: 'none'
                }} />
            )}

            {clips.length === 0 ? (
                <div style={{ 
                    position: 'absolute', 
                    inset: '8px',
                    border: 'var(--rule-hair) dashed var(--line-control)',
                    borderRadius: 'var(--radius-none)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center', 
                    justifyContent: 'center',
                    color: 'var(--paper-dim)', 
                    pointerEvents: 'none', 
                    textAlign: 'center' 
                }} className="t-control">
                    {kind === 'audio' ? 'DRAG AUDIO HERE' : 'DRAG IMAGES OR VIDEO HERE'}
                    <div className="t-label" style={{ marginTop: 'var(--space-1)' }}>DROP FROM ASSETS PANE ON THE LEFT</div>
                </div>
            ) : null}

            {/* Faint hint: only in an EMPTY VISUAL lane, judged by the lane's own clips, never the audio lane. */}
            {kind === 'visual' && laneOwnClipCount === 0 && <div aria-hidden="true" className="lane-ghost" />}
        </div>
    );
};
