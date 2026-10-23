import type { EncodeJob } from './workerTypes';

function equalFrames(left: ArrayBuffer, right: ArrayBuffer): boolean {
  if (left.byteLength !== right.byteLength) return false;
  const a = new Uint32Array(left);
  const b = new Uint32Array(right);
  // Most consecutive video frames differ. Sample before doing a full comparison.
  const step = Math.max(1, Math.floor(a.length / 128));
  for (let i = 0; i < a.length; i += step) if (a[i] !== b[i]) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export function mergeDuplicateFrames(job: EncodeJob): EncodeJob {
  if (job.frames.length < 2) return job;
  const frames: ArrayBuffer[] = [];
  const frameDelays: number[] = [];
  for (let i = 0; i < job.frames.length; i++) {
    const delay = job.frameDelays?.[i] ?? job.delayMs;
    const last = frames.length - 1;
    if (last >= 0 && equalFrames(frames[last], job.frames[i])) frameDelays[last] += delay;
    else {
      frames.push(job.frames[i]);
      frameDelays.push(delay);
    }
  }
  // Keep two identical frames when the source is animated.
  if (frames.length === 1) return job;
  return { ...job, frames, frameDelays };
}
