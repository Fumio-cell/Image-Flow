import React, { useRef } from 'react';
import { Music, Plus } from 'lucide-react';
import { useProjectStore } from '../../store/useProjectStore';
import { getAudioData } from '../../utils/audioUtils';
import type { AssetItem } from '../../types';

export const AssetPane: React.FC = () => {
    const assets = useProjectStore((s) => s.data.assets);
    const addAssets = useProjectStore((s) => s.addAssets);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        if (!files.length) return;

        const newAssets: AssetItem[] = [];
        const storeAssets = useProjectStore.getState().data.assets;
        const updateAsset = useProjectStore.getState().updateAsset;

        for (const file of files) {
            const isImage = file.type.startsWith('image/');
            const isAudio = file.type.startsWith('audio/') || file.name.endsWith('.wav') || file.name.endsWith('.mp3') || file.name.endsWith('.m4a');

            if (!isImage && !isAudio) continue;

            const objectUrl = URL.createObjectURL(file);

            // プロジェクト保存・読み込み時に file/objectUrl が欠落している同名アセットを探す
            const missingAsset = storeAssets.find(a => a.name === file.name && !a.file);

            if (missingAsset) {
                // プロジェクトに存在するが実体ファイルがない場合、同じIDを使って上書きし再リンクする
                if (isAudio) {
                    try {
                        const { duration, peaks } = await getAudioData(file);
                        updateAsset(missingAsset.id, { file, objectUrl, duration, peaks });
                    } catch (err) {
                        console.error("Failed to parse audio", err);
                        alert(`Failed to parse audio: ${file.name}`);
                    }
                } else {
                    updateAsset(missingAsset.id, { file, objectUrl });
                }
            } else {
                // 完全な新規追加
                const id = crypto.randomUUID();
                if (isImage) {
                    newAssets.push({ id, type: 'image', file, objectUrl, name: file.name });
                } else if (isAudio) {
                    try {
                        const { duration, peaks } = await getAudioData(file);
                        newAssets.push({ id, type: 'audio', file, objectUrl, name: file.name, duration, peaks });
                    } catch (err) {
                        console.error("Failed to parse audio", err);
                        alert(`Failed to parse audio: ${file.name}`);
                    }
                }
            }
        }

        if (newAssets.length > 0) {
            addAssets(newAssets);
        }

        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    return (
        <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h3 style={{ fontSize: '14px', margin: 0 }}>Assets</h3>
                <button className="btn btn-icon" onClick={() => fileInputRef.current?.click()}>
                    <Plus size={16} />
                </button>
                <input
                    type="file"
                    ref={fileInputRef}
                    style={{ display: 'none' }}
                    multiple
                    accept=".jpg,.jpeg,.png,.wav,.mp3,.m4a"
                    onChange={handleFileChange}
                />
            </div>

            <div style={{ flex: 1, overflowY: 'auto' }}>
                {assets.length === 0 ? (
                    <div style={{ textAlign: 'center', marginTop: '2rem', color: 'var(--text-muted)' }}>
                        <p style={{ fontSize: '12px' }}>No assets imported.</p>
                        <p style={{ fontSize: '12px' }}>Drag & drop files or click +</p>
                    </div>
                ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                        {assets.map(asset => (
                            <div key={asset.id} style={{
                                border: '1px solid var(--panel-border)',
                                borderRadius: 'var(--radius-sm)',
                                overflow: 'hidden',
                                backgroundColor: 'var(--bg-color)',
                                position: 'relative',
                                cursor: 'grab'
                            }}
                                draggable
                                onDragStart={(e) => {
                                    e.dataTransfer.setData('text/plain', asset.id);
                                }}>
                                {asset.type === 'image' ? (
                                    <img src={asset.objectUrl} alt={asset.name} style={{ width: '100%', height: '80px', objectFit: 'cover' }} draggable={false} />
                                ) : (
                                    <div style={{ width: '100%', height: '80px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <Music size={24} color="var(--text-muted)" />
                                    </div>
                                )}
                                <div style={{
                                    position: 'absolute', bottom: 0, left: 0, right: 0,
                                    backgroundColor: 'rgba(0,0,0,0.6)', padding: '2px 4px', fontSize: '10px',
                                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
                                }}>
                                    {asset.name}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};
