// utils/deltaFlowRenderer.ts
//
// Delta Flow transition — ported from the approved prototype. Both frames are
// warped along a vector field derived from their luminance difference and
// composited pixel-by-pixel (not tiled), matching the prototype's look.

import { drawDownscaledImage } from './imageDownscaler';

export const DELTA_FLOW_WORK_RES = 200;

export interface DeltaFlowParams {
    sensitivity: number;   // 0.0 to 1.0
    strength: number;      // 0.0 to 1.0
    noiseAmount: number;   // 0.0 to 1.0
}

export interface DeltaFlowField {
    vecX: Float32Array;
    vecY: Float32Array;
    dataA: Uint8ClampedArray;
    dataB: Uint8ClampedArray;
    workW: number;
    workH: number;
}

// Keeps the internal working canvas at the same aspect ratio as the actual
// destination rect. Forcing a square canvas here would make warp
// displacement (computed isotropically in canvas-pixel space) get stretched
// unevenly in x vs y once scaled back to a non-square dw/dh, which shows up
// as a visible horizontal/vertical stretch right as the transition starts.
export function computeWorkDims(dw: number, dh: number, maxRes: number) {
    if (!isFinite(dw) || !isFinite(dh) || dw <= 0 || dh <= 0) {
        return { workW: maxRes, workH: maxRes };
    }
    if (dw >= dh) {
        return { workW: maxRes, workH: Math.max(1, Math.round(maxRes * dh / dw)) };
    }
    return { workH: maxRes, workW: Math.max(1, Math.round(maxRes * dw / dh)) };
}

function getWorkResData(img: HTMLImageElement | ImageBitmap, workW: number, workH: number): Uint8ClampedArray {
    const canvas = new OffscreenCanvas(workW, workH);
    const ctx = canvas.getContext('2d')!;
    drawDownscaledImage(ctx, img, 0, 0, workW, workH);
    return ctx.getImageData(0, 0, workW, workH).data;
}

/**
 * Builds the vector field for a Delta Flow transition between two frames.
 * dw/dh should be the destination rect the transition will render into, so
 * the internal working resolution matches its aspect ratio.
 * Should be computed once per transition (on clip load / sensitivity change),
 * not once per animation frame.
 */
export function computeDeltaFlowField(
    imgA: HTMLImageElement | ImageBitmap,
    imgB: HTMLImageElement | ImageBitmap,
    sensitivity: number,
    maxRes: number,
    dw: number,
    dh: number
): DeltaFlowField {
    const { workW, workH } = computeWorkDims(dw, dh, maxRes);
    const dataA = getWorkResData(imgA, workW, workH);
    const dataB = getWorkResData(imgB, workW, workH);

    // Raw difference map (0..1) from full RGB distance — not luminance alone.
    // Two photos can have very similar brightness structure while differing
    // heavily in color/hue; a luminance-only diff would see almost no
    // difference there and produce a nearly invisible warp. Then
    // contrast-stretch to this pair's own range — without that, two images
    // that differ everywhere saturate near 1.0 across the whole map and
    // sensitivity can no longer pull it back.
    const diff = new Float32Array(workW * workH);
    let dMin = Infinity, dMax = -Infinity;
    for (let i = 0; i < diff.length; i++) {
        const o = i * 4;
        const dr = dataA[o] - dataB[o];
        const dg = dataA[o + 1] - dataB[o + 1];
        const db = dataA[o + 2] - dataB[o + 2];
        const d = Math.sqrt(dr * dr + dg * dg + db * db) / (255 * Math.sqrt(3));
        diff[i] = d;
        if (d < dMin) dMin = d;
        if (d > dMax) dMax = d;
    }
    const range = Math.max(1e-4, dMax - dMin);
    for (let i = 0; i < diff.length; i++) {
        diff[i] = (diff[i] - dMin) / range;
    }

    const at = (x: number, y: number) => {
        const cx = Math.min(workW - 1, Math.max(0, x));
        const cy = Math.min(workH - 1, Math.max(0, y));
        return diff[cy * workW + cx];
    };

    // Low sensitivity = only the most-different regions move; high sensitivity
    // = even mildly-different regions move substantially.
    const exponent = 2.4 - sensitivity * 2.05;

    const vecX = new Float32Array(workW * workH);
    const vecY = new Float32Array(workW * workH);
    for (let y = 0; y < workH; y++) {
        for (let x = 0; x < workW; x++) {
            const gx = at(x + 1, y) - at(x - 1, y);
            const gy = at(x, y + 1) - at(x, y - 1);
            const mag = Math.hypot(gx, gy);
            let dirX = 0, dirY = 0;
            if (mag > 1e-5) { dirX = gx / mag; dirY = gy / mag; }
            const idx = y * workW + x;
            const weight = Math.pow(diff[idx], exponent);
            vecX[idx] = dirX * weight;
            vecY[idx] = dirY * weight;
        }
    }

    return { vecX, vecY, dataA, dataB, workW, workH };
}

// Static, smooth value-noise field for organic wobble. Uses a fixed seed
// (matching the prototype) so it doesn't flicker per frame — its visibility
// is instead modulated by sin(t*PI) inside renderDeltaFlowFrame.
let cachedNoiseField: Float32Array | null = null;
let cachedNoiseW = 0;
let cachedNoiseH = 0;

