import React from 'react';
import { TopBar } from './TopBar';
import Header from './Header';
import { AssetPane } from '../assets/AssetPane';
import { SettingsPane } from '../settings/SettingsPane';
import { PreviewContainer } from '../preview/PreviewContainer';
import { TimelineContainer } from '../timeline/TimelineContainer';

export const AppLayout: React.FC = () => {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%' }}>
            <Header />
            <TopBar />
            <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
                {/* Left Pane */}
                <div style={{ width: '300px', borderRight: '1px solid var(--panel-border)', backgroundColor: 'var(--panel-bg)', display: 'flex', flexDirection: 'column' }}>
                    <AssetPane />
                </div>

                {/* Center Area */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    {/* Top Center: Preview */}
                    <div style={{ flex: 1, borderBottom: '1px solid var(--panel-border)', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <PreviewContainer />
                    </div>

                    {/* Bottom Center: Timeline */}
                    <div style={{ height: '350px', backgroundColor: 'var(--timeline-bg)', display: 'flex', flexDirection: 'column' }}>
                        <TimelineContainer />
                    </div>
                </div>

                {/* Right Pane */}
                <div style={{ width: '300px', borderLeft: '1px solid var(--panel-border)', backgroundColor: 'var(--panel-bg)', display: 'flex', flexDirection: 'column' }}>
                    <SettingsPane />
                </div>
            </div>
        </div>
    );
};
