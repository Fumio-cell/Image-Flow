import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

export interface DialogAction {
    label: string;
    onClick: () => void;
    /** The default action: styled as primary, and focused when the dialog opens (unless another action sets autoFocus). */
    primary?: boolean;
    /** Focused when the dialog opens: use it on Cancel for an action that cannot be undone. */
    autoFocus?: boolean;
}

interface Props {
    title: string;
    message: React.ReactNode;
    actions: DialogAction[];
    /** Escape, a click outside the dialog. */
    onClose: () => void;
    role?: 'dialog' | 'alertdialog';
    /** Where focus goes when the dialog closes. Default: the element that had focus when it opened. */
    returnFocus?: () => HTMLElement | null;
}

// The app's global shortcuts take these keys from any non-input target; a dialog keeps them.
const stopAppKeys = (e: React.KeyboardEvent) => {
    if (e.code === 'Space' || e.code === 'Delete' || e.code === 'Backspace') e.stopPropagation();
};

/**
 * In-page modal (never alert / confirm). Focus moves to the primary button, Tab / Shift+Tab cycle between the
 * buttons, Escape closes it and focus returns to where it was.
 */
export const ModalDialog: React.FC<Props> = ({ title, message, actions, onClose, role = 'dialog', returnFocus }) => {
    const buttons = useRef<(HTMLButtonElement | null)[]>([]);
    const opener = useRef<HTMLElement | null>(document.activeElement as HTMLElement | null);
    const titleId = React.useId();
    const textId = React.useId();

    useEffect(() => {
        const explicit = actions.findIndex(a => a.autoFocus);
        const first = explicit >= 0 ? explicit : Math.max(0, actions.findIndex(a => a.primary));
        buttons.current[first]?.focus();
        const from = opener.current;
        return () => {
            const target = returnFocus?.() ?? from;
            if (target && document.contains(target)) setTimeout(() => target.focus(), 0);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') { e.preventDefault(); onClose(); }
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [onClose]);

    const onKeyDown = (e: React.KeyboardEvent) => {
        stopAppKeys(e);
        if (e.key !== 'Tab') return;
        const list = buttons.current.filter((b): b is HTMLButtonElement => !!b);
        const first = list[0], last = list[list.length - 1], active = document.activeElement;
        if (e.shiftKey && active === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
    };

    return createPortal(
        <div
            onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
            style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
            <div
                role={role} aria-modal="true" aria-labelledby={titleId} aria-describedby={textId}
                onKeyDown={onKeyDown}
                style={{ width: '360px', maxWidth: '90vw', padding: '1.25rem', backgroundColor: 'var(--panel-bg)', border: '1px solid var(--panel-border)', borderRadius: 'var(--radius-md)', boxShadow: '0 12px 32px rgba(0,0,0,0.5)', color: 'var(--text-main)' }}
            >
                <h2 id={titleId} style={{ margin: '0 0 0.5rem', fontSize: '14px', fontWeight: 600 }}>{title}</h2>
                <p id={textId} style={{ margin: '0 0 1rem', fontSize: '12px', lineHeight: 1.5, color: 'var(--text-muted)', whiteSpace: 'pre-wrap' }}>{message}</p>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                    {actions.map((a, i) => (
                        <button key={a.label} ref={(el) => { buttons.current[i] = el; }} type="button" className={`btn ${a.primary ? 'btn-primary' : 'btn-secondary'}`} onClick={a.onClick}>{a.label}</button>
                    ))}
                </div>
            </div>
        </div>,
        document.body
    );
};
