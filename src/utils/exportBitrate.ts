import type { ExportQuality, Resolution } from '../types';

/**
 * Video bitrate of the export (bits per second): the ONE place the numbers live.
 * Standard is what the export has always used; High is double.
 */
const BITRATE: Record<ExportQuality, { square: number; uhd: number; other: number }> = {
    standard: { uhd: 60_000_000, square: 40_000_000, other: 30_000_000 },
    high: { uhd: 120_000_000, square: 80_000_000, other: 60_000_000 },
};

export function videoBitrate(resolution: Resolution, quality: ExportQuality | undefined): number {
    const t = BITRATE[quality ?? 'standard'];
    return resolution === '3840x2160' ? t.uhd : resolution === '1920x1920' ? t.square : t.other;
}
