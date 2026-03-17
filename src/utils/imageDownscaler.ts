// utils/imageDownscaler.ts

/**
 * Perform multi-pass downscaling of an image to prevent moiré patterns
 * when scaling down from very large resolutions to much smaller ones.
 * Native canvas imageSmoothingEnabled = true doesn't always prevent moiré
 * if the size difference is drastic (e.g. 4000px to 500px).
 * 
 * This strategy halves the resolution repeatedly until it's close to the target.
 */
export function drawDownscaledImage(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    img: HTMLImageElement | ImageBitmap,
    dx: number,
    dy: number,
    dw: number,
    dh: number
) {
    const minScaleRatio = 0.5; // Halve the resolution each step
    const targetW = dw;
    const targetH = dh;

    let curW = img.width;
    let curH = img.height;

    // If the image is not significantly larger than the target, draw it directly
    if (curW <= targetW * 2 || curH <= targetH * 2) {
        ctx.drawImage(img, dx, dy, dw, dh);
        return;
    }

    let currentCanvas = new OffscreenCanvas(curW, curH);
    let currentCtx = currentCanvas.getContext('2d')!;
    currentCtx.imageSmoothingEnabled = true;
    currentCtx.imageSmoothingQuality = 'high';
    currentCtx.drawImage(img, 0, 0, curW, curH);

    // Step down by half each time
    while (curW > targetW * 2 && curH > targetH * 2) {
        const nextW = Math.max(targetW, curW * minScaleRatio);
        const nextH = Math.max(targetH, curH * minScaleRatio);

        const nextCanvas = new OffscreenCanvas(nextW, nextH);
        const nextCtx = nextCanvas.getContext('2d')!;
        nextCtx.imageSmoothingEnabled = true;
        nextCtx.imageSmoothingQuality = 'high';

        nextCtx.drawImage(currentCanvas, 0, 0, curW, curH, 0, 0, nextW, nextH);

        currentCanvas = nextCanvas;
        currentCtx = nextCtx;
        curW = nextW;
        curH = nextH;
    }

    // Finally, draw the stepped-down canvas to the actual target context
    ctx.drawImage(currentCanvas, 0, 0, curW, curH, dx, dy, dw, dh);
}
