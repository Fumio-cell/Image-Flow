export type Resolution = '1280x720' | '1920x1080' | '1920x1920' | '3840x2160';
export type FPS = 24 | 30;

export interface ProjectSettings {
    resolution: Resolution;
    fps: FPS;
}

export type AssetType = 'image' | 'audio';

export interface AssetItem {
    id: string;
    type: AssetType;
    file: File;
    objectUrl: string;
    name: string;
    duration?: number; // Only for audio
    peaks?: number[]; // Extracted waveform
}

export type TransitionType = 'cut' | 'dissolve';
export type FitMode = 'fit' | 'fill' | 'center';
export type MotionType = 'none' | 'zoom-in' | 'zoom-out' | 'pan-left' | 'pan-right' | 'pan-up' | 'pan-down';

export interface Clip {
    id: string;
    assetId: string; // Refers to AssetItem.id
    startTimeMs: number; // Position on timeline
    durationMs: number; // Length of clip
    transitionType: TransitionType;
    transitionDurationMs: number; // Used if type is 'dissolve', creates overlap
    fitMode: FitMode;
    motionType: MotionType;
    motionIntensity: number; // 0.0 to 1.0 (amount of zoom/pan)
    motionSpeed: number;     // 0.0 to 1.0 (lerp speed/curve)
    glitchAmount?: number;    // 0.0 to 1.0 (probability/frequency)
    glitchIntensity?: number; // 0.0 to 1.0 (magnitude)
    glitchDisplacement?: number; // 0.0 to 1.0 (horizontal tearing displacement)
    audioReactive?: boolean;  // Enage VJ Mode (Audio reacts to zoom/glitch)
}

export interface ProjectData {
    settings: ProjectSettings;
    assets: AssetItem[];
    clips: Clip[];
}
