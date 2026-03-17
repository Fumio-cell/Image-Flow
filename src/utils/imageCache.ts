import type { AssetItem } from '../types';

class ImageCacheHandler {
    private cache: Map<string, HTMLImageElement> = new Map();

    getImage(asset: AssetItem): HTMLImageElement | Promise<HTMLImageElement | null> | null {
        if (asset.type !== 'image') return null;

        if (this.cache.has(asset.id)) {
            return this.cache.get(asset.id)!;
        }

        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                this.cache.set(asset.id, img);
                resolve(img);
            };
            img.onerror = () => {
                resolve(null);
            };
            img.src = asset.objectUrl;
        });
    }

    clear() {
        this.cache.clear();
    }
}

export const ImageCache = new ImageCacheHandler();
