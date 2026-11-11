/** Pixel size of an image file, or null when the browser cannot decode it. */
export async function readImageSize(file: Blob): Promise<{ width: number; height: number } | null> {
    try {
        const bmp = await createImageBitmap(file);
        const size = { width: bmp.width, height: bmp.height };
        bmp.close();
        return size;
    } catch {
        return null;
    }
}
