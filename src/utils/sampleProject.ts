import type { AssetItem, Clip, ProjectData, TransitionType } from '../types';
import { useProjectStore } from '../store/useProjectStore';
import { packClips } from './packClips';
import { getAudioData, createAudioPreviewUrl } from './audioUtils';

/** Shown wherever the sample is in use and in the About modal. Exact wording: do not edit. */
export const SAMPLE_CREDIT = 'Sample images by Miho Morita. Sample track: "Frequency Dreams" by Bomb Sun.';

const IMAGE_FILES = ['sample-1.webp', 'sample-2.webp', 'sample-3.webp', 'sample-4.webp', 'sample-5.webp'];
const TRACK_FILE = 'sample-track.m4a';

const CLIP_MS = 2500;
const OVERLAP_MS = 1000;
/** Transition of junction 1..4 (between clip n and clip n+1). */
const JUNCTIONS: readonly TransitionType[] = ['delta-flow', 'breathing-morph', 'delta-flow', 'delta-flow'];

/** Ids of the assets this module added. The credit shows while any of them is in the project. */
const sampleAssetIds = new Set<string>();
export const isSampleAsset = (id: string): boolean => sampleAssetIds.has(id);

async function fetchBlob(name: string): Promise<Blob> {
    const res = await fetch(`${import.meta.env.BASE_URL}sample/${name}`);
    if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
    return res.blob();
}

/** A clip with the app's own defaults for a newly dropped clip (same fields as the timeline drop). */
const baseClip = (assetId: string, durationMs: number): Clip => ({
    id: crypto.randomUUID(),
    assetId,
    startTimeMs: 0,
    durationMs,
    sourceInMs: 0,
    volume: 1,
    muted: false,
    transitionType: 'cut',
    transitionDurationMs: 0,
    fitMode: 'fit',
    motionType: 'none',
    motionIntensity: 0.1,
    motionSpeed: 0.5,
});

/**
 * Fetch the sample files and replace the project with it, in ONE undo step.
 * Nothing is requested until this is called. The audio goes through the same helpers as a user's file
 * (getAudioData builds the Music reaction envelope), via a File made from the fetched blob.
 */
export async function loadSample(): Promise<void> {
    const [images, track] = await Promise.all([
        Promise.all(IMAGE_FILES.map(fetchBlob)),
        fetchBlob(TRACK_FILE),
    ]);

    const assets: AssetItem[] = images.map((blob, i) => {
        const file = new File([blob], IMAGE_FILES[i], { type: 'image/webp' });
        return { id: crypto.randomUUID(), type: 'image', file, objectUrl: URL.createObjectURL(file), name: file.name, width: 1920, height: 1920 };
    });

    const audioFile = new File([track], TRACK_FILE, { type: 'audio/mp4' });
    const audioUrl = await createAudioPreviewUrl(audioFile);
    const { duration, peaks, envelope } = await getAudioData(audioFile);
    const audioAsset: AssetItem = {
        id: crypto.randomUUID(), type: 'audio', file: audioFile, objectUrl: audioUrl, name: audioFile.name, duration, peaks, envelope,
    };
    assets.push(audioAsset);

    // Visual clips: the first gets the transition a first clip gets in the app (it has no junction); clip n+1 overlaps clip n.
    const visual: Clip[] = assets.slice(0, IMAGE_FILES.length).map((a, i) => ({
        ...baseClip(a.id, CLIP_MS),
        transitionType: i === 0 ? 'delta-flow' : JUNCTIONS[i - 1],
        transitionDurationMs: i === 0 ? 0 : OVERLAP_MS,
        audioReactive: true,
        musicReaction: 0.5,
    }));
    const audioClip = baseClip(audioAsset.id, Math.round(duration));

    // Start times come from the app's own packing rule (start = previous end - overlap).
    const clips = packClips([...visual, audioClip], assets);

    const data: ProjectData = {
        settings: { resolution: '1920x1920', fps: 30, autoPack: true },
        assets,
        clips,
    };
    assets.forEach(a => sampleAssetIds.add(a.id));
    useProjectStore.getState().replaceProject(data);
}
