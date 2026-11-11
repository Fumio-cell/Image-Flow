import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { SAMPLE_CREDIT } from '../../utils/sampleProject';

/**
 * The About dialog (shared by the header's (i) button and the opening screen's "About").
 * Focus moves in, Escape closes it, focus returns to the control that opened it.
 */
export const AboutDialog: React.FC<{ open: boolean; onClose: () => void; returnFocusRef: React.RefObject<HTMLElement | null> }> = ({ open, onClose, returnFocusRef }) => {
    const closeRef = useRef<HTMLButtonElement>(null);
    const onCloseRef = useRef(onClose);
    useEffect(() => { onCloseRef.current = onClose; });

    useEffect(() => {
        if (!open) return;
        closeRef.current?.focus();
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); onCloseRef.current(); } };
        document.addEventListener('keydown', onKey);
        const target = returnFocusRef.current;
        return () => { document.removeEventListener('keydown', onKey); target?.focus(); };
    }, [open, returnFocusRef]);

    if (!open) return null;
    return createPortal(
        <div className="info-modal-overlay" onClick={() => onClose()}>
            <div className="info-modal" role="dialog" aria-modal="true" aria-labelledby="about-title" onClick={e => e.stopPropagation()}>
                <button ref={closeRef} className="info-close" onClick={() => onClose()} aria-label="Close"><X className="w-5 h-5"/></button>
                <h2 id="about-title">Image Flow</h2>
                <h3>Fluid Dynamics Image Distortion &amp; Transitions</h3>

                <div>
                    <p>Image Flow treats static pixels as liquid. Sequence photos on a timeline and bridge them with fluid transitions — an optical-flow Delta Flow warp, a swirling Breathing Morph vortex, or torn Glitch cuts — so each image melts, ripples, or spins into the next. Ken Burns motion and high-quality H.264 + AAC export turn a folder of stills into mesmerizing digital flow art.</p>
                    <ul><li>Key Features: Delta Flow &amp; Breathing Morph transitions, Glitch cuts, Ken Burns motion, timeline-based editing, high-quality video + audio export.</li></ul>
                </div>

                <p data-sample-credit style={{ marginTop: 'var(--space-5)', marginBottom: 0 }}>{SAMPLE_CREDIT}</p>
            </div>
        </div>,
        document.body
    );
};
