import React, { useId, useRef } from 'react';
import { useProjectStore } from '../../store/useProjectStore';
import { findPrevVisualClip } from '../../utils/prevVisualClip';
import { glitchUntouched, resolveGlitchParams } from '../../utils/glitchParams';
import { SecondsField } from '../timeline/SecondsField';
import { DEFAULT_MUSIC_REACTION } from '../../utils/audioReaction';
import type { Clip, ExportQuality, Resolution } from '../../types';
import { RESOLUTIONS, firstVisualAsset, resolutionEnlarges, resolutionName } from '../../utils/pickResolution';
import { formatSecondsLabel } from '../timeline/timeFormat';

const RangeField: React.FC<{
    label: string;
    value: number;
    min: number;
    max: number;
    step?: number;
    onChange: (v: number) => void;
}> = ({ label, value, min, max, step = 0.01, onChange }) => {
    const id = useId();
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem', marginBottom: '0.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label htmlFor={id} style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{label}</label>
                <span style={{ fontSize: '10px', color: 'var(--text-accent)' }}>{value.toFixed(2)}</span>
            </div>
            <input
                id={id}
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

/**
 * "Music reaction" slider. One drag is ONE undo step: the history snapshot is taken just before the first
 * change of a drag and the rest of the drag only updates the value. A keyboard change (no drag) is one step each.
 */
const MusicReactionSlider: React.FC<{ clip: Clip }> = ({ clip }) => {
    const updateClip = useProjectStore((s) => s.updateClip);
    const updateClipTransient = useProjectStore((s) => s.updateClipTransient);
    const saveHistory = useProjectStore((s) => s.saveHistory);
    const dragging = useRef(false);
    const saved = useRef(false);
    const wrap = useRef<HTMLDivElement>(null);

    const onChange = (v: number) => {
        if (!dragging.current) { updateClip(clip.id, { musicReaction: v }); return; }
        if (!saved.current) { saveHistory(); saved.current = true; }
        updateClipTransient(clip.id, { musicReaction: v });
    };
    const endDrag = () => {
        dragging.current = false; saved.current = false;
        window.removeEventListener('pointerup', endDrag);
        // A focused input swallows Cmd+Z (the global shortcut ignores inputs), and the drag is an undoable step.
        wrap.current?.querySelector('input')?.blur();
    };

    return (
        <div ref={wrap} onPointerDownCapture={() => { dragging.current = true; saved.current = false; window.addEventListener('pointerup', endDrag); }}>
            <RangeField label="Music reaction" value={clip.musicReaction ?? DEFAULT_MUSIC_REACTION} min={0} max={1} onChange={onChange} />
        </div>
    );
};

export const SettingsPane: React.FC = () => {
    const selectedClipId = useProjectStore((s) => s.ui.selectedClipId);
    const clips = useProjectStore((s) => s.data.clips);
    const assets = useProjectStore((s) => s.data.assets);
    const autoPack = useProjectStore((s) => s.data.settings.autoPack === true);
    const clip = clips.find(c => c.id === selectedClipId);
    const clipAsset = clip ? assets.find(a => a.id === clip.assetId) : undefined;
    // Delta Flow and Breathing Morph build a displacement field from a fixed
    // pair of stills, so they can't run against a moving video source.
    const isVideoClip = clipAsset?.type === 'video';
    // Volume applies to anything that carries sound: audio clips, and video
    // clips whose file has an audio track.
    const clipHasAudio =
        clipAsset?.type === 'audio' ||
        (clipAsset?.type === 'video' && clipAsset.hasAudio === true);
    const updateClip = useProjectStore((s) => s.updateClip);
    const removeClip = useProjectStore((s) => s.removeClip);

    const settings = useProjectStore((s) => s.data.settings);
    const updateSettings = useProjectStore((s) => s.updateSettings);
    const setResolution = useProjectStore((s) => s.setResolution);
    const resolutionNotice = useProjectStore((s) => s.ui.resolutionNotice);
    const dismissResolutionNotice = useProjectStore((s) => s.dismissResolutionNotice);
    const qualityId = useId();
    const enlarged = resolutionEnlarges(settings.resolution, assets);
    const firstIsVideo = firstVisualAsset(assets)?.type === 'video';

    if (!clip) {
        return (
            <div style={{ padding: '0.75rem', display: 'flex', flexDirection: 'column', height: '100%', gap: '1rem', color: 'var(--text-muted)' }}>
                <h3 style={{ fontSize: '14px', margin: 0, color: 'var(--text-main)' }}>Project Settings</h3>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <label style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Export Resolution</label>
                    <select
                        value={settings.resolution}
                        onChange={(e) => setResolution(e.target.value as Resolution)}
                        style={{ padding: '0.4rem', backgroundColor: 'var(--bg-dark)', color: 'white', border: '1px solid var(--panel-border)', borderRadius: '4px' }}
                    >
                        {RESOLUTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                    </select>
                    {resolutionNotice && (
                        <div role="status" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.5rem', fontSize: '11px', lineHeight: 1.4, color: 'var(--text-main)', backgroundColor: 'rgba(255,255,255,0.05)', border: '1px solid var(--panel-border)', borderRadius: '4px', padding: '0.35rem 0.5rem' }}>
                            <span>{resolutionNotice}</span>
                            <button type="button" className="btn btn-secondary" onClick={dismissResolutionNotice} style={{ padding: '0 0.4rem', fontSize: '11px', flexShrink: 0 }}>Dismiss</button>
                        </div>
                    )}
                    {enlarged && (
                        <p style={{ margin: 0, fontSize: '11px', lineHeight: 1.4, color: 'rgba(255, 208, 138, 0.95)' }}>
                            {resolutionName(settings.resolution)} is larger than your {firstIsVideo ? 'video; it' : 'images; they'} will be enlarged.
                        </p>
                    )}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <label htmlFor={qualityId} style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Export quality</label>
                    <select
                        id={qualityId}
                        value={settings.exportQuality ?? 'standard'}
                        onChange={(e) => updateSettings({ exportQuality: e.target.value as ExportQuality })}
                        style={{ padding: '0.4rem', backgroundColor: 'var(--bg-dark)', color: 'white', border: '1px solid var(--panel-border)', borderRadius: '4px' }}
                    >
                        <option value="standard">Standard</option>
                        <option value="high">High (about twice the file size)</option>
                    </select>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <label style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Framerate (FPS)</label>
                    <select
                        value={settings.fps}
                        onChange={(e) => updateSettings({ fps: parseInt(e.target.value, 10) as any })}
                        style={{ padding: '0.4rem', backgroundColor: 'var(--bg-dark)', color: 'white', border: '1px solid var(--panel-border)', borderRadius: '4px' }}
                    >
                        <option value="24">24 FPS (Cinematic)</option>
                        <option value="30">30 FPS (Standard)</option>
                        <option value="60">60 FPS (Smooth)</option>
                    </select>
                </div>
                
                <div style={{ marginTop: 'auto', padding: '1rem', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: '8px', fontSize: '11px', textAlign: 'center' }}>
                    Select a clip on the timeline below to edit its properties.
                </div>
            </div>
        );
    }

    // Find the previous visual clip (by timeline order) to calculate overlap info
    const prevClip = findPrevVisualClip(clips, assets, clip);
    const prevEnd = prevClip ? prevClip.startTimeMs + prevClip.durationMs : 0;
    const overlapMs = prevClip ? Math.max(0, prevEnd - clip.startTimeMs) : 0;
    const packedVisual = autoPack && clipAsset?.type !== 'audio';
    // Music reaction needs the audio's envelope, which is made at import and not saved with the project.
    const audioWithoutEnvelope = clips.some(c => {
        const a = assets.find(x => x.id === c.assetId);
        return a?.type === 'audio' && !a.envelope;
    });
    // The sliders show what Glitch really runs with. The first slider you move stores all three, so
    // the other two keep the values you were looking at instead of dropping to 0.
    const glitch = resolveGlitchParams(clip);
    const glitchSeed = glitchUntouched(clip)
        ? { glitchAmount: glitch.amount, glitchIntensity: glitch.intensity, glitchDisplacement: glitch.displacement }
        : {};

    return (
        <div style={{ padding: '0.75rem', display: 'flex', flexDirection: 'column', height: '100%', gap: '0.75rem' }}>
            <h3 style={{ fontSize: '14px', margin: 0 }}>Clip Settings</h3>

            {packedVisual ? (
                // Auto-pack derives the start from the clips before it.
                <div
                    title="Start is set automatically in Auto-pack mode."
                    style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', opacity: 0.45, cursor: 'not-allowed' }}
                >
                    <SecondsField label="Start Time (s)" valueMs={clip.startTimeMs} disabled onCommit={() => { /* derived */ }} />
                </div>
            ) : (
                <SecondsField
                    label="Start Time (s)"
                    valueMs={clip.startTimeMs}
                    onCommit={(ms) => updateClip(clip.id, { startTimeMs: ms })}
                />
            )}

            <SecondsField
                label="Duration (s)"
                valueMs={clip.durationMs}
                minMs={100}
                onCommit={(ms) => updateClip(clip.id, { durationMs: ms })}
            />

            {packedVisual && prevClip && (
                <SecondsField
                    label="Overlap with previous (s)"
                    valueMs={clip.transitionDurationMs}
                    onCommit={(ms) => updateClip(clip.id, { transitionDurationMs: ms })}
                />
            )}

            {clipHasAudio && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <label style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                            Clip Volume
                        </label>
                        <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                            <input
                                type="checkbox"
                                checked={clip.muted ?? false}
                                onChange={(e) => updateClip(clip.id, { muted: e.target.checked })}
                            />
                            Mute
                        </label>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <input
                            className="volume-slider"
                            type="range"
                            min={0}
                            max={1}
                            step={0.01}
                            disabled={clip.muted ?? false}
                            value={clip.volume ?? 1}
                            onChange={(e) => updateClip(clip.id, { volume: Number(e.target.value) })}
                            style={{
                                flex: 1,
                                // Fill follows the value exactly, so 100% reaches the end.
                                background: `linear-gradient(to right, var(--accent-color) 0%, var(--accent-color) ${(clip.volume ?? 1) * 100}%, rgba(255,255,255,0.15) ${(clip.volume ?? 1) * 100}%, rgba(255,255,255,0.15) 100%)`,
                            }}
                        />
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)', width: '3ch', textAlign: 'right' }}>
                            {Math.round((clip.volume ?? 1) * 100)}
                        </span>
                    </div>
                </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                <label style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Transition Type</label>
                <select
                    value={clip.transitionType}
                    onChange={(e) => updateClip(clip.id, { transitionType: e.target.value as any })}
                >
                    <option value="cut">Cut</option>
                    <option value="dissolve">Dissolve</option>
                    <option value="delta-flow" disabled={isVideoClip}>
                        Delta Flow{isVideoClip ? ' — stills only' : ''}
                    </option>
                    <option value="glitch">Glitch</option>
                    <option value="breathing-morph" disabled={isVideoClip}>
                        Breathing Morph{isVideoClip ? ' — stills only' : ''}
                    </option>
                </select>
                {isVideoClip && (
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        Delta Flow and Breathing Morph need still images.
                    </span>
                )}
            </div>

            {(clip.transitionType === 'dissolve' || clip.transitionType === 'delta-flow' || clip.transitionType === 'glitch' || clip.transitionType === 'breathing-morph') && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', padding: '0.4rem', backgroundColor: 'var(--panel-bg)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--panel-border)' }}>
                    {!prevClip ? (
                        <label style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                            The transition applies when this clip is not first.
                        </label>
                    ) : overlapMs > 0 ? (
                        <label style={{ fontSize: '10px', color: 'var(--text-accent)' }}>
                            Overlap: {formatSecondsLabel(overlapMs)}
                        </label>
                    ) : (
                        <label style={{ fontSize: '10px', color: 'var(--text-danger)' }}>
                            No overlap with previous clip.
                        </label>
                    )}
                    {prevClip && overlapMs <= 0 && !packedVisual && (
                        <button
                            className="btn btn-secondary"
                            style={{ fontSize: '10px', padding: '2px 4px' }}
                            onClick={() => {
                                const newStart = Math.max(0, prevEnd - 500);
                                updateClip(clip.id, { startTimeMs: newStart });
                            }}
                        >
                            Auto Overlap (0.5 s)
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
                <div style={{ padding: '0.4rem', marginTop: '0.2rem', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--panel-border)', display: (clip.motionType && clip.motionType !== 'none') ? 'block' : 'none' }}>
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
                </div>
            </div>

            {clip.transitionType === 'delta-flow' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <label style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Delta Flow</label>
                    <div style={{ padding: '0.4rem', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--panel-border)' }}>
                        <RangeField
                            label="Sensitivity"
                            value={clip.deltaFlowSensitivity !== undefined ? clip.deltaFlowSensitivity : 0.55}
                            min={0.0}
                            max={1.0}
                            onChange={(v) => updateClip(clip.id, { deltaFlowSensitivity: v })}
                        />
                        <RangeField
                            label="Flow Strength"
                            value={clip.deltaFlowStrength !== undefined ? clip.deltaFlowStrength : 0.60}
                            min={0.0}
                            max={1.0}
                            onChange={(v) => updateClip(clip.id, { deltaFlowStrength: v })}
                        />
                        <RangeField
                            label="Noise Amount"
                            value={clip.deltaFlowNoiseAmount !== undefined ? clip.deltaFlowNoiseAmount : 0.30}
                            min={0.0}
                            max={1.0}
                            onChange={(v) => updateClip(clip.id, { deltaFlowNoiseAmount: v })}
                        />
                    </div>
                </div>
            )}

            {clip.transitionType === 'breathing-morph' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <label style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Breathing Morph</label>
                    <div style={{ padding: '0.4rem', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--panel-border)' }}>
                        <RangeField
                            label="Turbulence"
                            value={clip.breathingTurbulence !== undefined ? clip.breathingTurbulence : 0.5}
                            min={0.0}
                            max={1.0}
                            onChange={(v) => updateClip(clip.id, { breathingTurbulence: v })}
                        />
                        <RangeField
                            label="Swirl"
                            value={clip.breathingSwirl !== undefined ? clip.breathingSwirl : 0.5}
                            min={0.0}
                            max={1.0}
                            onChange={(v) => updateClip(clip.id, { breathingSwirl: v })}
                        />
                    </div>
                </div>
            )}

            {clip.transitionType === 'glitch' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <label style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Glitch</label>
                    <div style={{ padding: '0.4rem', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--panel-border)' }}>
                        <RangeField
                            label="Glitch Amount"
                            value={glitch.amount}
                            min={0.0}
                            max={1.0}
                            onChange={(v) => updateClip(clip.id, { ...glitchSeed, glitchAmount: v })}
                        />
                        <RangeField
                            label="Glitch Intensity"
                            value={glitch.intensity}
                            min={0.0}
                            max={1.0}
                            onChange={(v) => updateClip(clip.id, { ...glitchSeed, glitchIntensity: v })}
                        />
                        <RangeField
                            label="Glitch Displacement (Tear)"
                            value={glitch.displacement}
                            min={0.0}
                            max={1.0}
                            onChange={(v) => updateClip(clip.id, { ...glitchSeed, glitchDisplacement: v })}
                        />
                    </div>
                </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                <label style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Audio Reactive VJ Mode</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.4rem', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--panel-border)' }}>
                    <input 
                        type="checkbox" 
                        id="audioReactive"
                        checked={!!clip.audioReactive}
                        onChange={(e) => updateClip(clip.id, { audioReactive: e.target.checked })}
                    />
                    <label htmlFor="audioReactive" style={{ fontSize: '11px', color: 'var(--text-main)', cursor: 'pointer' }}>
                        Sync Zoom & Glitch to Audio Beats
                    </label>
                </div>
                {clip.audioReactive && <MusicReactionSlider clip={clip} />}
                {clip.audioReactive && audioWithoutEnvelope && (
                    <div role="status" style={{ fontSize: '11px', color: 'var(--text-muted)', padding: '0.4rem', border: '1px dashed var(--panel-border)', borderRadius: 'var(--radius-sm)' }}>
                        Re-import the audio to enable Music reaction.
                    </div>
                )}
            </div>

            <div style={{ marginTop: 'auto', paddingTop: '1rem', borderTop: '1px solid var(--panel-border)' }}>
                <button className="btn btn-danger" style={{ width: '100%' }} onClick={() => removeClip(clip.id)}>
                    Delete Clip
                </button>
            </div>
        </div>
    );
};
