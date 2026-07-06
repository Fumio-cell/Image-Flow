// utils/breathingMorphRenderer.ts
//
// Breathing Morph transition — a thin-plate-spline vortex warp with organic
// turbulence, adapted from a WebGL prototype for this app's Canvas2D
// pipeline. The prototype drove its warp with hand-picked facial/feature
// correspondence points between two specific photos; since clips here are
// arbitrary user images with no such correspondence available, the warp is
// instead driven by a synthetic ring of control points that spin around the
// frame center (plus a pinned boundary/center to keep edges anchored). This
// keeps the "living, breathing" swirl-and-settle quality without needing
// per-image feature detection.
//
// Like Delta Flow, the warp is evaluated per-pixel at a low working
// resolution (cheap enough for a JS loop) and the result is upscaled onto
// the destination rect via drawImage.

import { drawDownscaledImage } from './imageDownscaler';
import { computeWorkDims } from './deltaFlowRenderer';

export const BREATHING_MORPH_WORK_RES = 160;

export interface BreathingMorphParams {
    turbulence: number; // 0.0 to 1.0 organic noise wobble amount
    swirl: number;      // 0.0 to 1.0 vortex rotation amount
}

export interface BreathingMorphField {
    dataA: Uint8ClampedArray;
    dataB: Uint8ClampedArray;
    workW: number;
    workH: number;
}

function getWorkResData(img: HTMLImageElement | ImageBitmap, workW: number, workH: number): Uint8ClampedArray {
    const canvas = new OffscreenCanvas(workW, workH);
    const ctx = canvas.getContext('2d')!;
    drawDownscaledImage(ctx, img, 0, 0, workW, workH);
    return ctx.getImageData(0, 0, workW, workH).data;
}

/**
 * Downscales both source frames once per clip-pair (cached — see
 * breathingMorphFieldCache.ts). The warp itself is content-independent, so
 * unlike Delta Flow's field this doesn't need to inspect pixel content, but
 * the downscale is still the expensive part worth caching per frame.
 */
export function computeBreathingMorphField(
    imgA: HTMLImageElement | ImageBitmap,
    imgB: HTMLImageElement | ImageBitmap,
    maxRes: number,
    dw: number,
    dh: number
): BreathingMorphField {
    const { workW, workH } = computeWorkDims(dw, dh, maxRes);
    return {
        dataA: getWorkResData(imgA, workW, workH),
        dataB: getWorkResData(imgB, workW, workH),
        workW,
        workH
    };
}

// ---- synthetic control points (normalized 0..1, y measured downward) ----
// Pinned frame boundary — keeps the image edges from being dragged inward by
// the vortex. Pinned center — stabilizes the middle of the swirl.
const BOUND: [number, number][] = [];
for (const y of [0, 0.5, 1]) {
    for (const x of [0, 0.5, 1]) {
        if (!(x === 0.5 && y === 0.5)) BOUND.push([x, y]);
    }
}
const CENTER: [number, number] = [0.5, 0.5];
const RING_COUNT = 8;
const RING_RADIUS = 0.30;
const MAX_SWIRL_RAD = 55 * Math.PI / 180;

function buildSitePairs(swirl: number): { qa: [number, number][]; qb: [number, number][] } {
    const qa: [number, number][] = [...BOUND, CENTER];
    const qb: [number, number][] = [...BOUND, CENTER];
    const swirlAngle = swirl * MAX_SWIRL_RAD;
    for (let i = 0; i < RING_COUNT; i++) {
        const theta = (i / RING_COUNT) * Math.PI * 2;
        qa.push([0.5 + RING_RADIUS * Math.cos(theta), 0.5 + RING_RADIUS * Math.sin(theta)]);
        qb.push([0.5 + RING_RADIUS * Math.cos(theta + swirlAngle), 0.5 + RING_RADIUS * Math.sin(theta + swirlAngle)]);
    }
    return { qa, qb };
}

// ---- thin plate spline solve (classic kernel U(r) = r^2 log r) ----
function tpsSolve(n: number, sites: [number, number][], vals: [number, number][]): [number, number][] {
    const N = n + 3;
    const M: Float64Array[] = [];
    for (let i = 0; i < N; i++) M.push(new Float64Array(N + 2));

    for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
            const ddx = sites[i][0] - sites[j][0], ddy = sites[i][1] - sites[j][1];
            const r2 = ddx * ddx + ddy * ddy;
            M[i][j] = r2 > 1e-12 ? 0.5 * r2 * Math.log(r2) : 0;
        }
        M[i][i] += 1e-8;
        M[i][n] = 1; M[i][n + 1] = sites[i][0]; M[i][n + 2] = sites[i][1];
        M[n][i] = 1; M[n + 1][i] = sites[i][0]; M[n + 2][i] = sites[i][1];
        M[i][N] = vals[i][0]; M[i][N + 1] = vals[i][1];
    }

    for (let col = 0; col < N; col++) {
        let piv = col;
        for (let r = col + 1; r < N; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
        if (Math.abs(M[piv][col]) < 1e-12) continue;
        const tmp = M[col]; M[col] = M[piv]; M[piv] = tmp;
        for (let r = 0; r < N; r++) {
            if (r === col) continue;
            const f = M[r][col] / M[col][col];
            if (f === 0) continue;
            for (let c = col; c < N + 2; c++) M[r][c] -= f * M[col][c];
        }
    }

    const out: [number, number][] = [];
    for (let i = 0; i < N; i++) out.push([M[i][N] / M[i][i], M[i][N + 1] / M[i][i]]);
    return out;
}

