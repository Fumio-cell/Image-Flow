import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useProjectStore } from '../../store/useProjectStore';
import type { Clip, TransitionType } from '../../types';
import { SecondsField } from './SecondsField';
import { formatSecondsLabel } from './timeFormat';

const NAMES: Record<TransitionType, string> = {
    'cut': 'Cut',
    'dissolve': 'Dissolve',
    'delta-flow': 'Delta Flow',
    'breathing-morph': 'Breathing Morph',
    'glitch': 'Glitch',
};
const ORDER: TransitionType[] = ['cut', 'dissolve', 'delta-flow', 'breathing-morph', 'glitch'];

/** Chip text: the transition and its overlap; a cut has no overlap to show. */
const junctionText = (clip: Clip): string =>
    clip.transitionType === 'cut' ? NAMES.cut : `${NAMES[clip.transitionType]} ${formatSecondsLabel(clip.transitionDurationMs)}`;

/**
 * A button on the visual lane at the junction between `prev` and `clip` (Auto-pack only).
 * It opens an in-page popover to change the transition and the overlap, through the store's normal
 * update path (so Cut <=> overlap 0 and the re-pack both apply). One popover session is one undo step.
 */
export const JunctionChip: React.FC<{ clip: Clip; prev: Clip; number: number; zoomScale: number }> = ({ clip, prev, number, zoomScale }) => {
    const updateClip = useProjectStore(s => s.updateClip);
    const updateClipTransient = useProjectStore(s => s.updateClipTransient);

    const [open, setOpen] = useState(false);
    const chipRef = useRef<HTMLButtonElement>(null);
    const popRef = useRef<HTMLDivElement>(null);
    const selectRef = useRef<HTMLSelectElement>(null);
    const edited = useRef(false); // has this popover session already pushed its undo step?
    const selectId = useId();
    const [pos, setPos] = useState<{ left: number; bottom: number } | null>(null);

    const prevEnd = prev.startTimeMs + prev.durationMs;
    const centerMs = (clip.startTimeMs + prevEnd) / 2;
    const text = junctionText(clip);

    // First edit of a session pushes one history step; later edits in the same session ride on it,
    // so a single undo restores everything changed while the popover was open.
    const apply = (updates: Partial<Clip>) => {
        if (!edited.current) { updateClip(clip.id, updates); edited.current = true; }
        else updateClipTransient(clip.id, updates);
    };

    const close = (refocus: boolean) => {
        setOpen(false);
        if (refocus) chipRef.current?.focus();
    };

    useLayoutEffect(() => {
        if (!open || !chipRef.current) return;
        const r = chipRef.current.getBoundingClientRect();
        setPos({ left: Math.max(8, Math.min(r.left + r.width / 2 - 110, window.innerWidth - 236)), bottom: window.innerHeight - r.top + 6 });
    }, [open]);

    useEffect(() => {
        if (!open) return;
        edited.current = false;
        selectRef.current?.focus();
        const onDown = (e: MouseEvent) => {
            const t = e.target as Node;
            if (popRef.current?.contains(t) || chipRef.current?.contains(t)) return;
            setOpen(false);
        };
        document.addEventListener('mousedown', onDown);
        return () => document.removeEventListener('mousedown', onDown);
    }, [open, pos]);

    return (
        <>
            <style>{`.junction-chip:focus-visible{outline:2px solid #fff;outline-offset:2px}`}</style>
            <button
                ref={chipRef}
                type="button"
                className="junction-chip"
                aria-haspopup="dialog"
                aria-expanded={open}
                aria-label={`${text}, junction ${number}. Edit transition`}
                onMouseDown={(e) => e.stopPropagation()}  // not a scrub, not a clip press
                onClick={() => (open ? close(false) : setOpen(true))}
                onKeyDown={(e) => {
                    // The app's global shortcuts would turn Space into play/pause (and swallow the button's own
                    // click) and Delete/Backspace into "delete the selected clip". On a focused chip they are ours.
                    if (e.key === ' ' || e.key === 'Delete' || e.key === 'Backspace') e.stopPropagation();
                }}
                style={{
                    position: 'absolute', bottom: '10px', left: `${centerMs * zoomScale}px`, transform: 'translateX(-50%)',
                    zIndex: 6, padding: '2px 8px', fontSize: '11px', lineHeight: 1.4, whiteSpace: 'nowrap',
                    color: '#fff', backgroundColor: 'rgba(17, 19, 23, 0.92)', border: '1px solid #7c5cfc', borderRadius: '10px',
                    cursor: 'pointer',
                }}
            >
                {text}
            </button>
            {open && pos && createPortal(
                <div
                    ref={popRef}
                    role="dialog"
                    aria-label={`Transition at junction ${number}`}
                    onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); close(true); } }}
                    style={{
                        position: 'fixed', left: pos.left, bottom: pos.bottom, width: '220px', zIndex: 10000,
                        display: 'flex', flexDirection: 'column', gap: '0.6rem', padding: '0.75rem',
                        backgroundColor: 'var(--panel-bg)', border: '1px solid var(--panel-border)', borderRadius: 'var(--radius-md)',
                        boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                    }}
                >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                        <label htmlFor={selectId} style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Transition</label>
                        <select
                            id={selectId}
                            ref={selectRef}
                            value={clip.transitionType}
                            onChange={(e) => apply({ transitionType: e.target.value as TransitionType })}
                        >
                            {ORDER.map(t => <option key={t} value={t}>{NAMES[t]}</option>)}
                        </select>
                    </div>
                    <SecondsField
                        label="Overlap (s)"
                        valueMs={clip.transitionDurationMs}
                        onCommit={(ms) => apply({ transitionDurationMs: ms })}
                    />
                </div>,
                document.body
            )}
        </>
    );
};
