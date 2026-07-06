// utils/deltaFlowFieldCache.ts

import { computeDeltaFlowField, computeWorkDims, type DeltaFlowField } from './deltaFlowRenderer';

interface CacheEntry {
    field: DeltaFlowField;
    sensitivity: number;
    workW: number;
    workH: number;
}

class DeltaFlowFieldCacheHandler {
    private cache: Map<string, CacheEntry> = new Map();

    getField(
        pairKey: string,
        imgA: HTMLImageElement | ImageBitmap,
        imgB: HTMLImageElement | ImageBitmap,
        sensitivity: number,
        workRes: number,
        dw: number,
        dh: number
    ): DeltaFlowField {
        // Compare against the *integer* working resolution derived from the
        // destination aspect ratio, not raw dw/dh — those change every frame
        // during Ken Burns zoom even though the aspect ratio (and therefore
        // the field itself) stays constant, which would otherwise defeat the cache.
        const { workW, workH } = computeWorkDims(dw, dh, workRes);
        const cached = this.cache.get(pairKey);
        if (cached && cached.sensitivity === sensitivity && cached.workW === workW && cached.workH === workH) {
            return cached.field;
        }

        const field = computeDeltaFlowField(imgA, imgB, sensitivity, workRes, dw, dh);
        this.cache.set(pairKey, { field, sensitivity, workW, workH });
        return field;
    }

    clear() {
        this.cache.clear();
    }
}

export const DeltaFlowFieldCache = new DeltaFlowFieldCacheHandler();
