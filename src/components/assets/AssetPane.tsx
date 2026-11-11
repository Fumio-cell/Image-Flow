import React, { useRef } from 'react';
import { Film, Music, Plus, Trash2 } from 'lucide-react';
import { useProjectStore } from '../../store/useProjectStore';
import { getAudioData, createAudioPreviewUrl } from '../../utils/audioUtils';
import { getVideoData } from '../../utils/videoUtils';
import { readImageSize } from '../../utils/imageSize';
import type { AssetItem } from '../../types';
import { TrySampleButton, SampleCredit } from './SampleControls';

export const AssetPane: React.FC = () => {
    const assets = useProjectStore((s) => s.data.assets);
    const clips = useProjectStore((s) => s.data.clips);
    const addAssets = useProjectStore((s) => s.addAssets);
    const removeAsset = useProjectStore((s) => s.removeAsset);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        if (!files.length) return;

        const newAssets: AssetItem[] = [];
        const skipped: string[] = [];
        const storeAssets = useProjectStore.getState().data.assets;
        const updateAsset = useProjectStore.getState().updateAsset;

        console.log('[AssetPane] Importing', files.length, 'file(s):', files.map(f => `${f.name} (${f.type || 'no MIME'}, ${(f.size/1048576).toFixed(1)}MB)`));

        for (const file of files) {
            const lowerName = file.name.toLowerCase();
            const IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'];
            const isImage = file.type.startsWith('image/') || IMAGE_EXTS.some(ext => lowerName.endsWith(ext));
            // Check video before audio: '.m4v' otherwise gets mistaken for '.m4a'.
            const isVideo = file.type.startsWith('video/') || lowerName.endsWith('.mp4') || lowerName.endsWith('.mov') || lowerName.endsWith('.webm') || lowerName.endsWith('.m4v');
            // Accept anything the browser might decode. Whether it actually can
            // is decided at decode time, where a failure is reported clearly.
            const AUDIO_EXTS = ['.wav', '.mp3', '.m4a', '.aac', '.aif', '.aiff', '.aifc', '.flac', '.ogg', '.oga', '.opus', '.weba', '.caf', '.wma', '.mp4a'];
            const isAudio = !isVideo && (
                file.type.startsWith('audio/') ||
                AUDIO_EXTS.some(ext => lowerName.endsWith(ext))
            );

            if (!isImage && !isAudio && !isVideo) {
                console.warn('[AssetPane] Unsupported file skipped:', file.name, file.type);
                skipped.push(file.name);
                continue;
            }

            console.log(`[AssetPane] ${file.name} → ${isImage ? 'image' : isVideo ? 'video' : 'audio'}`);

            let objectUrl: string;
            if (isAudio) {
                try {
                    objectUrl = await createAudioPreviewUrl(file);
                } catch (err) {
                    console.error("Failed to parse audio", err);
                    alert(`Failed to decode audio file (${err instanceof Error ? err.message : String(err)})`);
                    continue;
                }
            } else {
                objectUrl = URL.createObjectURL(file);
            }

            // プロジェクト保存・読み込み時に file/objectUrl が欠落している同名アセットを探す
            const missingAsset = storeAssets.find(a => a.name === file.name && !a.file);

            if (missingAsset) {
                // プロジェクトに存在するが実体ファイルがない場合、同じIDを使って上書きし再リンクする
                if (isAudio) {
                    try {
                        const { duration, peaks, envelope } = await getAudioData(file);
                        updateAsset(missingAsset.id, { file, objectUrl, duration, peaks, envelope });
                    } catch (err) {
                        URL.revokeObjectURL(objectUrl);
                        console.error("Failed to parse audio", err);
                        alert(`Failed to decode audio file (${err instanceof Error ? err.message : String(err)})`);
                    }
                } else if (isVideo) {
                    try {
                        const { duration, width, height, posterUrl, hasAudio, peaks } = await getVideoData(file);
                        updateAsset(missingAsset.id, { file, objectUrl, duration, width, height, posterUrl, hasAudio, peaks });
                    } catch (err) {
                        console.error("Failed to parse video", err);
                        // Container is fine but the codec may not be — ProRes and
                        // some HEVC .mov files simply can't be decoded in a browser.
                        alert(
                            `Could not read video: ${file.name}\n\n` +
                            `Your browser can't decode this file's video codec ` +
                            `(common with ProRes or HEVC .mov). ` +
                            `Converting it to H.264 MP4 should work.`
                        );
                    }
                } else {
                    updateAsset(missingAsset.id, { file, objectUrl });
                }
            } else {
                // 完全な新規追加
                const id = crypto.randomUUID();
                if (isImage) {
                    const size = await readImageSize(file);
                    newAssets.push({ id, type: 'image', file, objectUrl, name: file.name, width: size?.width, height: size?.height });
                } else if (isAudio) {
                    try {
                        const { duration, peaks, envelope } = await getAudioData(file);
                        console.log(`[AssetPane] ${file.name} decoded: ${(duration/1000).toFixed(1)}s`);
                        newAssets.push({ id, type: 'audio', file, objectUrl, name: file.name, duration, peaks, envelope });
                    } catch (err) {
                        URL.revokeObjectURL(objectUrl);
                        console.error("Failed to parse audio", err);
                        alert(`Failed to decode audio file (${err instanceof Error ? err.message : String(err)})`);
                    }
                } else if (isVideo) {
                    try {
                        const { duration, width, height, posterUrl, hasAudio, peaks } = await getVideoData(file);
                        newAssets.push({ id, type: 'video', file, objectUrl, name: file.name, duration, width, height, posterUrl, hasAudio, peaks });
                    } catch (err) {
                        console.error("Failed to parse video", err);
                        // Container is fine but the codec may not be — ProRes and
                        // some HEVC .mov files simply can't be decoded in a browser.
                        alert(
                            `Could not read video: ${file.name}\n\n` +
                            `Your browser can't decode this file's video codec ` +
                            `(common with ProRes or HEVC .mov). ` +
                            `Converting it to H.264 MP4 should work.`
                        );
                    }
                }
            }
        }

        console.log('[AssetPane] Adding', newAssets.length, 'new asset(s); skipped', skipped.length);
        if (newAssets.length > 0) {
            addAssets(newAssets);
        }

        if (skipped.length > 0) {
            alert(`Unsupported file type:\n${skipped.join('\n')}`);
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
                    accept="image/*,video/*,audio/*,.jpg,.jpeg,.png,.gif,.webp,.bmp,.mp4,.mov,.webm,.m4v,.wav,.mp3,.m4a,.aac,.aif,.aiff,.aifc,audio/aiff,audio/x-aiff,.flac,.ogg,.oga,.opus,.weba,.caf,.wma"
                    onChange={handleFileChange}
                />
            </div>

            <div style={{ flex: 1, overflowY: 'auto' }}>
                {assets.length === 0 ? (
                    <div style={{ textAlign: 'center', marginTop: '2rem', color: 'var(--text-muted)' }}>
                        <p style={{ fontSize: '12px' }}>No assets imported.</p>
                        <p style={{ fontSize: '12px' }}>Drag & drop files or click +</p>
                        <p style={{ fontSize: '12px', margin: '1.25rem 0 0.5rem' }}>or start from an example:</p>
                        <TrySampleButton prominent />
                    </div>
                ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                        {assets.map(asset => {
                            const usageCount = clips.filter(c => c.assetId === asset.id).length;
                            return (
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
                                    ) : asset.type === 'video' ? (
                                        <div style={{ position: 'relative', width: '100%', height: '80px' }}>
                                            {asset.posterUrl ? (
                                                <img src={asset.posterUrl} alt={asset.name} style={{ width: '100%', height: '80px', objectFit: 'cover' }} draggable={false} />
                                            ) : (
                                                <div style={{ width: '100%', height: '80px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                    <Film size={24} color="var(--text-muted)" />
                                                </div>
                                            )}
                                            <div style={{
                                                position: 'absolute', top: 2, left: 2,
                                                width: 18, height: 18,
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                backgroundColor: 'rgba(0,0,0,0.65)', borderRadius: '4px'
                                            }}>
                                                <Film size={11} color="white" />
                                            </div>
                                        </div>
                                    ) : (
                                        <div style={{ width: '100%', height: '80px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            <Music size={24} color="var(--text-muted)" />
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
                                            backgroundColor: 'rgba(0,0,0,0.65)',
                                            border: 'none', borderRadius: '50%',
                                            cursor: 'pointer', color: 'white', padding: 0
                                        }}
                                    >
                                        <Trash2 size={11} />
                                    </button>
                                    <div style={{
                                        position: 'absolute', bottom: 0, left: 0, right: 0,
                                        backgroundColor: 'rgba(0,0,0,0.6)', padding: '2px 4px', fontSize: '10px',
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
                <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem', paddingTop: '0.75rem' }}>
                    <TrySampleButton />
                    <SampleCredit />
                </div>
            )}
        </div>
    );
};
