/**
 * Minimal AIFF / AIFC reader.
 *
 * Browsers don't decode AIFF (neither decodeAudioData nor <audio>), but it is a
 * plain chunked container around uncompressed PCM, so we read it ourselves.
 * Covers what DAWs export: 8/16/24/32-bit integer PCM (big-endian, or
 * little-endian 'sowt') and 32/64-bit float ('fl32' / 'fl64').
 */

const MAGIC = { FORM: 0x464f524d, AIFF: 0x41494646, AIFC: 0x41494643 };

export interface DecodedAiff {
    channelData: Float32Array[];
    sampleRate: number;
    length: number;
}

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
    if (expon === 0x7fff) throw new Error('Invalid AIFF sample rate (Inf/NaN)');
    const hi = v.getUint32(offset + 2);
    const lo = v.getUint32(offset + 6);
    if (expon === 0 && hi === 0 && lo === 0) return 0;
    const value = hi * Math.pow(2, expon - 16383 - 31) + lo * Math.pow(2, expon - 16383 - 63);
    return (v.getUint8(offset) & 0x80) ? -value : value;
};

const fourCC = (v: DataView, offset: number): string =>
    String.fromCharCode(v.getUint8(offset), v.getUint8(offset + 1), v.getUint8(offset + 2), v.getUint8(offset + 3));

export const decodeAiff = (buffer: ArrayBuffer): DecodedAiff => {
    if (!isAiff(buffer)) throw new Error('Not an AIFF file');
    const v = new DataView(buffer);

    let numChannels = 0;
    let numSampleFrames = 0;
    let bitDepth = 0;
    let sampleRate = 0;
    let compression = 'NONE';
    let hasComm = false;
    let dataStart = -1;
    let dataEnd = -1;

    // Walk the chunk list. Chunks are padded to even lengths.
    let pos = 12;
    while (pos + 8 <= buffer.byteLength) {
        const id = fourCC(v, pos);
        const size = v.getUint32(pos + 4);
        const body = pos + 8;

        if (id === 'COMM') {
            if (size < 18 || body + 18 > buffer.byteLength) throw new Error('AIFF COMM chunk is truncated');
            numChannels = v.getUint16(body);
            numSampleFrames = v.getUint32(body + 2);
            bitDepth = v.getUint16(body + 6);
            sampleRate = readExtendedFloat(v, body + 8);
            if (size >= 22 && body + 22 <= buffer.byteLength) compression = fourCC(v, body + 18);
            hasComm = true;
        } else if (id === 'SSND' && body + 8 <= buffer.byteLength) {
            // offset/blockSize occupy the first 8 bytes of the chunk body.
            dataStart = body + 8 + v.getUint32(body);
            // A cut-off file declares more data than it holds; read only what is there.
            dataEnd = Math.min(body + size, buffer.byteLength);
        }

        pos = body + size + (size % 2);
    }

    if (!hasComm || dataStart < 0) throw new Error('AIFF is missing COMM or SSND data');
    if (!(sampleRate > 0)) throw new Error(`Invalid AIFF sample rate: ${sampleRate}`);
    if (numChannels === 0) throw new Error('AIFF has no channels');

    let bytesPerSample: number;
    let isFloat = false;
    // 'sowt' is byte-swapped (little-endian) PCM, common from Mac tools.
    const littleEndian = compression === 'sowt';
    if (compression === 'NONE' || compression === 'sowt') {
        if (![8, 16, 24, 32].includes(bitDepth)) throw new Error(`Unsupported AIFF bit depth: ${bitDepth}`);
        bytesPerSample = bitDepth / 8;
    } else if (compression === 'fl32' || compression === 'FL32') {
        isFloat = true;
        bytesPerSample = 4;
    } else if (compression === 'fl64' || compression === 'FL64') {
        isFloat = true;
        bytesPerSample = 8;
    } else {
        throw new Error(`Unsupported AIFF compression: '${compression}'`);
    }

    const frameBytes = bytesPerSample * numChannels;
    const available = Math.max(0, Math.floor((dataEnd - dataStart) / frameBytes));
    const length = Math.min(numSampleFrames, available);
    if (length === 0) throw new Error('AIFF has no audio frames');

    const channelData: Float32Array[] = [];
    for (let c = 0; c < numChannels; c++) channelData.push(new Float32Array(length));

    for (let i = 0; i < length; i++) {
        const base = dataStart + i * frameBytes;
        for (let c = 0; c < numChannels; c++) {
            const o = base + c * bytesPerSample;
            let sample: number;
            if (isFloat) {
                sample = bytesPerSample === 4 ? v.getFloat32(o) : v.getFloat64(o);
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

    return { channelData, sampleRate, length };
};
