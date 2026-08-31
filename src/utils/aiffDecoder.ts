// utils/aiffDecoder.ts

/**
 * Minimal AIFF / AIFC reader.
 *
 * Browsers don't decode AIFF at all — neither decodeAudioData nor <audio> —
 * but it's a plain chunked container around uncompressed PCM, so we can read
 * it ourselves rather than making people convert every file. Covers what DAWs
 * actually export: 8/16/24/32-bit integer PCM (big-endian, or little-endian
 * 'sowt') and 32-bit float ('fl32').
 */

const MAGIC = { FORM: 0x464f524d, AIFF: 0x41494646, AIFC: 0x41494643 };

export const isAiff = (buffer: ArrayBuffer): boolean => {
    if (buffer.byteLength < 12) return false;
    const v = new DataView(buffer);
    if (v.getUint32(0) !== MAGIC.FORM) return false;
    const form = v.getUint32(8);
    return form === MAGIC.AIFF || form === MAGIC.AIFC;
};

/** AIFF stores the sample rate as an 80-bit IEEE extended float. */
const readExtendedFloat = (v: DataView, offset: number): number => {
    const expon = ((v.getUint8(offset) & 0x7f) << 8) | v.getUint8(offset + 1);
    const hi = v.getUint32(offset + 2);
    const lo = v.getUint32(offset + 6);
    if (expon === 0 && hi === 0 && lo === 0) return 0;
    const value = hi * Math.pow(2, expon - 16383 - 31) + lo * Math.pow(2, expon - 16383 - 63);
    return (v.getUint8(offset) & 0x80) ? -value : value;
};

const fourCC = (v: DataView, offset: number): string =>
    String.fromCharCode(v.getUint8(offset), v.getUint8(offset + 1), v.getUint8(offset + 2), v.getUint8(offset + 3));

export interface DecodedAiff {
    channelData: Float32Array[];
    sampleRate: number;
    length: number;
}

export const decodeAiff = (buffer: ArrayBuffer): DecodedAiff => {
    const v = new DataView(buffer);
    if (!isAiff(buffer)) throw new Error('Not an AIFF file');

    let numChannels = 0;
    let numSampleFrames = 0;
    let bitDepth = 0;
    let sampleRate = 0;
    let compression = 'NONE';
    let ssndOffset = -1;

    // Walk the chunk list. Chunks are padded to even lengths.
    let pos = 12;
    while (pos + 8 <= buffer.byteLength) {
        const id = fourCC(v, pos);
        const size = v.getUint32(pos + 4);
        const body = pos + 8;

        if (id === 'COMM') {
            numChannels = v.getUint16(body);
            numSampleFrames = v.getUint32(body + 2);
            bitDepth = v.getUint16(body + 6);
            sampleRate = readExtendedFloat(v, body + 8);
            if (size >= 22) compression = fourCC(v, body + 18);
        } else if (id === 'SSND') {
            // offset/blockSize occupy the first 8 bytes of the chunk body.
            ssndOffset = body + 8 + v.getUint32(body);
        }

        pos = body + size + (size % 2);
    }

    if (!numChannels || !sampleRate || ssndOffset < 0) {
        throw new Error('AIFF is missing COMM or SSND data');
    }

    const isFloat = compression === 'fl32' || compression === 'FL32';
    // 'sowt' is byte-swapped (little-endian) PCM, common from Mac tools.
    const littleEndian = compression === 'sowt';

    const bytesPerSample = isFloat ? 4 : bitDepth / 8;
    if (!isFloat && ![1, 2, 3, 4].includes(bytesPerSample)) {
        throw new Error(`Unsupported AIFF bit depth: ${bitDepth}`);
    }
    if (compression !== 'NONE' && compression !== 'sowt' && !isFloat) {
        throw new Error(`Unsupported AIFF compression: ${compression}`);
    }

    const channelData: Float32Array[] = [];
    for (let c = 0; c < numChannels; c++) channelData.push(new Float32Array(numSampleFrames));

    const frameBytes = bytesPerSample * numChannels;
    const available = Math.floor((buffer.byteLength - ssndOffset) / frameBytes);
    const frames = Math.min(numSampleFrames, Math.max(0, available));

    for (let i = 0; i < frames; i++) {
        const base = ssndOffset + i * frameBytes;
        for (let c = 0; c < numChannels; c++) {
            const o = base + c * bytesPerSample;
            let sample: number;
            if (isFloat) {
                sample = v.getFloat32(o, littleEndian);
            } else if (bytesPerSample === 1) {
                sample = v.getInt8(o) / 128;
            } else if (bytesPerSample === 2) {
                sample = v.getInt16(o, littleEndian) / 32768;
            } else if (bytesPerSample === 3) {
                // No getInt24 — assemble it and sign-extend by hand.
                const b0 = v.getUint8(o), b1 = v.getUint8(o + 1), b2 = v.getUint8(o + 2);
                let n = littleEndian ? (b2 << 16) | (b1 << 8) | b0 : (b0 << 16) | (b1 << 8) | b2;
                if (n & 0x800000) n -= 0x1000000;
                sample = n / 8388608;
            } else {
                sample = v.getInt32(o, littleEndian) / 2147483648;
            }
            channelData[c][i] = sample;
        }
    }

    return { channelData, sampleRate, length: frames };
};

/** Decode an AIFF straight into an AudioBuffer the rest of the app can use. */
export const decodeAiffToAudioBuffer = (buffer: ArrayBuffer, ctx: BaseAudioContext): AudioBuffer => {
    const { channelData, sampleRate, length } = decodeAiff(buffer);
    const out = ctx.createBuffer(channelData.length, Math.max(1, length), sampleRate);
    for (let c = 0; c < channelData.length; c++) out.getChannelData(c).set(channelData[c]);
    return out;
};

/**
 * Wrap decoded PCM in a WAV container.
 *
 * Browsers can't play AIFF in <audio>/<video>, so previewing one means handing
 * the element an equivalent WAV built in memory. Export still reads the
 * original file.
 */
export const encodeWav = (channelData: Float32Array[], sampleRate: number): Blob => {
    const channels = channelData.length;
    const frames = channelData[0]?.length ?? 0;
    const bytes = frames * channels * 2; // 16-bit
    const buffer = new ArrayBuffer(44 + bytes);
    const v = new DataView(buffer);

    const ascii = (offset: number, text: string) => {
        for (let i = 0; i < text.length; i++) v.setUint8(offset + i, text.charCodeAt(i));
    };

    ascii(0, 'RIFF');
    v.setUint32(4, 36 + bytes, true);
    ascii(8, 'WAVE');
    ascii(12, 'fmt ');
    v.setUint32(16, 16, true);      // PCM header size
    v.setUint16(20, 1, true);       // format: PCM
    v.setUint16(22, channels, true);
    v.setUint32(24, sampleRate, true);
    v.setUint32(28, sampleRate * channels * 2, true); // byte rate
    v.setUint16(32, channels * 2, true);              // block align
    v.setUint16(34, 16, true);                        // bits per sample
    ascii(36, 'data');
    v.setUint32(40, bytes, true);

    let o = 44;
    for (let i = 0; i < frames; i++) {
        for (let c = 0; c < channels; c++) {
            const clamped = Math.max(-1, Math.min(1, channelData[c][i]));
            v.setInt16(o, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
            o += 2;
        }
    }
    return new Blob([buffer], { type: 'audio/wav' });
};
