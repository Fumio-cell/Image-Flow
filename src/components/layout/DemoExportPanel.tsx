import React, { useEffect, useRef } from 'react';
import { DEMO_MAX_SECONDS, BUY_URL } from '../../config';

interface Props {
    onClose: () => void;
}

/**
 * Demo build only: shown after an export finishes. Focus moves here when it opens;
 * Escape or the Close button dismisses it (the caller puts focus back on Export).
 */
export const DemoExportPanel: React.FC<Props> = ({ onClose }) => {
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        ref.current?.focus();
    }, []);

    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                onClose();
            }
        };
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, [onClose]);

    return (
        <div ref={ref} className="demo-panel" role="dialog" aria-labelledby="demo-panel-title" tabIndex={-1}>
            <h3 id="demo-panel-title">Export finished</h3>
            <p>The demo exports up to {DEMO_MAX_SECONDS} seconds. The full version exports any length.</p>
            <div className="demo-panel-actions">
                <a href={BUY_URL} target="_blank" rel="noopener noreferrer">Get the full version</a>
                <button type="button" className="btn btn-secondary" onClick={onClose}>Close</button>
            </div>
        </div>
    );
};