function evalTps(n: number, sol: [number, number][], sites: [number, number][], x: number, y: number): [number, number] {
    let ox = sol[n][0] + sol[n + 1][0] * x + sol[n + 2][0] * y;
    let oy = sol[n][1] + sol[n + 1][1] * x + sol[n + 2][1] * y;
    for (let i = 0; i < n; i++) {
        const dx = x - sites[i][0], dy = y - sites[i][1];
        const r2 = dx * dx + dy * dy;
        const u = r2 > 1e-12 ? 0.5 * r2 * Math.log(r2) : 0;
        ox += sol[i][0] * u;
        oy += sol[i][1] * u;
    }
    return [ox, oy];
}

// ---- value noise / fbm for organic turbulence ----
function hash(x: number, y: number): number {
    const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
    return s - Math.floor(s);
}
function noise2(x: number, y: number): number {
    const ix = Math.floor(x), iy = Math.floor(y);
    const fx = x - ix, fy = y - iy;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const a = hash(ix, iy), b = hash(ix + 1, iy), c = hash(ix, iy + 1), d = hash(ix + 1, iy + 1);
    return (a * (1 - sx) + b * sx) * (1 - sy) + (c * (1 - sx) + d * sx) * sy;
}
function fbm(x: number, y: number): number {
    return noise2(x, y) * 0.6 + noise2(x * 2.1, y * 2.1) * 0.3 + noise2(x * 4.3, y * 4.3) * 0.1;
}

function ease(t: number): number { return t * t * (3 - 2 * t); }

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

const NOISE_FREQ = 2.5;
const TURB_BASE_AMOUNT = 0.055;

/**
 * Composites frames A and B onto ctx at transition progress t (0.0 to 1.0).
 * Both frames are warped through the same evolving vortex site
 * configuration (A's sites at t=0, B's at t=1) and cross-dissolved, then the
 * low-res result is upscaled onto the destination rect.
 */
export function renderBreathingMorphFrame(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    field: BreathingMorphField,
    t: number,
    params: BreathingMorphParams,
    dx: number, dy: number, dw: number, dh: number
): void {
    const { workW, workH, dataA, dataB } = field;
    const te = ease(Math.min(1, Math.max(0, t)));
    const bell = Math.sin(te * Math.PI);

    const { qa, qb } = buildSitePairs(params.swirl);
    const n = qa.length;
    const sites: [number, number][] = qa.map((p, i) => [
        p[0] + (qb[i][0] - p[0]) * te,
        p[1] + (qb[i][1] - p[1]) * te
    ]);
    const solA = tpsSolve(n, sites, qa);
    const solB = tpsSolve(n, sites, qb);

    const turbAmp = params.turbulence * TURB_BASE_AMOUNT * bell;
    const noisePhaseX = te * 3.1, noisePhaseY = te * -2.4;

    const outCanvas = new OffscreenCanvas(workW, workH);
    const outCtx = outCanvas.getContext('2d')!;
    const outImageData = outCtx.createImageData(workW, workH);
    const out = outImageData.data;

    for (let y = 0; y < workH; y++) {
        const v = y / (workH - 1);
        for (let x = 0; x < workW; x++) {
            const u = x / (workW - 1);

            let qx = u, qy = v;
            if (turbAmp > 0.0001) {
                const nx = fbm(u * NOISE_FREQ + noisePhaseX, v * NOISE_FREQ - noisePhaseY) - 0.5;
                const ny = fbm(u * NOISE_FREQ + 3.7 - noisePhaseX, v * NOISE_FREQ + 1.9 + noisePhaseY) - 0.5;
                qx += nx * turbAmp;
                qy += ny * turbAmp;
            }

            const [fax, fay] = evalTps(n, solA, sites, qx, qy);
            const [fbx, fby] = evalTps(n, solB, sites, qx, qy);

            const cA = sampleBilinearRGB(dataA, workW, workH, fax * (workW - 1), fay * (workH - 1));
            const cB = sampleBilinearRGB(dataB, workW, workH, fbx * (workW - 1), fby * (workH - 1));

            const idx = (y * workW + x) * 4;
            out[idx] = cA[0] * (1 - te) + cB[0] * te;
            out[idx + 1] = cA[1] * (1 - te) + cB[1] * te;
            out[idx + 2] = cA[2] * (1 - te) + cB[2] * te;
            out[idx + 3] = 255;
        }
    }
    outCtx.putImageData(outImageData, 0, 0);

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(outCanvas, dx, dy, dw, dh);
}
