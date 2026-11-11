import type { AssetItem, ProjectData, Resolution } from '../types';
import { isVisualClip } from './packClips';

export interface ResolutionEntry {
    value: Resolution;
    /** The text of the Settings option. */
    label: string;
    width: number;
    height: number;
}

/** The resolutions the Settings pane offers (the list itself is unchanged by the automatic choice). */
export const RESOLUTIONS: readonly ResolutionEntry[] = [
    { value: '1280x720', label: 'HD (1280x720)', width: 1280, height: 720 },
    { value: '1920x1080', label: 'Full HD (1920x1080)', width: 1920, height: 1080 },
    { value: '1920x1920', label: 'Square (1920x1920)', width: 1920, height: 1920 },
    { value: '3840x2160', label: '4K UHD (3840x2160)', width: 3840, height: 2160 },
];

export const DEFAULT_RESOLUTION: Resolution = '1920x1080';

export const resolutionEntry = (value: Resolution): ResolutionEntry =>
    RESOLUTIONS.find(r => r.value === value) ?? RESOLUTIONS[1];

/** "Square", "4K UHD": the label without the pixel size. */
export const resolutionName = (value: Resolution): string => resolutionEntry(value).label.replace(/\s*\(.*\)$/, '');

/**
 * Which resolution of the list fits an asset of this pixel size.
 * Rule: take the shape (aspect ratio) in the list closest to the asset's, ties going to the wider one, then within that
 * shape the largest entry whose height does not exceed the asset's height (the smallest entry if the asset is shorter than all of them).
 * Portrait assets are closest to the square entry, so they get Square. Invalid sizes give the default.
 */
export function pickResolution(width: number, height: number): Resolution {
    if (!(width > 0) || !(height > 0) || !isFinite(width) || !isFinite(height)) return DEFAULT_RESOLUTION;
    const aspect = width / height;
    const distance = (e: ResolutionEntry) => Math.abs(Math.log(aspect / (e.width / e.height)));
    const EPS = 1e-9;
    let best = RESOLUTIONS[0];
    for (const e of RESOLUTIONS) {
        const d = distance(e), db = distance(best);
        if (d < db - EPS || (Math.abs(d - db) <= EPS && e.width / e.height > best.width / best.height)) best = e;
    }
    const sameShape = RESOLUTIONS.filter(e => Math.abs(Math.log((e.width / e.height) / (best.width / best.height))) < 1e-6);
    const fitting = sameShape.filter(e => e.height <= height);
    const pool = fitting.length > 0 ? fitting : sameShape;
    return (fitting.length > 0
        ? pool.reduce((a, b) => (b.height > a.height ? b : a))
        : pool.reduce((a, b) => (b.height < a.height ? b : a))).value;
}

type AssetLike = Pick<AssetItem, 'id' | 'type' | 'width' | 'height'>;

/** The first visual asset of a project (image or video), in asset order. */
export const firstVisualAsset = <T extends Pick<AssetItem, 'type'>>(assets: readonly T[]): T | undefined =>
    assets.find(a => a.type !== 'audio');

/**
 * True when the picture is drawn larger than its source: the first visual asset, fitted into the project resolution
 * (the app's default "fit": scale = min(width ratio, height ratio)), would be scaled up. A 1920x1080 image in Square is
 * drawn 1:1, so no; the same image in 4K is drawn 2x, so yes. Unknown asset size: no.
 */
export function resolutionEnlarges(resolution: Resolution, assets: readonly AssetLike[]): boolean {
    const first = firstVisualAsset(assets);
    if (!first?.width || !first.height) return false;
    const r = resolutionEntry(resolution);
    return Math.min(r.width / first.width, r.height / first.height) > 1 + 1e-9;
}

/**
 * The automatic choice when assets are added: only for the FIRST visual asset of a project that has no visual asset or
 * clip yet, only once (nothing chose a resolution before, automatically or by hand), and only when the asset's size is known.
 */
export function autoResolutionFor(
    data: Pick<ProjectData, 'settings' | 'assets' | 'clips'>,
    added: readonly AssetLike[]
): { resolution: Resolution; kind: 'image' | 'video' } | null {
    if (data.settings.resolutionSource !== undefined) return null;
    if (data.assets.some(a => a.type !== 'audio') || data.clips.some(c => isVisualClip(c, data.assets))) return null;
    const first = firstVisualAsset(added);
    if (!first?.width || !first.height) return null;
    return { resolution: pickResolution(first.width, first.height), kind: first.type === 'video' ? 'video' : 'image' };
}
