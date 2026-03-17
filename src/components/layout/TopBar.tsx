import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Download, FolderOpen, Save, FilePlus2, Play, Pause } from 'lucide-react';
import { saveProject, loadProject } from '../../utils/projectPersistence';
import { startMP4Export } from '../../utils/exportUtils';
import { useProjectStore } from '../../store/useProjectStore';
import { signInWithGoogle, openLemonSqueezyCheckout } from '../../utils/commercial';

export const TopBar: React.FC = () => {
    const isPlaying = useProjectStore(s => s.ui.isPlaying);
    const setIsPlaying = useProjectStore(s => s.setIsPlaying);
    const clips = useProjectStore(s => s.data.clips);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [exporting, setExporting] = useState(false);
    const [exportProgress, setExportProgress] = useState(0);
    const [userStatus, setUserStatus] = useState<{ user: any, isPro: boolean }>({ user: null, isPro: false });

    const handleAuthStatus = useCallback((e: any) => {
        setUserStatus(e.detail);
    }, []);

    useEffect(() => {
        window.addEventListener('auth:status', handleAuthStatus as EventListener);
        return () => window.removeEventListener('auth:status', handleAuthStatus as EventListener);
    }, [handleAuthStatus]);

    const handleBuyPro = () => {
        if (!userStatus.user) {
            alert('Please login first to upgrade to PRO.');
            signInWithGoogle();
            return;
        }
        openLemonSqueezyCheckout(userStatus.user.id);
    };

    const handleGatedAction = (action: () => void) => {
        if (!userStatus.isPro) {
            if (confirm('Exporting projects with more than 3 clips is a PRO feature. Would you like to upgrade?')) {
                handleBuyPro();
            }
            return;
        }
        action();
    };

    const handleNewProject = () => {
        if (confirm("Clear current project?")) {
            window.location.reload();
        }
    };

    const handleLoadProject = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            await loadProject(file);
        }
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handleExport = () => {
        const performExport = () => {
            setExporting(true);
            setExportProgress(0);
            startMP4Export(
                (p) => setExportProgress(Math.round(p * 100)),
                (url) => {
                    setExporting(false);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `vapor-flow-${Date.now()}.mp4`;
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
                    alert(`Export failed: ${err}`);
                }
            );
        };

        if (clips.length > 3) {
            handleGatedAction(performExport);
        } else {
            performExport();
        }
    };

    useEffect(() => {
        window.addEventListener('app:buyPro', handleBuyPro);
        return () => window.removeEventListener('app:buyPro', handleBuyPro);
    }, [userStatus]);

    return (
        <>
            <div style={{
                height: '48px',
                borderBottom: '1px solid var(--panel-border)',
                backgroundColor: 'var(--panel-bg)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0 1rem'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <h3 style={{ margin: 0, fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)' }}>Project Controls</h3>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <button className="btn btn-icon" onClick={() => setIsPlaying(!isPlaying)}>
                        {isPlaying ? <Pause size={16} /> : <Play size={16} />}
                    </button>
                    <div style={{ width: '1px', height: '24px', backgroundColor: 'var(--panel-border)', margin: '0 0.5rem' }} />

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
                    <div style={{ width: '1px', height: '24px', backgroundColor: 'var(--panel-border)', margin: '0 0.5rem' }} />
                    <button 
                        className={`btn btn-primary ${clips.length > 3 && !userStatus.isPro ? 'gated' : ''}`} 
                        onClick={handleExport} 
                        disabled={exporting}
                        title={clips.length > 3 && !userStatus.isPro ? 'Upgrade to PRO for more than 3 clips' : ''}
                    >
                        <Download size={16} /> {exporting ? 'Exporting...' : 'Export MP4'}
                    </button>
                </div>
            </div>

            {exporting && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'rgba(0,0,0,0.8)', zIndex: 9999,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column'
                }}>
                    <div style={{ backgroundColor: 'var(--panel-bg)', padding: '2rem', borderRadius: 'var(--radius-md)', width: '300px', textAlign: 'center' }}>
                        <h3 style={{ marginBottom: '1rem', margin: 0 }}>Exporting Video...</h3>
                        <div style={{ width: '100%', height: '8px', backgroundColor: 'var(--panel-border)', borderRadius: '4px', overflow: 'hidden', marginBottom: '1rem' }}>
                            <div style={{ width: `${exportProgress}%`, height: '100%', backgroundColor: 'var(--accent-color)', transition: 'width 0.2s' }} />
                        </div>
                        <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)' }}>{exportProgress}%</p>
                    </div>
                </div>
            )}
        </>
    );
};
