import type { EncodeJob } from './workerTypes';

// Time groups are contiguous: dropping frames increases the previous frame's delay.
export function reduceFrameRate(job: EncodeJob, stride: number): EncodeJob {
  const step = Math.max(1, Math.floor(stride));
  if (step === 1 || job.frames.length <= 2) return job;
  const frames: ArrayBuffer[] = [];
  const frameDelays: number[] = [];
  for (let i = 0; i < job.frames.length; i += step) {
    frames.push(job.frames[i]);
    let duration = 0;
    for (let j = i; j < Math.min(job.frames.length, i + step); j++)
      duration += job.frameDelays?.[j] ?? job.delayMs;
    frameDelays.push(duration);
  }
  if (frames.length < 2) return {
    ...job,
    frames: [job.frames[0], job.frames[job.frames.length - 1]],
    frameDelays: [animationDuration(job) / 2, animationDuration(job) / 2],
  };
  return { ...job, frames, frameDelays };
}

// Downsample once per scale and reuse for all palette attempts.
export function resizeFrames(job: EncodeJob, scale: number): EncodeJob {
  if (scale >= 1) return job;
  const width = Math.max(1, Math.floor(job.width * scale));
  const height = Math.max(1, Math.floor(job.height * scale));
  if (width === job.width && height === job.height) return job;
  const frames: ArrayBuffer[] = [];
  if (typeof OffscreenCanvas !== 'undefined') {
    const src = new OffscreenCanvas(job.width, job.height);
    const dst = new OffscreenCanvas(width, height);
    const srcCtx = src.getContext('2d');
    const dstCtx = dst.getContext('2d');
    if (srcCtx && dstCtx) {
      dstCtx.imageSmoothingEnabled = true;
      dstCtx.imageSmoothingQuality = 'high';
      for (const frame of job.frames) {
        srcCtx.putImageData(new ImageData(new Uint8ClampedArray(frame), job.width, job.height), 0, 0);
        dstCtx.clearRect(0, 0, width, height);
        dstCtx.drawImage(src, 0, 0, width, height);
        frames.push(dstCtx.getImageData(0, 0, width, height).data.buffer as ArrayBuffer);
      }
      return { ...job, width, height, frames };
    }
  }
  // Worker fallback when OffscreenCanvas is unavailable.
  for (const frame of job.frames) {
    const input = new Uint8Array(frame);
    const output = new Uint8Array(width * height * 4);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const sx = Math.min(job.width - 1, Math.floor((x + 0.5) * job.width / width));
      const sy = Math.min(job.height - 1, Math.floor((y + 0.5) * job.height / height));
      output.set(input.subarray((sy * job.width + sx) * 4, (sy * job.width + sx) * 4 + 4), (y * width + x) * 4);
    }
    frames.push(output.buffer as ArrayBuffer);
  }
  return { ...job, width, height, frames };
}

export function animationDuration(job: EncodeJob): number {
  return job.frames.reduce((sum, _, i) => sum + (job.frameDelays?.[i] ?? job.delayMs), 0);
}
