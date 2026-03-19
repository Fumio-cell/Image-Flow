import React from 'react';
import { useProjectStore } from '../../store/useProjectStore';

export const AudioTrack: React.FC = () => {
    const assets = useProjectStore(s => s.data.assets);
    const zoomScale = useProjectStore(s => s.ui.zoomScale);

    // Find the first audio asset for MVP
    const audioAsset = assets.find(a => a.type === 'audio');

    if (!audioAsset || !audioAsset.duration) {
        return (
            <div style={{ height: '60px', borderBottom: '1px solid var(--panel-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-inactive)', fontSize: '12px', backgroundColor: 'var(--track-bg)' }}>
                No Audio Track
            </div>
        );
    }

    const width = audioAsset.duration * zoomScale;
    const height = 60; // Fixed height for audio track
    const peaks = audioAsset.peaks || [];
    const numPeaks = peaks.length;
    const peakWidth = numPeaks > 0 ? (width / numPeaks) : 1;


    return (
        <div style={{ height: '80px', borderBottom: '1px solid var(--panel-border)', position: 'relative', overflow: 'hidden', backgroundColor: 'rgba(0,0,0,0.2)', width: `${width}px` }}>
            <svg
                style={{ position: 'absolute', top: 0, left: 0, display: 'block' }}
                width={width}
                height={80}
                viewBox={`0 0 ${width} ${height}`}
                preserveAspectRatio="none"
            >
                {peaks.map((p, i) => {
                    const peakHeight = p * height;
                    const x = i * peakWidth;
                    const y = (height - peakHeight) / 2;
                    return (
                        <rect
                            key={i}
                            x={x}
                            y={y}
                            width={Math.max(1, peakWidth - 0.5)}
                            height={peakHeight}
                            fill="rgba(71, 85, 105, 0.8)"
                        />
                    );
                })}
            </svg>
            <div style={{ position: 'absolute', top: '4px', left: '8px', fontSize: '10px', color: 'var(--text-muted)' }}>
                {audioAsset.name}
            </div>
        </div>
    );
};
