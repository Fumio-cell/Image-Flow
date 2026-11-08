import type { Clip } from '../types';

/**
 * What Glitch uses when its sliders were never touched. Before this, an untouched Glitch clip had
 * glitchAmount / glitchIntensity undefined and the render condition (both truthy) skipped it, so
 * choosing Glitch changed nothing.
 */
export const GLITCH_DEFAULTS = { amount: 0.9, intensity: 0.9, displacement: 0.3 } as const;

export interface GlitchParams {
    amount: number;
    intensity: number;
    displacement: number;
}

/** True when none of the three Glitch sliders has ever been set on this clip. */
export const glitchUntouched = (clip: Clip): boolean =>
    clip.glitchAmount === undefined && clip.glitchIntensity === undefined && clip.glitchDisplacement === undefined;

/**
 * The values the Glitch effect runs with. One shared function for the preview and the export.
 * Untouched clip: the defaults. Any slider set explicitly: exactly what it did before (a missing
 * field counts as 0), so explicit values keep their old behaviour.
 */
export function resolveGlitchParams(clip: Clip): GlitchParams {
    if (glitchUntouched(clip)) return { ...GLITCH_DEFAULTS };
    return {
        amount: clip.glitchAmount ?? 0,
        intensity: clip.glitchIntensity ?? 0,
        displacement: clip.glitchDisplacement || 0,
    };
}
