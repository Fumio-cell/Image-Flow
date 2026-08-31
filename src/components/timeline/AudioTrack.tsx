import React from 'react';
import { ClipTrack } from './ClipTrack';

/**
 * The audio lane. It's the same track component as the visual lane — audio
 * clips are ordinary clips, so they can be dropped anywhere, dragged along the
 * timeline and trimmed exactly like video.
 */
export const AudioTrack: React.FC = () => <ClipTrack kind="audio" />;