function buildValueNoiseField(width: number, height: number, seed: number): Float32Array {
    const gridSize = 12;
    const gw = Math.ceil(width / gridSize) + 2;
    const gh = Math.ceil(height / gridSize) + 2;
    let s = seed;
    const rnd = () => {
        s = (s * 1103515245 + 12345) & 0x7fffffff;
        return (s / 0x7fffffff) * 2 - 1;
    };
    const gx = new Float32Array(gw * gh);
    const gy = new Float32Array(gw * gh);
    for (let i = 0; i < gw * gh; i++) { gx[i] = rnd(); gy[i] = rnd(); }

    const smooth = (t: number) => t * t * (3 - 2 * t);
    const idx = (x: number, y: number) => y * gw + x;

    const out = new Float32Array(width * height * 2);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const fx = x / gridSize, fy = y / gridSize;
            const x0 = Math.floor(fx), y0 = Math.floor(fy);
            const tx = fx - x0, ty = fy - y0;
            const sx = smooth(tx), sy = smooth(ty);

            const g00x = gx[idx(x0, y0)], g10x = gx[idx(x0 + 1, y0)];
            const g01x = gx[idx(x0, y0 + 1)], g11x = gx[idx(x0 + 1, y0 + 1)];
            const g00y = gy[idx(x0, y0)], g10y = gy[idx(x0 + 1, y0)];
            const g01y = gy[idx(x0, y0 + 1)], g11y = gy[idx(x0 + 1, y0 + 1)];

            const nx = (g00x * (1 - sx) + g10x * sx) * (1 - sy) + (g01x * (1 - sx) + g11x * sx) * sy;
            const ny = (g00y * (1 - sx) + g10y * sx) * (1 - sy) + (g01y * (1 - sx) + g11y * sx) * sy;

            const o = (y * width + x) * 2;
            out[o] = nx;
            out[o + 1] = ny;
        }
    }
    return out;
}

function getNoiseField(width: number, height: number): Float32Array {
    if (!cachedNoiseField || cachedNoiseW !== width || cachedNoiseH !== height) {
        cachedNoiseField = buildValueNoiseField(width, height, 42);
        cachedNoiseW = width;
        cachedNoiseH = height;
    }
    return cachedNoiseField;
}

function easeInOut(t: number): number {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

function sampleBilinearRGB(data: Uint8ClampedArray, workW: number, workH: number, x: number, y: number): [number, number, number] {
    x = Math.max(0, Math.min(workW - 1.001, x));
    y = Math.max(0, Math.min(workH - 1.001, y));
    const x0 = Math.floor(x), y0 = Math.floor(y), x1 = x0 + 1, y1 = y0 + 1;
    const tx = x - x0, ty = y - y0;

    const out: [number, number, number] = [0, 0, 0];
    for (let c = 0; c < 3; c++) {
        const p00 = data[(y0 * workW + x0) * 4 + c];
        const p10 = data[(y0 * workW + x1) * 4 + c];
        const p01 = data[(y1 * workW + x0) * 4 + c];
        const p11 = data[(y1 * workW + x1) * 4 + c];
        out[c] = (p00 * (1 - tx) + p10 * tx) * (1 - ty) + (p01 * (1 - tx) + p11 * tx) * ty;
    }
    return out;
}

/**
 * Composites frames A and B onto ctx at transition progress t (0.0 to 1.0),
 * following the Delta Flow vector field. Both frames are warped (A forward,
 * B backward) and cross-dissolved per pixel, then the low-res result is
 * upscaled onto the destination rect — mirroring the prototype exactly.
 */
export function renderDeltaFlowFrame(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    field: DeltaFlowField,
    t: number,
    params: DeltaFlowParams,
    dx: number, dy: number, dw: number, dh: number
): void {
    const { workW, workH } = field;
    const noiseField = getNoiseField(workW, workH);

    const te = easeInOut(Math.min(1, Math.max(0, t)));
    const maxSide = Math.max(workW, workH);
    const strengthPx = params.strength * maxSide * 0.23;
    const noisePx = params.noiseAmount * maxSide * 0.11;
    const wobble = Math.sin(te * Math.PI);

    const outCanvas = new OffscreenCanvas(workW, workH);
    const outCtx = outCanvas.getContext('2d')!;
    const outImageData = outCtx.createImageData(workW, workH);
    const out = outImageData.data;

    for (let y = 0; y < workH; y++) {
        for (let x = 0; x < workW; x++) {
            const idx = y * workW + x;
            const fx = field.vecX[idx], fy = field.vecY[idx];
            const ni = idx * 2;
            const nx = noiseField[ni], ny = noiseField[ni + 1];

            const ddx = fx * strengthPx + nx * noisePx * wobble;
            const ddy = fy * strengthPx + ny * noisePx * wobble;

            const ax = x - ddx * te, ay = y - ddy * te;
            const bx = x + ddx * (1 - te), by = y + ddy * (1 - te);
            const cA = sampleBilinearRGB(field.dataA, workW, workH, ax, ay);
            const cB = sampleBilinearRGB(field.dataB, workW, workH, bx, by);

            const o = idx * 4;
            out[o] = cA[0] * (1 - te) + cB[0] * te;
            out[o + 1] = cA[1] * (1 - te) + cB[1] * te;
            out[o + 2] = cA[2] * (1 - te) + cB[2] * te;
            out[o + 3] = 255;
        }
    }
    outCtx.putImageData(outImageData, 0, 0);

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(outCanvas, dx, dy, dw, dh);
}
