import React, { useRef, useState } from 'react';
import { TrySampleButton } from '../assets/SampleControls';
import { TrustStatement } from '../common/TrustStatement';
import { ASSET_ACCEPT, importFiles } from '../../utils/importFiles';
import { loadProject } from '../../utils/projectPersistence';
import { AboutDialog } from './AboutDialog';

// Three of the shipped sample images (public/sample/). They are requested when this screen is shown, not before.
const SLIDES = ['sample-1.webp', 'sample-3.webp', 'sample-5.webp'];

/**
 * The opening screen: what an empty project shows (nothing else). It is replaced by the editor as soon as the
 * project has an asset, by either button or by a drop.
 */
export const OpeningScreen: React.FC = () => {
    const inputRef = useRef<HTMLInputElement>(null);
    const projectInputRef = useRef<HTMLInputElement>(null);
    const aboutRef = useRef<HTMLButtonElement>(null);
    const [aboutOpen, setAboutOpen] = useState(false);
    const base = import.meta.env.BASE_URL;

    const onChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        if (!files.length) return;
        await importFiles(files);
        if (inputRef.current) inputRef.current.value = '';
    };

    // The same open path as the editor's Open button: loadProject(file) on a saved .json.
    const onProject = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) await loadProject(file);
        if (projectInputRef.current) projectInputRef.current.value = '';
    };

    return (
        <main className="opening" aria-label="Image Flow">
            <section className="opening-text">
                <h1 className="opening-wordmark">Image Flow</h1>
                <p className="t-note opening-line">Images and music in, one video out. The transitions react to the music.</p>
                <div className="opening-actions-block">
                    <div className="opening-actions">
                        <TrySampleButton prominent />
                        <button type="button" className="btn btn-secondary" onClick={() => inputRef.current?.click()}>Open your images</button>
                        <input type="file" ref={inputRef} style={{ display: 'none' }} multiple accept={ASSET_ACCEPT} onChange={onChange} />
                    </div>
                    <button type="button" className="btn-text t-control" onClick={() => projectInputRef.current?.click()}>Open a project</button>
                    <input type="file" ref={projectInputRef} style={{ display: 'none' }} accept=".json" onChange={onProject} />
                </div>
                <TrustStatement />
                <button ref={aboutRef} type="button" className="btn-text t-label opening-about" onClick={() => setAboutOpen(true)}>About</button>
            </section>
            <section className="opening-stage">
                {SLIDES.map((file, i) => (
                    <img key={file} className="opening-slide" style={{ '--i': i } as React.CSSProperties} src={`${base}sample/${file}`} alt="" decoding="async" draggable={false} />
                ))}
            </section>
            <AboutDialog open={aboutOpen} onClose={() => setAboutOpen(false)} returnFocusRef={aboutRef} />
        </main>
    );
};
