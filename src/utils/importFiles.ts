import { useProjectStore } from '../store/useProjectStore';
import { getAudioData, createAudioPreviewUrl } from './audioUtils';
import { getVideoData } from './videoUtils';
import { readImageSize } from './imageSize';
import { notify } from './notify';
import type { AssetItem } from '../types';

/** The accept list of every "add files" input in the app. */
export const ASSET_ACCEPT = "image/*,video/*,audio/*,.jpg,.jpeg,.png,.gif,.webp,.bmp,.mp4,.mov,.webm,.m4v,.wav,.mp3,.m4a,.aac,.aif,.aiff,.aifc,audio/aiff,audio/x-aiff,.flac,.ogg,.oga,.opus,.weba,.caf,.wma";

/**
 * Import files the user picked (the Assets pane's + button and the opening screen's "Open your images" share this):
 * images, audio and video become assets; an asset of the same name that lost its file is relinked.
 */
export async function importFiles(files: File[]): Promise<void> {
    if (!files.length) return;

    const newAssets: AssetItem[] = [];
    const skipped: string[] = [];
    const storeAssets = useProjectStore.getState().data.assets;
    const updateAsset = useProjectStore.getState().updateAsset;

    console.log('[importFiles] Importing', files.length, 'file(s):', files.map(f => `${f.name} (${f.type || 'no MIME'}, ${(f.size/1048576).toFixed(1)}MB)`));

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
            console.warn('[importFiles] Unsupported file skipped:', file.name, file.type);
            skipped.push(file.name);
            continue;
        }

        console.log(`[importFiles] ${file.name} → ${isImage ? 'image' : isVideo ? 'video' : 'audio'}`);

        let objectUrl: string;
        if (isAudio) {
            try {
                objectUrl = await createAudioPreviewUrl(file);
            } catch (err) {
                console.error("Failed to parse audio", err);
                notify(`Failed to decode audio file (${err instanceof Error ? err.message : String(err)})`);
                continue;
            }
        } else {
            objectUrl = URL.createObjectURL(file);
        }

        // Look for an asset of the same name that lost its file/objectUrl when a project was saved and loaded
        const missingAsset = storeAssets.find(a => a.name === file.name && !a.file);

        if (missingAsset) {
            // The project has this asset but not its file: relink it under the same id
            if (isAudio) {
                try {
                    const { duration, peaks, envelope } = await getAudioData(file);
                    updateAsset(missingAsset.id, { file, objectUrl, duration, peaks, envelope });
                } catch (err) {
                    URL.revokeObjectURL(objectUrl);
                    console.error("Failed to parse audio", err);
                    notify(`Failed to decode audio file (${err instanceof Error ? err.message : String(err)})`);
                }
            } else if (isVideo) {
                try {
                    const { duration, width, height, posterUrl, hasAudio, peaks } = await getVideoData(file);
                    updateAsset(missingAsset.id, { file, objectUrl, duration, width, height, posterUrl, hasAudio, peaks });
                } catch (err) {
                    console.error("Failed to parse video", err);
                    // Container is fine but the codec may not be — ProRes and
                    // some HEVC .mov files simply can't be decoded in a browser.
                    notify(
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
            // A brand-new asset
            const id = crypto.randomUUID();
            if (isImage) {
                const size = await readImageSize(file);
                newAssets.push({ id, type: 'image', file, objectUrl, name: file.name, width: size?.width, height: size?.height });
            } else if (isAudio) {
                try {
                    const { duration, peaks, envelope } = await getAudioData(file);
                    console.log(`[importFiles] ${file.name} decoded: ${(duration/1000).toFixed(1)}s`);
                    newAssets.push({ id, type: 'audio', file, objectUrl, name: file.name, duration, peaks, envelope });
                } catch (err) {
                    URL.revokeObjectURL(objectUrl);
                    console.error("Failed to parse audio", err);
                    notify(`Failed to decode audio file (${err instanceof Error ? err.message : String(err)})`);
                }
            } else if (isVideo) {
                try {
                    const { duration, width, height, posterUrl, hasAudio, peaks } = await getVideoData(file);
                    newAssets.push({ id, type: 'video', file, objectUrl, name: file.name, duration, width, height, posterUrl, hasAudio, peaks });
                } catch (err) {
                    console.error("Failed to parse video", err);
                    // Container is fine but the codec may not be — ProRes and
                    // some HEVC .mov files simply can't be decoded in a browser.
                    notify(
                        `Could not read video: ${file.name}\n\n` +
                        `Your browser can't decode this file's video codec ` +
                        `(common with ProRes or HEVC .mov). ` +
                        `Converting it to H.264 MP4 should work.`
                    );
                }
            }
        }
    }

    console.log('[importFiles] Adding', newAssets.length, 'new asset(s); skipped', skipped.length);
    if (newAssets.length > 0) {
        useProjectStore.getState().addAssets(newAssets);
    }

    if (skipped.length > 0) {
        notify(`Unsupported file type:\n${skipped.join('\n')}`);
    }
}
