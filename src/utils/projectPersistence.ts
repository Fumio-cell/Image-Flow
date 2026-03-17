import { useProjectStore } from '../store/useProjectStore';

export const saveProject = () => {
    const state = useProjectStore.getState().data;
    const exportData = {
        settings: state.settings,
        clips: state.clips,
        assets: state.assets.map(a => ({
            id: a.id,
            type: a.type,
            name: a.name,
            duration: a.duration,
            // exclude file and objectUrl
        }))
    };

    const json = JSON.stringify(exportData, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `project-${Date.now()}.json`;
    a.click();

    URL.revokeObjectURL(url);
};

export const loadProject = async (file: File) => {
    try {
        const text = await file.text();
        const data = JSON.parse(text);

        // Validate
        if (!data.settings || !data.clips || !data.assets) {
            throw new Error('Invalid project file');
        }

        useProjectStore.setState(s => ({
            data: {
                settings: data.settings,
                clips: data.clips,
                assets: data.assets // missing File and ObjectUrls (user needs to re-import or they remain black blanks)
            },
            history: { past: [], future: [] },
            ui: { ...s.ui, selectedClipId: null, playheadMs: 0 }
        }));

        alert('Project loaded. Please re-import missing assets to view them.');
    } catch (err) {
        alert('Failed to load project.');
        console.error(err);
    }
};
