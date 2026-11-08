/** Time fields show seconds with one decimal; the stored data stays in milliseconds. */
export const formatSeconds = (ms: number): string => (ms / 1000).toFixed(1);

/** "1.0 s" - the form used in labels and on the timeline. */
export const formatSecondsLabel = (ms: number): string => `${formatSeconds(ms)} s`;
