import type { EncodeJob } from './workerTypes';

export type CompressionProfile = { colors: number; label: string };

// Fast-to-slow palette fallbacks. Canvas dimensions and duration stay unchanged.
export function compressionProfiles(job: EncodeJob): CompressionProfile[] {
  if (job.type === 'apng' || job.type === 'png') {
    return [0, 128, 48, 16, 4, 2].map(colors => ({
      colors, label: colors === 0 ? 'Lossless APNG' : `${colors}-color APNG`,
    }));
  }
  const base = job.quality >= 90 ? 256 : job.quality >= 70 ? 192 : 128;
  return [...new Set([base, 64, 24, 8, 2])]
    .filter(colors => colors <= base)
    .map(colors => ({ colors, label: `${colors}-color GIF` }));
}
