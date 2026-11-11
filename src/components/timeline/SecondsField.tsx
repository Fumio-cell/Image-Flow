import React, { useEffect, useId, useState } from 'react';
import { formatSeconds } from './timeFormat';

/**
 * A number input in SECONDS (step 0.1, shown with one decimal) that edits a millisecond value.
 * Commits on blur or Enter. Typing accepts any number of decimals (2.25 -> 2250 ms). Because the
 * display rounds to one decimal, a field you did not edit never writes back (2625 ms shows 2.6 but stays 2625).
 */
export const SecondsField: React.FC<{
    label: string;
    valueMs: number;
    minMs?: number;
    disabled?: boolean;
    onCommit: (ms: number) => void;
    inputRef?: React.Ref<HTMLInputElement>;
}> = ({ label, valueMs, minMs = 0, disabled, onCommit, inputRef }) => {
    const id = useId();
    const shown = formatSeconds(valueMs);
    const [local, setLocal] = useState(shown);

    useEffect(() => {
        setLocal(shown);
    }, [shown]);

    const commit = () => {
        if (local === shown) return; // untouched: nothing to write
        const sec = parseFloat(local);
        if (isNaN(sec)) { setLocal(shown); return; } // revert
        const ms = Math.max(minMs, Math.round(sec * 1000));
        if (ms === valueMs) { setLocal(shown); return; } // same value: no write, no extra undo step
        onCommit(ms);
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
            <label htmlFor={id}>{label}</label>
            <input
                id={id}
                ref={inputRef}
                type="number"
                min={minMs / 1000}
                step={0.1}
                value={local}
                disabled={disabled}
                onChange={(e) => setLocal(e.target.value)}
                onBlur={commit}
                onKeyDown={(e) => { if (e.key === 'Enter') commit(); }}
            />
        </div>
    );
};
