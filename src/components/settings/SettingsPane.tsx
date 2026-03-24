import React, { useState, useEffect } from 'react';
import { useProjectStore } from '../../store/useProjectStore';

/** A number input that only commits on blur or Enter — avoids undo-per-keystroke */
const NumberField: React.FC<{
    label: string;
    value: number;
    min?: number;
    onChange: (v: number) => void;
}> = ({ label, value, min, onChange }) => {
    const [local, setLocal] = useState(String(value));

    // Sync from store when the external value changes (e.g. drag on timeline)
    useEffect(() => {
        setLocal(String(value));
    }, [value]);

    const commit = () => {
        let n = parseInt(local, 10);
        if (isNaN(n)) n = value; // revert
        if (min !== undefined && n < min) n = min;
        onChange(n);
        setLocal(String(n));
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <label style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{label}</label>
            <input
                type="number"
                value={local}
                onChange={(e) => setLocal(e.target.value)}
                onBlur={commit}
                onKeyDown={(e) => { if (e.key === 'Enter') commit(); }}
            />
        </div>
    );
};

const RangeField: React.FC<{
    label: string;
    value: number;
    min: number;
    max: number;
    step?: number;
    onChange: (v: number) => void;
}> = ({ label, value, min, max, step = 0.01, onChange }) => {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', marginBottom: '0.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{label}</label>
                <span style={{ fontSize: '10px', color: 'var(--text-accent)' }}>{value.toFixed(2)}</span>
            </div>
            <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={value}
                onChange={(e) => onChange(parseFloat(e.target.value))}
                style={{ width: '100%', cursor: 'pointer' }}
            />
        </div>
    );
};

export const SettingsPane: React.FC = () => {
    const selectedClipId = useProjectStore((s) => s.ui.selectedClipId);
    const clips = useProjectStore((s) => s.data.clips);
    const clip = clips.find(c => c.id === selectedClipId);
    const updateClip = useProjectStore((s) => s.updateClip);
    const removeClip = useProjectStore((s) => s.removeClip);

    if (!clip) {
        return (
            <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', height: '100%', color: 'var(--text-muted)' }}>
                <h3 style={{ fontSize: '14px', margin: 0, marginBottom: '1rem', color: 'var(--text-main)' }}>Settings</h3>
                <p style={{ fontSize: '12px', textAlign: 'center', marginTop: '2rem' }}>No clip selected.</p>
            </div>
        );
    }

    // Find the previous clip (by timeline order) to calculate overlap info
    const sorted = [...clips].sort((a, b) => a.startTimeMs - b.startTimeMs);
    const clipIndex = sorted.findIndex(c => c.id === clip.id);
    const prevClip = clipIndex > 0 ? sorted[clipIndex - 1] : null;
    const prevEnd = prevClip ? prevClip.startTimeMs + prevClip.durationMs : 0;
    const overlapMs = prevClip ? Math.max(0, prevEnd - clip.startTimeMs) : 0;

    return (
        <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', height: '100%', gap: '1rem' }}>
            <h3 style={{ fontSize: '14px', margin: 0 }}>Clip Settings</h3>

            <NumberField
                label="Start Time (ms)"
                value={clip.startTimeMs}
                min={0}
                onChange={(v) => updateClip(clip.id, { startTimeMs: v })}
            />

            <NumberField
                label="Duration (ms)"
                value={clip.durationMs}
                min={100}
                onChange={(v) => updateClip(clip.id, { durationMs: v })}
            />

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                <label style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Transition Type</label>
                <select
                    value={clip.transitionType}
                    onChange={(e) => updateClip(clip.id, { transitionType: e.target.value as any })}
                >
                    <option value="cut">Cut</option>
                    <option value="dissolve">Dissolve</option>
                </select>
            </div>

            {clip.transitionType === 'dissolve' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', padding: '0.5rem', backgroundColor: 'var(--panel-bg)', borderRadius: 'var(--radius-sm)' }}>
                    {clipIndex === 0 ? (
                        <label style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                            ⚠️ 最初のクリップではDissolveは効きません。2つ目以降のクリップに設定してください。
                        </label>
                    ) : overlapMs > 0 ? (
                        <label style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                            ✅ 前のクリップと {overlapMs}ms 重なっています。この重なり部分でクロスフェードします。
                        </label>
                    ) : (
                        <label style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                            ⚠️ 前のクリップと重なっていません。Start Timeを調整して前のクリップと重なるようにするか、下のボタンでオーバーラップを自動設定してください。
                        </label>
                    )}
                    {clipIndex > 0 && overlapMs <= 0 && prevClip && (
                        <button
                            className="btn btn-secondary"
                            style={{ fontSize: '11px' }}
                            onClick={() => {
                                // Move this clip back to overlap with previous by 500ms
                                const newStart = Math.max(0, prevEnd - 500);
                                updateClip(clip.id, { startTimeMs: newStart });
                            }}
                        >
                            自動オーバーラップ (500ms)
                        </button>
                    )}
                </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                <label style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Image Fit Mode</label>
                <select
                    value={clip.fitMode}
                    onChange={(e) => updateClip(clip.id, { fitMode: e.target.value as any })}
                >
                    <option value="fit">Fit</option>
                    <option value="fill">Fill (Crop)</option>
                    <option value="center">Center</option>
                </select>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                <label style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Ken Burns Effect (Motion)</label>
                <select
                    value={clip.motionType || 'none'}
                    onChange={(e) => updateClip(clip.id, { motionType: e.target.value as any })}
                >
                    <option value="none">None</option>
                    <option value="zoom-in">Zoom In</option>
                    <option value="zoom-out">Zoom Out</option>
                    <option value="pan-left">Pan Left</option>
                    <option value="pan-right">Pan Right</option>
                    <option value="pan-up">Pan Up</option>
                    <option value="pan-down">Pan Down</option>
                </select>

                <div style={{ padding: '0.5rem', marginTop: '0.25rem', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--panel-border)', display: (clip.motionType && clip.motionType !== 'none') ? 'block' : 'none' }}>
                    <RangeField
                        label="Motion Intensity"
                        value={clip.motionIntensity !== undefined ? clip.motionIntensity : 0.1}
                        min={0.0}
                        max={1.0}
                        onChange={(v) => updateClip(clip.id, { motionIntensity: v })}
                    />
                    <RangeField
                        label="Motion Speed"
                        value={clip.motionSpeed !== undefined ? clip.motionSpeed : 0.5}
                        min={0.0}
                        max={1.0}
                        onChange={(v) => updateClip(clip.id, { motionSpeed: v })}
                    />
                    <p style={{ fontSize: '10px', color: 'var(--text-muted)', margin: '0.25rem 0 0 0' }}>
                        Low Speed = Gentle Start | High Intensity = More Movement
                    </p>
                </div>
            </div>

            <div style={{ marginTop: 'auto', paddingTop: '1rem', borderTop: '1px solid var(--panel-border)' }}>
                <button className="btn btn-danger" style={{ width: '100%' }} onClick={() => removeClip(clip.id)}>
                    Delete Clip
                </button>
            </div>
        </div>
    );
};
