/// <reference lib="webworker" />
import type { EncodeJob, EncodeMessage } from './workerTypes';
import { ApngStreamEncoder } from './apngStream';
import { GifDelayClock } from './frameTiming';
import { gifPaletteLimit } from './compressionStrategy';

const scope: DedicatedWorkerGlobalScope = self as unknown as DedicatedWorkerGlobalScope;
type GifWriter = ReturnType<typeof import('gifenc').GIFEncoder>;
type Active = { job: EncodeJob; count: number; durationMs: number;
  gif?: GifWriter; apng?: ApngStreamEncoder; gifClock?: GifDelayClock; queue: Promise<void>; failed: boolean };
let current: Active | null = null;

async function acceptFrame(active: Active, data: Extract<EncodeMessage, {type:'frame'}>): Promise<void> {
  const { job } = active;
  if (data.frame.byteLength !== job.width * job.height * 4)
    throw new Error('Invalid raw frame dimensions.');
  const rgba = new Uint8Array(data.frame);
  if (job.type === 'gif') {
    const { quantize, applyPalette } = await import('gifenc');
    const hasAlpha = rgba.some((v, i) => i % 4 === 3 && v < 128);
    const format = hasAlpha ? 'rgba4444' : 'rgb565';
    const paletteLimit = gifPaletteLimit(job.quality);
    const palette = quantize(rgba, Math.max(2, Math.min(job.colors ?? 128, paletteLimit)), { format, oneBitAlpha: hasAlpha });
    const indices = applyPalette(rgba, palette, format);
    const transparentIndex = hasAlpha ? palette.findIndex((color: number[]) => color[3] === 0) : -1;
    const delay = active.gifClock!.next(data.delayMs);
    active.gif!.writeFrame(indices, job.width, job.height, { palette,
      delay, repeat: 0, dispose: hasAlpha ? 2 : 1,
      transparent: transparentIndex >= 0,
      transparentIndex: Math.max(0, transparentIndex) });
    active.durationMs += delay;
  } else {
    await active.apng!.addFrame(rgba, data.delayMs);
    active.durationMs += data.delayMs;
  }
  active.count++;
  // Hard guard against compressed frame accumulation. Caller may retry smaller.
  const estimate = job.type === 'apng' ? active.apng!.byteEstimate :
    active.count % 4 === 0 ? active.gif!.bytes().byteLength : 0;
  const hardCap = job.enforceLimit ? job.maxBytes * 1.25
    : Math.min(80 * 1024 * 1024, Math.max(16 * 1024 * 1024, job.maxBytes * 2));
  if (estimate > hardCap)
    throw new Error('Compressed output is too large. Retrying with stronger optimization may help.');
  scope.postMessage({ id: job.id, type: 'ack', index: data.index });
}

async function finalize(active: Active): Promise<void> {
  const { job } = active;
  if (active.count < (job.type === 'png' ? 1 : 2))
    throw new Error('Animation requires at least two frames.');
  let bytes: Uint8Array;
  if (job.type === 'gif') {
    active.gif!.finish();
    bytes = active.gif!.bytes();
  } else bytes = active.apng!.finish();
  if (job.enforceLimit && bytes.byteLength >= job.maxBytes)
    throw new Error('Encoded sticker exceeds 512 KB.');
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  scope.postMessage({ id: job.id, type: 'done', buffer,
    width: job.width, height: job.height, frameCount: active.count,
    durationMs: active.durationMs, colors: job.colors ?? 0,
    withinLimit: bytes.byteLength < job.maxBytes,
    lossless: job.type === 'apng' && (job.colors ?? 8) === 8,
  }, [buffer]);
  if (current === active) current = null;
}

scope.onmessage = ({ data }: MessageEvent<EncodeMessage>) => {
  if (data.type === 'init') {
    if (current) { scope.postMessage({ id: data.job.id, type: 'error', error: 'Encoder is busy.' }); return; }
    const active: Active = { job: data.job, count: 0, durationMs: 0, queue: Promise.resolve(), failed: false };
    current = active;
    active.queue = (async () => {
      if (data.job.type === 'gif') {
        const { GIFEncoder } = await import('gifenc');
        active.gif = GIFEncoder();
        active.gifClock = new GifDelayClock();
      } else active.apng = new ApngStreamEncoder(data.job.width, data.job.height, data.job.colors ?? 8);
      scope.postMessage({ id: data.job.id, type: 'ready' });
    })().catch(error => fail(active, error));
    return;
  }
  const active = current;
  if (!active || data.id !== active.job.id || active.failed) return;
  active.queue = active.queue.then(() => {
    if (active.failed) return;
    return data.type === 'frame' ? acceptFrame(active, data) : finalize(active);
  }).catch(error => fail(active, error));
};
function fail(active: Active, error: unknown) {
  if (active.failed) return;
  active.failed = true;
  if (current === active) current = null;
  scope.postMessage({ id: active.job.id, type: 'error',
    error: error instanceof Error ? error.message : String(error) });
}
