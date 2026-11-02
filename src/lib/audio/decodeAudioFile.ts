import { isAiff, decodeAiff } from './aiffDecoder';

/**
 * Drop-in replacement for ctx.decodeAudioData that also reads AIFF / AIFC.
 *
 * Like decodeAudioData, the result is at ctx.sampleRate: AIFF audio at another
 * rate is resampled through an OfflineAudioContext.
 */
export async function decodeAudioFile(ctx: BaseAudioContext, data: ArrayBuffer): Promise<AudioBuffer> {
    if (!isAiff(data)) return ctx.decodeAudioData(data);

    const { channelData, sampleRate, length } = decodeAiff(data);
    const source = ctx.createBuffer(channelData.length, length, sampleRate);
    channelData.forEach((samples, c) => source.getChannelData(c).set(samples));
    if (sampleRate === ctx.sampleRate) return source;

    const offline = new OfflineAudioContext(
        channelData.length,
        Math.ceil(length * ctx.sampleRate / sampleRate),
        ctx.sampleRate
    );
    const node = offline.createBufferSource();
    node.buffer = source;
    node.connect(offline.destination);
    node.start(0);
    return offline.startRendering();
}
