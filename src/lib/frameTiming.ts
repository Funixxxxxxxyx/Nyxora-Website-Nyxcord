/** GIF stores frame durations as centiseconds (10 ms units). */
export class GifDelayClock {
  private requestedMs = 0;
  private encodedMs = 0;

  next(delayMs: number): number {
    if (!Number.isFinite(delayMs) || delayMs <= 0)
      throw new Error('Invalid GIF frame duration.');
    this.requestedMs += delayMs;
    const roundedTotal = Math.round(this.requestedMs / 10) * 10;
    // 20 ms avoids commonly ignored ultra-short GIF frame delays.
    const delay = Math.max(20, roundedTotal - this.encodedMs);
    this.encodedMs += delay;
    return delay;
  }

  get durationMs(): number { return this.encodedMs; }
}

/** Utility used by regression tests and external timing checks. */
export function gifFrameDelays(job: {
  frameDelays?: readonly number[];
  frames?: readonly unknown[];
  frameCount?: number;
  delayMs: number;
}): number[] {
  const count = job.frameDelays?.length ?? job.frameCount ?? job.frames?.length ?? 0;
  const clock = new GifDelayClock();
  return Array.from({ length: count }, (_, i) => clock.next(job.frameDelays?.[i] ?? job.delayMs));
}
