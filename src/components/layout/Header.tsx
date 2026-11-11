import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Info, X } from 'lucide-react';
import { DEMO_MODE } from '../../config';
import { SAMPLE_CREDIT } from '../../utils/sampleProject';

export const Header: React.FC = () => {
    const [showInfo, setShowInfo] = useState(false);
    const infoBtnRef = useRef<HTMLButtonElement>(null);
    const closeRef = useRef<HTMLButtonElement>(null);

    // About dialog: focus moves in, Escape closes it, focus returns to the (i) button.
    useEffect(() => {
        if (!showInfo) return;
        closeRef.current?.focus();
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); setShowInfo(false); } };
        document.addEventListener('keydown', onKey);
        const btn = infoBtnRef.current;
        return () => { document.removeEventListener('keydown', onKey); btn?.focus(); };
    }, [showInfo]);

    return (
        <header className="toolkit-header">
            <div className="header-left">
                <div className="toolkit-brand">
                    <svg className="brand-icon" width="28" height="28" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M14 24 L20 16 L26 24 L20 32 Z"/>
                        <circle cx="20" cy="24" r="1.6" fill="currentColor" stroke="none"/>
                        <path d="M26 24 L34 24"/>
                        <circle cx="36" cy="24" r="2.4"/>
                    </svg>
                    <span className="toolkit-name">Poetic Signal Toolkit</span>
                </div>
                <div className="app-separator">/</div>
                <h1 className="app-name">Image Flow</h1>
                <button ref={infoBtnRef} onClick={() => setShowInfo(true)} className="info-btn" aria-label="About Image Flow" title="About Image Flow">
                    <Info className="w-4 h-4" />
                </button>
            </div>

            <div className="header-right">
                {DEMO_MODE && (
                    <div className="preview-badge">FREE PREVIEW</div>
                )}
            </div>

            <style>{`
                .toolkit-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: var(--space-2) var(--space-4);
                    background: var(--ink);
                    border-bottom: var(--rule-hair) solid var(--line);
                    position: sticky;
                    top: 0;
                    z-index: 1000;
                }
                .header-left, .header-right {
                    display: flex;
                    align-items: center;
                    gap: var(--space-3);
                }
                .toolkit-brand {
                    display: flex;
                    align-items: center;
                    gap: var(--space-2);
                    color: var(--paper-dim);
                }
                .brand-icon {
                    width: 28px;
                    height: 28px;
                }
                .toolkit-name {
                    font: 400 10px/14px var(--font-mono);
                    letter-spacing: 0.08em;
                    text-transform: uppercase;
                    color: var(--paper-dim);
                }
                .app-separator {
                    font: 400 12px/18px var(--font-mono);
                    color: var(--paper-label);
                }
                .app-name {
                    margin: 0;
                    font: 900 40px/40px var(--font-display);
                    letter-spacing: -0.03em;
                    text-transform: none;
                    color: var(--paper);
                }
                .preview-badge {
                    display: flex;
                    align-items: center;
                    padding: var(--space-1) var(--space-3);
                    border: var(--rule-hair) solid var(--line-control);
                    border-radius: var(--radius-none);
                    color: var(--paper-dim);
                    font: 500 11px/16px var(--font-mono);
                    letter-spacing: 0.08em;
                    text-transform: uppercase;
                }

                .info-modal-overlay {
                    position: fixed; top: 0; left: 0; right: 0; bottom: 0;
                    background: color-mix(in srgb, var(--ink-stage) 85%, transparent);
                    display: flex; align-items: center; justify-content: center; z-index: 99999;
                }
                .info-modal {
                    background: var(--ink); border: var(--rule-hair) solid var(--line-control);
                    border-radius: var(--radius-none); padding: var(--space-5); max-width: 600px;
                    width: 90%; max-height: 85vh; overflow-y: auto;
                    position: relative;
                    text-align: left;
                }
                .info-modal h2 { margin-top: 0; }
                .info-modal h3 { margin-bottom: var(--space-4); }
                .info-modal p { color: var(--paper-dim); font: 400 11px/19px var(--font-mono); margin-bottom: var(--space-3); }
                .info-modal ul { list-style-type: none; margin: 0; padding: 0; }
                .info-modal li { margin-bottom: var(--space-2); font: 400 11px/19px var(--font-mono); color: var(--paper-dim); }
                .info-close {
                    position: absolute; top: var(--space-3); right: var(--space-3);
                    background: transparent; border: none; color: var(--paper-dim);
                    cursor: pointer; padding: var(--space-2); border-radius: var(--radius-none); transition: color 120ms ease-out;
                }
                .info-close:hover { color: var(--paper); }
                .info-btn {
                    background: transparent; border: none; color: var(--paper-dim); cursor: pointer;
                    display: flex; align-items: center; justify-content: center;
                    margin-left: var(--space-2); transition: color 120ms ease-out;
                }
                .info-btn:hover { color: var(--paper); }
            `}
            </style>
        
            {showInfo && createPortal(
                <div className="info-modal-overlay" onClick={() => setShowInfo(false)}>
                    <div className="info-modal" role="dialog" aria-modal="true" aria-labelledby="about-title" onClick={e => e.stopPropagation()}>
                        <button ref={closeRef} className="info-close" onClick={() => setShowInfo(false)} aria-label="Close"><X className="w-5 h-5"/></button>
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
            )}
        </header>
    );
};
