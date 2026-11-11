import React from 'react';
import { TopBar } from './TopBar';
import { Header } from './Header';
import { AssetPane } from '../assets/AssetPane';
import { SettingsPane } from '../settings/SettingsPane';
import { PreviewContainer } from '../preview/PreviewContainer';
import { TimelineContainer } from '../timeline/TimelineContainer';
import { NoticeHost } from '../common/NoticeHost';

export const AppLayout: React.FC = () => {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%' }}>
            <Header />
            <TopBar />
            <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
                {/* Left Pane */}
                <aside aria-label="Assets" style={{ width: '300px', borderRight: '1px solid var(--panel-border)', backgroundColor: 'var(--panel-bg)', display: 'flex', flexDirection: 'column' }}>
                    <AssetPane />
                </aside>

                {/* Center Area */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    <main aria-label="Preview" style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
                        <PreviewContainer />
                    </main>
                    <section aria-label="Timeline" style={{ height: '350px', borderTop: '4px solid var(--panel-border)', backgroundColor: 'var(--panel-bg)', overflow: 'hidden' }}>
                        <TimelineContainer />
                    </section>
                </div>

                {/* Right Pane */}
                <aside aria-label="Project settings" style={{ width: '300px', borderLeft: '1px solid var(--panel-border)', backgroundColor: 'var(--panel-bg)', display: 'flex', flexDirection: 'column' }}>
                    <SettingsPane />
                </aside>
            </div>
            <NoticeHost />
        </div>
    );
};
