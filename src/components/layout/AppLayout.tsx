import React from 'react';
import { TopBar } from './TopBar';
import { Header } from './Header';
import { AssetPane } from '../assets/AssetPane';
import { SettingsPane } from '../settings/SettingsPane';
import { PreviewContainer } from '../preview/PreviewContainer';
import { TimelineContainer } from '../timeline/TimelineContainer';
import { NoticeHost } from '../common/NoticeHost';
import { OpeningScreen } from './OpeningScreen';
import { useProjectStore } from '../../store/useProjectStore';

export const AppLayout: React.FC = () => {
    // The opening screen IS the empty state: it shows while the project has no asset and gives way to the editor
    // the moment one arrives (a button, a drop, undo, deleting the last asset).
    const hasAssets = useProjectStore((s) => s.data.assets.length > 0);
    if (!hasAssets) {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%' }}>
                <OpeningScreen />
                <NoticeHost />
            </div>
        );
    }
    return (
        <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%' }}>
            <Header />
            <TopBar />
            <div style={{ display: 'flex', flex: 1, overflow: 'hidden', borderTop: 'var(--rule-hair) solid var(--line)' }}>
                {/* Left Pane */}
                <aside aria-label="Assets" style={{ width: '300px', borderRight: 'var(--rule-hair) solid var(--line)', backgroundColor: 'var(--ink)', display: 'flex', flexDirection: 'column' }}>
                    <AssetPane />
                </aside>

                {/* Center Area */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    <main aria-label="Preview" style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
                        <PreviewContainer />
                    </main>
                    <section aria-label="Timeline" style={{ height: '350px', borderTop: 'var(--rule-hair) solid var(--line)', backgroundColor: 'var(--ink)', overflow: 'hidden' }}>
                        <TimelineContainer />
                    </section>
                </div>

                {/* Right Pane */}
                <aside aria-label="Project settings" style={{ width: '300px', borderLeft: 'var(--rule-hair) solid var(--line)', backgroundColor: 'var(--ink)', display: 'flex', flexDirection: 'column' }}>
                    <SettingsPane />
                </aside>
            </div>
            <NoticeHost />
        </div>
    );
};
