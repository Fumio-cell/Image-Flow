// utils/breathingMorphFieldCache.ts

import { computeBreathingMorphField, type BreathingMorphField } from './breathingMorphRenderer';
import { computeWorkDims } from './deltaFlowRenderer';

interface CacheEntry {
    field: BreathingMorphField;
    workW: number;
    workH: number;
}

class BreathingMorphFieldCacheHandler {
    private cache: Map<string, CacheEntry> = new Map();

    getField(
        pairKey: string,
        imgA: HTMLImageElement | ImageBitmap,
        imgB: HTMLImageElement | ImageBitmap,
        workRes: number,
        dw: number,
        dh: number
    ): BreathingMorphField {
        // Same rationale as DeltaFlowFieldCache: compare against the integer
        // working resolution derived from the destination aspect ratio, not
        // raw dw/dh, since those change every frame during Ken Burns zoom.
        const { workW, workH } = computeWorkDims(dw, dh, workRes);
        const cached = this.cache.get(pairKey);
        if (cached && cached.workW === workW && cached.workH === workH) {
            return cached.field;
        }

        const field = computeBreathingMorphField(imgA, imgB, workRes, dw, dh);
        this.cache.set(pairKey, { field, workW, workH });
        return field;
    }

    clear() {
        this.cache.clear();
    }
}

export const BreathingMorphFieldCache = new BreathingMorphFieldCacheHandler();
