import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useProjectStore } from '../../store/useProjectStore';
import { SAMPLE_CREDIT, isSampleAsset, loadSample } from '../../utils/sampleProject';

// The app's global shortcuts take these keys from any non-input target; our controls keep them.
const stopAppKeys = (e: React.KeyboardEvent) => {
    if (e.code === 'Space' || e.code === 'Delete' || e.code === 'Backspace') e.stopPropagation();
};

const focusTrigger = () => setTimeout(() => document.querySelector<HTMLElement>('[data-sample-trigger]')?.focus(), 0);

/** In-page confirmation (not confirm()): replaces the project only on "Load sample". */
const ConfirmDialog: React.FC<{ onLoad: () => void; onCancel: () => void }> = ({ onLoad, onCancel }) => {
    const loadRef = useRef<HTMLButtonElement>(null);
    const cancelRef = useRef<HTMLButtonElement>(null);

    useEffect(() => { loadRef.current?.focus(); }, []);
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [onCancel]);

    // Two buttons: Tab / Shift+Tab cycle between them while the dialog is open.
    const onKeyDown = (e: React.KeyboardEvent) => {
        stopAppKeys(e);
        if (e.key !== 'Tab') return;
        const active = document.activeElement;
        if (e.shiftKey && active === cancelRef.current) { e.preventDefault(); loadRef.current?.focus(); }
        else if (!e.shiftKey && active === loadRef.current) { e.preventDefault(); cancelRef.current?.focus(); }
    };

    return createPortal(
        <div
            onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}
            style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
            <div
                role="dialog" aria-modal="true" aria-labelledby="sample-confirm-title" aria-describedby="sample-confirm-text"
                onKeyDown={onKeyDown}
                style={{ width: '340px', maxWidth: '90vw', padding: '1.25rem', backgroundColor: 'var(--panel-bg)', border: '1px solid var(--panel-border)', borderRadius: 'var(--radius-md)', boxShadow: '0 12px 32px rgba(0,0,0,0.5)', color: 'var(--text-main)' }}
            >
                <h4 id="sample-confirm-title" style={{ margin: '0 0 0.5rem', fontSize: '14px', fontWeight: 600 }}>Load the sample?</h4>
                <p id="sample-confirm-text" style={{ margin: '0 0 1rem', fontSize: '12px', lineHeight: 1.5, color: 'var(--text-muted)' }}>
                    This replaces your current project. You can undo it.
                </p>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                    <button ref={cancelRef} type="button" className="btn btn-secondary" onClick={onCancel}>Cancel</button>
                    {/* Not .btn-primary: its white-on-accent text is below 4.5:1 (an existing issue, left alone); this one passes. */}
                    <button ref={loadRef} type="button" className="btn" onClick={onLoad} style={{ backgroundColor: 'var(--accent-active)', color: '#fff' }}>Load sample</button>
                </div>
            </div>
        </div>,
        document.body
    );
};

/** "Try a sample": loads the shipped sample project. Asks first when the project is not empty. */
export const TrySampleButton: React.FC<{ prominent?: boolean }> = ({ prominent }) => {
    const [busy, setBusy] = useState(false);
    const [failed, setFailed] = useState(false);
    const [confirming, setConfirming] = useState(false);

    const run = async () => {
        setConfirming(false);
        setBusy(true);
        setFailed(false);
        try {
            await loadSample();
        } catch (err) {
            console.error('[Sample] Could not load the sample', err);
            setFailed(true);
        } finally {
            setBusy(false);
            focusTrigger();
        }
    };

    const onClick = () => {
        const { assets, clips } = useProjectStore.getState().data;
        if (assets.length === 0 && clips.length === 0) void run();
        else setConfirming(true);
    };

    const cancel = () => { setConfirming(false); focusTrigger(); };

    return (
        <div style={{ textAlign: prominent ? 'center' : 'left' }}>
            <button
                type="button"
                data-sample-trigger
                className="btn btn-secondary"
                onClick={onClick}
                onKeyDown={stopAppKeys}
                disabled={busy}
                style={prominent ? { borderColor: 'var(--accent-color)' } : { width: '100%', justifyContent: 'center' }}
            >
                {busy ? 'Loading sample…' : 'Try a sample'}
            </button>
            {failed && <p role="alert" style={{ margin: '0.5rem 0 0', fontSize: '11px', color: 'var(--text-muted)' }}>Could not load the sample. Check your connection and try again.</p>}
            {confirming && <ConfirmDialog onLoad={() => { void run(); }} onCancel={cancel} />}
        </div>
    );
};

/** The sample's credit, visible while any sample asset is in the project. */
export const SampleCredit: React.FC = () => {
    const show = useProjectStore(s => s.data.assets.some(a => isSampleAsset(a.id)));
    if (!show) return null;
    return <p data-sample-credit style={{ margin: 0, fontSize: '10px', lineHeight: 1.4, color: 'var(--text-muted)' }}>{SAMPLE_CREDIT}</p>;
};
