export const VIDEO_COMPLETE_RATIO = 0.7;

// Merge a newly watched [start, end] range (seconds) into the existing
// ranges, clamped to the video length. Seeking is free, so only seconds
// actually watched count, and re-watching a part never counts twice.
export const mergeWatched = (
  intervals: [number, number][] = [],
  range: [number, number],
  duration: number
): { intervals: [number, number][]; watchedSeconds: number } => {
  const clamp = (n: number) => Math.max(0, Math.min(duration, n));
  const all = [...intervals, [clamp(range[0]), clamp(range[1])] as [number, number]]
    .filter(([s, e]) => e > s)
    .sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const [s, e] of all) {
    const last = merged[merged.length - 1];
    if (last && s <= last[1]) last[1] = Math.max(last[1], e);
    else merged.push([s, e]);
  }
  const watchedSeconds = merged.reduce((sum, [s, e]) => sum + (e - s), 0);
  return { intervals: merged, watchedSeconds: Math.round(watchedSeconds) };
};

export const isVideoComplete = (watchedSeconds: number, duration: number): boolean =>
  watchedSeconds >= VIDEO_COMPLETE_RATIO * duration;
