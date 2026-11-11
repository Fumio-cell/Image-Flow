import React, { useRef } from 'react';
import { Film, Music, Plus, Trash2 } from 'lucide-react';
import { useProjectStore } from '../../store/useProjectStore';
import { importFiles, ASSET_ACCEPT } from '../../utils/importFiles';
import { TrySampleButton, SampleCredit } from './SampleControls';

export const AssetPane: React.FC = () => {
    const assets = useProjectStore((s) => s.data.assets);
    const clips = useProjectStore((s) => s.data.clips);
    const removeAsset = useProjectStore((s) => s.removeAsset);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        if (!files.length) return;
        await importFiles(files);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    return (
        <div style={{ padding: 'var(--space-4)', display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
                <h2 style={{ margin: 0 }}>Assets</h2>
                <button className="btn btn-icon" onClick={() => fileInputRef.current?.click()} aria-label="Add files" title="Add files">
                    <Plus size={16} />
                </button>
                <input
                    type="file"
                    ref={fileInputRef}
                    style={{ display: 'none' }}
                    multiple
                    accept={ASSET_ACCEPT}
                    onChange={handleFileChange}
                />
            </div>

            <div style={{ flex: 1, overflowY: 'auto' }}>
                {assets.length === 0 ? (
                    <div style={{ textAlign: 'center', marginTop: 'var(--space-5)' }}>
                        <p>No assets imported.</p>
                        <p>Drag & drop files or click +</p>
                        <p style={{ margin: 'var(--space-4) 0 var(--space-2)' }}>or start from an example:</p>
                        <TrySampleButton prominent />
                    </div>
                ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-2)' }}>
                        {assets.map(asset => {
                            const usageCount = clips.filter(c => c.assetId === asset.id).length;
                            return (
                                <div key={asset.id} style={{
                                    border: 'var(--rule-hair) solid var(--line)',
                                    borderRadius: 'var(--radius-none)',
                                    overflow: 'hidden',
                                    backgroundColor: 'var(--ink-panel)',
                                    position: 'relative',
                                    cursor: 'grab'
                                }}
                                    draggable
                                    onDragStart={(e) => {
                                        e.dataTransfer.setData('text/plain', asset.id);
                                    }}>
                                    {asset.type === 'image' ? (
                                        <img src={asset.objectUrl} alt={asset.name} style={{ width: '100%', height: '80px', objectFit: 'cover', borderRadius: 'var(--radius-thumb)' }} draggable={false} />
                                    ) : asset.type === 'video' ? (
                                        <div style={{ position: 'relative', width: '100%', height: '80px' }}>
                                            {asset.posterUrl ? (
                                                <img src={asset.posterUrl} alt={asset.name} style={{ width: '100%', height: '80px', objectFit: 'cover', borderRadius: 'var(--radius-thumb)' }} draggable={false} />
                                            ) : (
                                                <div style={{ width: '100%', height: '80px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                    <Film size={24} color="var(--paper-dim)" />
                                                </div>
                                            )}
                                            <div style={{
                                                position: 'absolute', top: 2, left: 2,
                                                width: 18, height: 18,
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                backgroundColor: 'var(--ink)', borderRadius: 'var(--radius-none)'
                                            }}>
                                                <Film size={11} color="var(--paper)" />
                                            </div>
                                        </div>
                                    ) : (
                                        <div style={{ width: '100%', height: '80px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            <Music size={24} color="var(--paper-dim)" />
                                        </div>
                                    )}
                                    <button
                                        className="btn btn-icon"
                                        title={usageCount > 0 ? `Delete (also removes ${usageCount} clip${usageCount > 1 ? 's' : ''} using it)` : 'Delete'}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            removeAsset(asset.id);
                                        }}
                                        style={{
                                            position: 'absolute', top: 2, right: 2,
                                            width: 20, height: 20,
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            backgroundColor: 'var(--ink)',
                                            border: 'none', borderRadius: 'var(--radius-none)',
                                            cursor: 'pointer', color: 'var(--paper)', padding: 0
                                        }}
                                    >
                                        <Trash2 size={11} />
                                    </button>
                                    <div className="t-label" style={{
                                        position: 'absolute', bottom: 0, left: 0, right: 0,
                                        backgroundColor: 'var(--ink)', color: 'var(--paper)', padding: 'var(--space-1)',
                                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
                                    }}>
                                        {asset.name}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {assets.length > 0 && (
                <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', paddingTop: 'var(--space-3)' }}>
                    <TrySampleButton />
                    <SampleCredit />
                </div>
            )}
        </div>
    );
};
