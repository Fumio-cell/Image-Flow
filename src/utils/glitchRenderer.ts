/**
 * Utility for drawing glitch effects on a canvas.
 */

interface GlitchParams {
    amount: number;      // 0.0 to 1.0 (frequency/density)
    intensity: number;   // 0.0 to 1.0 (shift magnitude)
    displacement?: number; // 0.0 to 1.0 (horizontal tearing)
    seed: number;        // deterministic seed (e.g., playheadMs)
}

/**
 * Applies glitch effects to an already drawn image on a canvas.
 * This should be called AFTER the main image is drawn.
 */
export function applyGlitch(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    dx: number, dy: number, dw: number, dh: number,
    params: GlitchParams
) {
    const { amount, intensity, seed } = params;
    if (amount <= 0 || intensity <= 0) return;

    // Simple deterministic PRNG
    const random = (s: number) => {
        const x = Math.sin(s) * 10000;
        return x - Math.floor(x);
    };

    const glitchSeed = Math.floor(seed);
    const r = random(glitchSeed);

    const displacementParams = params.displacement || 0;
    
    // 0. Horizontal Displacement (Tear) Map Effect
    if (displacementParams > 0 && r < amount) {
        // Massive number of thin strips covering the canvas
        const tearCount = Math.floor(random(glitchSeed + 50) * 100 * displacementParams) + 10;
        for (let i = 0; i < tearCount; i++) {
            const hRatio = random(glitchSeed + i * 3 + 51) * 0.03 * displacementParams + 0.005; // Thin slices
            const yRatio = random(glitchSeed + i * 3 + 52) * (1.0 - hRatio);
            
            const sh = dh * hRatio;
            const sy = dy + dh * yRatio;
            
            const shiftX = (random(glitchSeed + i * 3 + 53) - 0.5) * dw * 0.8 * displacementParams;
            
            ctx.drawImage(ctx.canvas, dx, sy, dw, sh, dx + shiftX, sy, dw, sh);
        }
    }

    // 1. Horizontal Strip Shifts
    const numStrips = Math.floor(2 + random(glitchSeed + 1) * 15 * amount);
    for (let i = 0; i < numStrips; i++) {
        if (random(glitchSeed + i + 2) < amount) {
            const hRatio = random(glitchSeed + i + 3) * 0.15 * intensity;
            const yRatio = random(glitchSeed + i + 4) * (1 - hRatio);
            const sh = dh * hRatio;
            const sy = dy + dh * yRatio;
            const shiftX = (random(glitchSeed + i + 5) - 0.5) * 100 * intensity;
            ctx.drawImage(ctx.canvas, dx, sy, dw, sh, dx + shiftX, sy, dw, sh);
        }
    }

    // 2. Vertical Smear (Pixel Sort style) - Enabled at higher intensity
    if (intensity > 0.2) {
        const smearAmount = amount * (intensity - 0.2) * 1.5;
        const numSmears = Math.floor(random(glitchSeed + 20) * 12 * smearAmount);
        for (let i = 0; i < numSmears; i++) {
            const xRatio = random(glitchSeed + i + 21);
            const wRatio = random(glitchSeed + i + 22) * 0.05 * intensity + 0.005;
            const yRatio = random(glitchSeed + i + 23);
            const hRatio = random(glitchSeed + i + 24) * 0.6 * intensity;
            
            const sx = dx + dw * xRatio;
            const sy = dy + dh * yRatio;
            const sw = dw * wRatio;
            const sh = dh * hRatio;
            
            // Stretch a 1px line vertically
            ctx.drawImage(ctx.canvas, sx, sy, sw, 1, sx, sy, sw, sh);
        }
    }

    // 3. Block Noise (Macroblock corruption)
    if (intensity > 0.4 && r < amount) {
        const numBlocks = Math.floor(random(glitchSeed + 30) * 8 * intensity);
        for (let i = 0; i < numBlocks; i++) {
            const size = Math.floor(random(glitchSeed + i + 31) * 100 * intensity) + 16;
            const sx = dx + random(glitchSeed + i + 32) * (dw - size);
            const sy = dy + random(glitchSeed + i + 33) * (dh - size);
            const tx = dx + random(glitchSeed + i + 34) * (dw - size);
            const ty = dy + random(glitchSeed + i + 35) * (dh - size);
            ctx.drawImage(ctx.canvas, sx, sy, size, size, tx, ty, size, size);
        }
    }

    // 4. RGB Split (Chromatic Aberration)
    if (r < amount * 0.7) {
        const splitX = (random(glitchSeed + 10) - 0.5) * 20 * intensity;
        const splitY = (random(glitchSeed + 11) - 0.5) * 10 * intensity;
        ctx.save();
        ctx.globalAlpha = 0.5 * intensity;
        ctx.globalCompositeOperation = 'screen';
        ctx.drawImage(ctx.canvas, dx, dy, dw, dh, dx + splitX, dy + splitY, dw, dh);
        ctx.drawImage(ctx.canvas, dx, dy, dw, dh, dx - splitX, dy - splitY, dw, dh);
        ctx.restore();
    }

    // 5. Final Digital Punch (Scanlines or Contrast)
    if (intensity > 0.6 && r < amount * 0.4) {
        ctx.save();
        ctx.globalCompositeOperation = 'overlay';
        ctx.fillStyle = random(glitchSeed + 40) > 0.5 ? 'white' : 'black';
        ctx.globalAlpha = 0.15 * intensity;
        ctx.fillRect(dx, dy, dw, dh);
        ctx.restore();
    }
}
