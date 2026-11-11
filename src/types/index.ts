export type Resolution = '1280x720' | '1920x1080' | '1920x1920' | '3840x2160';
export type FPS = 24 | 30;
/** Standard = the export's usual video bitrates, High = double (see utils/exportBitrate). */
export type ExportQuality = 'standard' | 'high';

/** Music level over time: one value per hop, normalised to 0..1 (see utils/audioReaction). */
export interface AudioEnvelope {
    hopMs: number;
    values: Float32Array;
}

export interface ProjectSettings {
    resolution: Resolution;
    fps: FPS;
    /** Visual lane is a packed row (see utils/packClips). Saved with the project; a file without it loads as false. */
    autoPack?: boolean;
    /** Video bitrate preset of the export. Absent means Standard. Saved with the project. */
    exportQuality?: ExportQuality;
    /** Who set the resolution: 'auto' (from the first visual asset) or 'manual' (the user). Absent: nobody yet. Saved with the project. */
    resolutionSource?: 'auto' | 'manual';
}

export type AssetType = 'image' | 'audio' | 'video';

export interface AssetItem {
    id: string;
    type: AssetType;
    file: File;
    objectUrl: string;
    name: string;
    duration?: number; // Milliseconds. Audio and video.
    peaks?: number[]; // Extracted waveform (drawing only)
    envelope?: AudioEnvelope; // Audio only: windowed-RMS envelope for Music reaction. Not saved with the project.
    posterUrl?: string; // Video thumbnail (data URL)
    hasAudio?: boolean; // Video only: whether the file carries an audio track
    width?: number;  // Intrinsic pixel width (video, and images added by import or drop)
    height?: number; // Intrinsic pixel height (video, and images added by import or drop)
}

export type TransitionType = 'cut' | 'dissolve' | 'delta-flow' | 'glitch' | 'breathing-morph';
export type FitMode = 'fit' | 'fill' | 'center';
export type MotionType = 'none' | 'zoom-in' | 'zoom-out' | 'pan-left' | 'pan-right' | 'pan-up' | 'pan-down';

export interface Clip {
    id: string;
    assetId: string; // Refers to AssetItem.id
    startTimeMs: number; // Position on timeline
    durationMs: number; // Length of clip
    sourceInMs?: number; // Video only: offset into the source media where playback starts
    volume?: number;     // 0..1 mix level for this clip's own audio (default 1)
    muted?: boolean;     // Silence this clip's own audio without losing its volume setting
    transitionType: TransitionType;
    transitionDurationMs: number; // Used if type is 'dissolve', creates overlap
    fitMode: FitMode;
    motionType: MotionType;
    motionIntensity: number; // 0.0 to 1.0 (amount of zoom/pan)
    motionSpeed: number;     // 0.0 to 1.0 (lerp speed/curve)
    glitchAmount?: number;    // 0.0 to 1.0 (probability/frequency)
    glitchIntensity?: number; // 0.0 to 1.0 (magnitude)
    glitchDisplacement?: number; // 0.0 to 1.0 (horizontal tearing displacement)
    musicReaction?: number;   // 0.0 to 1.0, how strongly this clip reacts to the music when Audio Reactive is on (default 0.5)
    audioReactive?: boolean;  // Enage VJ Mode (Audio reacts to zoom/glitch)
    deltaFlowSensitivity?: number;  // 0.0 to 1.0 (how broadly small differences react)
    deltaFlowStrength?: number;     // 0.0 to 1.0 (displacement magnitude)
    deltaFlowNoiseAmount?: number;  // 0.0 to 1.0 (organic wobble amount)
    breathingTurbulence?: number;   // 0.0 to 1.0 (organic noise wobble amount)
    breathingSwirl?: number;        // 0.0 to 1.0 (vortex rotation amount)
}

export interface ProjectData {
    settings: ProjectSettings;
    assets: AssetItem[];
    clips: Clip[];
}
