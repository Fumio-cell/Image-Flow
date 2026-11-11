import React, { useId } from 'react';
import { useProjectStore } from '../../store/useProjectStore';
import type { ExportQuality, FPS, Resolution } from '../../types';
import { RESOLUTIONS, firstVisualAsset, resolutionEnlarges, resolutionEntry, resolutionName } from '../../utils/pickResolution';

const SELECT_STYLE: React.CSSProperties = {};
const LABEL_STYLE: React.CSSProperties = {};
const FIELD_STYLE: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' };

/**
 * Project settings: resolution (with the automatic-choice message and the "will be enlarged" line), export quality, frame rate.
 * `compact` (a clip is selected and the pane shows the clip's settings): the three controls sit in a collapsed
 * "Project settings" section, the message and the warning stay visible above it.
 */
export const ProjectSettingsControls: React.FC<{ compact?: boolean }> = ({ compact }) => {
    const settings = useProjectStore((s) => s.data.settings);
    const assets = useProjectStore((s) => s.data.assets);
    const updateSettings = useProjectStore((s) => s.updateSettings);
    const setResolution = useProjectStore((s) => s.setResolution);
    const resolutionNotice = useProjectStore((s) => s.ui.resolutionNotice);
    const dismissResolutionNotice = useProjectStore((s) => s.dismissResolutionNotice);
    const resolutionId = useId();
    const qualityId = useId();
    const fpsId = useId();
    const enlarged = resolutionEnlarges(settings.resolution, assets);
    const firstIsVideo = firstVisualAsset(assets)?.type === 'video';

    const messages = (
        <>
            {resolutionNotice && (
                <div role="status" className="t-note" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 'var(--space-2)', color: 'var(--paper)', backgroundColor: 'var(--ink-panel)', border: 'var(--rule-hair) solid var(--line)', borderRadius: 'var(--radius-none)', padding: 'var(--space-2)' }}>
                    <span>{resolutionNotice}</span>
                    <button type="button" className="btn btn-secondary" onClick={dismissResolutionNotice} style={{ padding: '0 var(--space-2)', flexShrink: 0 }}>Dismiss</button>
                </div>
            )}
            {enlarged && (
                <p style={{ margin: 0, color: 'var(--paper)' }}>
                    {resolutionName(settings.resolution)} is larger than your {firstIsVideo ? 'video; it' : 'images; they'} will be enlarged.
                </p>
            )}
        </>
    );

    const resolutionField = (
        <div style={FIELD_STYLE}>
            <label htmlFor={resolutionId} style={LABEL_STYLE}>Export Resolution</label>
            <select id={resolutionId} value={settings.resolution} onChange={(e) => setResolution(e.target.value as Resolution)} style={SELECT_STYLE}>
                {RESOLUTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
            {!compact && messages}
        </div>
    );
    const qualityField = (
        <div style={FIELD_STYLE}>
            <label htmlFor={qualityId} style={LABEL_STYLE}>Export quality</label>
            <select id={qualityId} value={settings.exportQuality ?? 'standard'} onChange={(e) => updateSettings({ exportQuality: e.target.value as ExportQuality })} style={SELECT_STYLE}>
                <option value="standard">Standard</option>
                <option value="high">High (about twice the file size)</option>
            </select>
        </div>
    );
    const fpsField = (
        <div style={FIELD_STYLE}>
            <label htmlFor={fpsId} style={LABEL_STYLE}>Framerate (FPS)</label>
            <select id={fpsId} value={settings.fps} onChange={(e) => updateSettings({ fps: parseInt(e.target.value, 10) as FPS })} style={SELECT_STYLE}>
                <option value="24">24 FPS (Cinematic)</option>
                <option value="30">30 FPS (Standard)</option>
                <option value="60">60 FPS (Smooth)</option>
            </select>
        </div>
    );

    if (!compact) {
        return <>{resolutionField}{qualityField}{fpsField}</>;
    }
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            {messages}
            <details style={{ border: 'var(--rule-hair) solid var(--line)', borderRadius: 'var(--radius-none)', padding: 'var(--space-2)' }}>
                <summary className="t-control" style={{ cursor: 'pointer', color: 'var(--paper)' }}>
                    Project settings <span style={{ color: 'var(--paper-dim)' }}>({resolutionEntry(settings.resolution).label}, {settings.exportQuality === 'high' ? 'High' : 'Standard'}, {settings.fps} FPS)</span>
                </summary>
                <div style={{ ...FIELD_STYLE, gap: 'var(--space-3)', marginTop: 'var(--space-3)' }}>
                    {resolutionField}{qualityField}{fpsField}
                </div>
            </details>
        </div>
    );
};
