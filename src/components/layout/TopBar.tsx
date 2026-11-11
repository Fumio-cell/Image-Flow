import React, { useCallback, useRef, useState } from 'react';
import { Download, FolderOpen, Save, FilePlus2, Play, Pause } from 'lucide-react';
import { saveProject, loadProject } from '../../utils/projectPersistence';
import { startMP4Export } from '../../utils/exportUtils';
import { useProjectStore } from '../../store/useProjectStore';
import { DEMO_MODE, DEMO_MAX_SECONDS } from '../../config';
import { exportLengthMs, projectLengthMs } from '../../utils/audioReaction';
import { DemoExportPanel } from './DemoExportPanel';
import { ModalDialog } from '../common/ModalDialog';
import { notify } from '../../utils/notify';

export const TopBar: React.FC = () => {
    const isPlaying = useProjectStore(s => s.ui.isPlaying);
    const setIsPlaying = useProjectStore(s => s.setIsPlaying);
    const clips = useProjectStore(s => s.data.clips);
    const assets = useProjectStore(s => s.data.assets);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const exportBtnRef = useRef<HTMLButtonElement>(null);

    const [exporting, setExporting] = useState(false);
    const [exportProgress, setExportProgress] = useState(0);
    const [showDemoPanel, setShowDemoPanel] = useState(false);
    const [clearing, setClearing] = useState(false);

    // Demo note: the cap itself lives in exportLengthMs (one rule); here we only compare.
    const demoCut = DEMO_MODE && exportLengthMs(clips, assets) < projectLengthMs(clips, assets);

    const closeDemoPanel = useCallback(() => {
        setShowDemoPanel(false);
        exportBtnRef.current?.focus();
    }, []);

    // Asks in the page (not confirm()); "Clear project" reloads the app, which starts an empty project.
    const handleNewProject = () => setClearing(true);

    const handleLoadProject = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            await loadProject(file);
        }
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handleExport = () => {
        setShowDemoPanel(false);
        setExporting(true);
        setExportProgress(0);
        startMP4Export(
            (p) => setExportProgress(Math.round(p * 100)),
            (url) => {
                setExporting(false);
                if (DEMO_MODE) setShowDemoPanel(true);
                // Streamed exports are already saved to the chosen file —
                // only the in-memory fallback hands back a URL to download.
                if (!url) return;
                const a = document.createElement('a');
                a.href = url;
                a.download = `image-flow-${Date.now()}.mp4`;
                a.style.display = 'none';
                document.body.appendChild(a);
                a.click();
                setTimeout(() => {
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                }, 1000);
            },
            (err) => {
                setExporting(false);
                if (err === 'Export cancelled.') return; // User dismissed the save dialog.
                notify(`Export failed: ${err}`, { title: 'Export failed', returnFocus: () => exportBtnRef.current });
            }
        );
    };

    return (
        <>
            <section aria-label="Project controls">
            <div style={{
                minHeight: '48px',
                borderBottom: 'var(--rule-signature) solid var(--acid)',
                backgroundColor: 'var(--ink)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0 var(--space-4)'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                    <h2 style={{ margin: 0 }}>Project Controls</h2>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                    <button className="btn btn-icon" onClick={() => setIsPlaying(!isPlaying)} aria-label={isPlaying ? 'Pause' : 'Play'}>
                        {isPlaying ? <Pause size={16} /> : <Play size={16} />}
                    </button>
                    <div style={{ width: 'var(--rule-hair)', height: '24px', backgroundColor: 'var(--line-control)', margin: '0 var(--space-2)' }} />

                    <button className="btn btn-secondary" onClick={handleNewProject}>
                        <FilePlus2 size={16} /> New Project
                    </button>

                    <button className="btn btn-secondary" onClick={() => fileInputRef.current?.click()}>
                        <FolderOpen size={16} /> Open
                    </button>
                    <input type="file" ref={fileInputRef} style={{ display: 'none' }} accept=".json" onChange={handleLoadProject} />

                    <button className="btn btn-secondary" onClick={saveProject}>
                        <Save size={16} /> Save
                    </button>
                    <div style={{ width: 'var(--rule-hair)', height: '24px', backgroundColor: 'var(--line-control)', margin: '0 var(--space-2)' }} />
                    <div style={{ position: 'relative' }}>
                        <button
                            ref={exportBtnRef}
                            className="btn btn-primary"
                            onClick={handleExport}
                            disabled={exporting}
                        >
                            <Download size={16} /> {exporting ? 'Exporting...' : DEMO_MODE ? 'Export MP4 (10s preview)' : 'Export MP4'}
                        </button>
                        {DEMO_MODE && showDemoPanel && <DemoExportPanel onClose={closeDemoPanel} />}
                    </div>
                </div>
            </div>

            {DEMO_MODE && (
                <p className="demo-note">
                    {demoCut
                        ? `Demo: this project is longer than ${DEMO_MAX_SECONDS} s. Only the first ${DEMO_MAX_SECONDS} s will be exported.`
                        : `Demo: exports are limited to ${DEMO_MAX_SECONDS} seconds.`}
                </p>
            )}
            </section>

            {exporting && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'color-mix(in srgb, var(--ink-stage) 85%, transparent)', zIndex: 9999,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column'
                }}>
                    <div role="dialog" aria-modal="true" aria-label="Exporting video" style={{ backgroundColor: 'var(--ink)', border: 'var(--rule-hair) solid var(--line-control)', padding: 'var(--space-5)', borderRadius: 'var(--radius-none)', width: '320px', textAlign: 'center' }}>
                        <h2 style={{ marginBottom: 'var(--space-3)', margin: 0 }}>Exporting Video...</h2>
                        <div style={{ width: '100%', height: '8px', backgroundColor: 'var(--line)', overflow: 'hidden', margin: 'var(--space-3) 0' }}>
                            <div style={{ width: `${exportProgress}%`, height: '100%', backgroundColor: 'var(--paper)', transition: 'width 120ms linear' }} />
                        </div>
                        <p style={{ margin: 0 }} className="t-value">{exportProgress}%</p>
                    </div>
                </div>
            )}

            {clearing && (
                <ModalDialog
                    title="Clear the current project?"
                    message="This removes everything in the project and starts a new, empty one. It cannot be undone."
                    actions={[{ label: 'Cancel', autoFocus: true, onClick: () => setClearing(false) }, { label: 'Clear project', primary: true, onClick: () => window.location.reload() }]}
                    onClose={() => setClearing(false)}
                />
            )}
        </>
    );
};
