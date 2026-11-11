import React, { useState } from 'react';
import { useProjectStore } from '../../store/useProjectStore';
import { SAMPLE_CREDIT, isSampleAsset, loadSample } from '../../utils/sampleProject';
import { ModalDialog } from '../common/ModalDialog';

// The app's global shortcuts take these keys from any non-input target; our controls keep them.
const stopAppKeys = (e: React.KeyboardEvent) => {
    if (e.code === 'Space' || e.code === 'Delete' || e.code === 'Backspace') e.stopPropagation();
};

const focusTrigger = () => setTimeout(() => document.querySelector<HTMLElement>('[data-sample-trigger]')?.focus(), 0);

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
                style={prominent ? undefined : { width: '100%', justifyContent: 'center' }}
            >
                {busy ? 'Loading sample…' : 'Try a sample'}
            </button>
            {failed && <p role="alert" style={{ margin: 'var(--space-2) 0 0' }}>Could not load the sample. Check your connection and try again.</p>}
            {confirming && (
                <ModalDialog
                    title="Load the sample?"
                    message="This replaces your current project. You can undo it."
                    actions={[{ label: 'Cancel', onClick: cancel }, { label: 'Load sample', primary: true, onClick: () => { void run(); } }]}
                    onClose={cancel}
                    returnFocus={() => document.querySelector<HTMLElement>('[data-sample-trigger]')}
                />
            )}
        </div>
    );
};

/** The sample's credit, visible while any sample asset is in the project. */
export const SampleCredit: React.FC = () => {
    const show = useProjectStore(s => s.data.assets.some(a => isSampleAsset(a.id)));
    if (!show) return null;
    return <p data-sample-credit className="t-note" style={{ margin: 0 }}>{SAMPLE_CREDIT}</p>;
};
