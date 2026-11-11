import React from 'react';
import { PreviewCanvas } from './PreviewCanvas';

export const PreviewContainer: React.FC = () => {
    return (
        <div style={{
            width: '100%',
            height: '100%',
            backgroundColor: 'var(--ink-stage)',
            padding: 'var(--space-2)',
            boxSizing: 'border-box',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative'
        }}>
            <PreviewCanvas />
        </div>
    );
};
