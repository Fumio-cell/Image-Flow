import React, { useRef, useState } from 'react';
import { Info } from 'lucide-react';
import { DEMO_MODE } from '../../config';
import { AboutDialog } from './AboutDialog';

export const Header: React.FC = () => {
    const [showInfo, setShowInfo] = useState(false);
    const infoBtnRef = useRef<HTMLButtonElement>(null);

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

                .info-btn {
                    background: transparent; border: none; color: var(--paper-dim); cursor: pointer;
                    display: flex; align-items: center; justify-content: center;
                    margin-left: var(--space-2); transition: color 120ms ease-out;
                }
                .info-btn:hover { color: var(--paper); }
            `}
            </style>
        
            <AboutDialog open={showInfo} onClose={() => setShowInfo(false)} returnFocusRef={infoBtnRef} />
        </header>
    );
};
