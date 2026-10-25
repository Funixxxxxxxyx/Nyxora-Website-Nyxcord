import type { ExportResult } from '../store/editor';
import { effectiveQuality, useEditor } from '../store/editor';
import type { LoadedMedia } from './media';
import { drawProcessed, seekVideo } from './media';
import { exportPlan } from './exportPlan';
import { useTextStore } from '../features/text/textStore';
import { renderTextLayers } from '../features/text/textRender';
import { waitForTextFonts } from '../features/text/fontRegistry';
import { compressionRecipes, pngRecipes } from './compressionStrategy';
import { inspectAnimation } from './validateOutput';
import { validateDecodedOutput } from './decodeValidation';
import type { EncodeJob, EncodeResult, EncodeMessage, EncodeWorkerEvent } from './workerTypes';

export type ExportCallback = (percent: number, phase: string) => void;
export type AnimatedExportFormat = 'gif' | 'apng';
const cancelled = () => new DOMException('Export cancelled', 'AbortError');

function createEncoder(job: EncodeJob, signal: AbortSignal) {
  if (signal.aborted) throw cancelled();
  const worker = new Worker(new URL('./encoder.worker.ts', import.meta.url), { type: 'module' });
  let settled = false;
  let readyResolve!: () => void;
  let readyReject!: (error: Error) => void;
  let resultResolve!: (value: EncodeResult) => void;
  let resultReject!: (error: Error) => void;
  let pending: { index: number; resolve(): void; reject(error: Error): void } | null = null;
  const ready = new Promise<void>((resolve, reject) => { readyResolve = resolve; readyReject = reject; });
  const result = new Promise<EncodeResult>((resolve, reject) => { resultResolve = resolve; resultReject = reject; });
  let timeout: ReturnType<typeof setTimeout>;
  const watchdog = () => {
    clearTimeout(timeout);
    timeout = setTimeout(() => fail(new Error('Encoder made no progress. Try a shorter clip.')), 45000);
  };
  const cleanup = () => { clearTimeout(timeout); signal.removeEventListener('abort', onAbort); worker.terminate(); };
  const fail = (error: Error) => {
    if (settled) return;
    settled = true;
    pending?.reject(error);
    pending = null;
    readyReject(error);
    resultReject(error);
    cleanup();
  };
  const onAbort = () => fail(cancelled());
  watchdog();
  signal.addEventListener('abort', onAbort, { once: true });
  worker.onerror = () => fail(new Error('The encoder stopped unexpectedly. Try a smaller clip.'));
  worker.onmessage = ({ data }: MessageEvent<EncodeWorkerEvent>) => {
    if (settled || data.id !== job.id) return;
    if (data.type === 'ready') { watchdog(); readyResolve(); }
    if (data.type === 'ack' && pending && data.index === pending.index) {
      watchdog();
      pending.resolve(); pending = null;
    }
    if (data.type === 'error') fail(new Error(data.error));
    if (data.type === 'done') {
      settled = true;
      resultResolve(data);
      cleanup();
    }
  };
  worker.postMessage({ type: 'init', job } satisfies EncodeMessage);
  // An aborted initialization may reject before caller awaits `ready`.
  void ready.catch(() => {});
  void result.catch(() => {});
  return {
    async push(frame: ArrayBuffer, index: number, delayMs: number) {
      await ready;
      if (signal.aborted) throw cancelled();
      if (settled || pending) throw new Error('Encoder cannot accept another frame.');
      await new Promise<void>((resolve, reject) => {
        pending = { index, resolve, reject };
        watchdog();
        worker.postMessage({ type: 'frame', id: job.id, index, frame, delayMs } satisfies EncodeMessage, [frame]);
      });
    },
    async finish() {
      await ready;
      if (pending || signal.aborted) throw cancelled();
      worker.postMessage({ type: 'finish', id: job.id } satisfies EncodeMessage);
      return result;
    },
    close() { fail(cancelled()); },
  };
}

async function isolatedVideo(media: LoadedMedia, signal: AbortSignal): Promise<HTMLVideoElement> {
  if (signal.aborted) throw cancelled();
  const video = document.createElement('video');
  video.preload = 'auto'; video.muted = true; video.playsInline = true;
  await new Promise<void>((resolve, reject) => {
    let done = false;
    const stop = (error?: Error) => {
      if (done) return;
      done = true;
      clearTimeout(timeout);
      signal.removeEventListener('abort', onAbort);
      video.removeEventListener('loadeddata', ready);
      video.removeEventListener('error', failed);
      if (error) reject(error); else resolve();
    };
    const ready = () => stop();
    const failed = () => stop(new Error('The browser cannot decode this video.'));
    const onAbort = () => stop(cancelled());
    const timeout = setTimeout(() => stop(new Error('Video decoding timed out.')), 15000);
    signal.addEventListener('abort', onAbort, { once: true });
    video.addEventListener('loadeddata', ready, { once: true });
    video.addEventListener('error', failed, { once: true });
    video.src = media.url; video.load();
  }).catch(error => { video.removeAttribute('src'); video.load(); throw error; });
  return video;
}

export async function renderMedia(
  media: LoadedMedia, signal: AbortSignal, progress: ExportCallback,
  animatedStickerFormat: AnimatedExportFormat = 'gif',
): Promise<ExportResult> {
  const started = performance.now();
  const settings = useEditor.getState();
  const textLayers = useTextStore.getState().layers.map(layer => ({ ...layer }));
  const usedLayers = textLayers.filter(layer => !layer.hidden && layer.text.trim());
  await waitForTextFonts(usedLayers.map(layer => layer.fontFamily), signal);
  for (const layer of usedLayers) {
    if (layer.timing === 'custom' && layer.toMs <= layer.fromMs)
      throw new Error('Text duration end must be later than start.');
  }
  const plan = exportPlan(media.meta, settings);
  const { width, height, frameCount, maxBytes, frameDuration, sticker, animated, duration } = plan;
  const overlayLayers = animated ? textLayers : textLayers.map(layer => ({ ...layer, timing: 'entire' as const }));
  const type: EncodeJob['type'] = sticker && !animated ? 'png' : sticker ? animatedStickerFormat : 'gif';
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { alpha: true, willReadFrequently: true });
  if (!ctx) throw new Error('Canvas is unavailable.');
  let decoder: HTMLVideoElement | null = null;
  let encoder: ReturnType<typeof createEncoder> | null = null;
  let selected: EncodeResult | null = null;
  let lastIssue: string | null = null;
  progress(1, 'Preparing media');
  try {
    if (media.meta.kind === 'video') decoder = await isolatedVideo(media, signal);
    const source: LoadedMedia = decoder ? { ...media, element: decoder } : media;
    const quality = effectiveQuality(sticker ? 'high' : settings.qualityMode);
    const candidates = type === 'png' ? pngRecipes : compressionRecipes(type, sticker, quality);
    // Cache small decoded video selections for compression retries; never cache large clips.
    const deviceMemory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
    const cacheBudget = deviceMemory !== undefined && deviceMemory <= 4 ? 4 : 8;
    const canCache = type !== 'png' && media.meta.kind === 'video' &&
      width * height * 4 * frameCount <= cacheBudget * 1024 * 1024;
    const cachedFrames: ArrayBuffer[] | null = canCache ? [] : null;
    const cacheCanvas = canCache ? document.createElement('canvas') : null;
    const cacheCtx = cacheCanvas?.getContext('2d', { willReadFrequently: true }) ?? null;
    if (cacheCanvas) { cacheCanvas.width = width; cacheCanvas.height = height; }
    for (let attempt = 0; attempt < candidates.length; attempt++) {
      if (signal.aborted) throw cancelled();
      const candidate = candidates[attempt];
      const candidateWidth = Math.max(1, Math.min(width, Math.round(width * candidate.scale)));
      const candidateHeight = Math.max(1, Math.min(height, Math.round(height * candidate.scale)));
      canvas.width = candidateWidth;
      canvas.height = candidateHeight;
      // Static stickers never initialize an animation worker.
      if (type === 'png') {
        if (decoder) await seekVideo(decoder, settings.playhead, signal);
        drawProcessed(ctx, source, settings.crop, settings.playhead,
          candidateWidth, candidateHeight, 'contain', false, settings.rotation);
        renderTextLayers(ctx, overlayLayers, 0, candidateWidth, candidateHeight, width, height);
        let blob: Blob | null;
        if (candidate.colors === 0) {
          blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
        } else {
          const { default: UPNG } = await import('upng-js');
          const pixels = ctx.getImageData(0, 0, candidateWidth, candidateHeight).data.buffer;
          blob = new Blob([UPNG.encode([pixels], candidateWidth, candidateHeight, candidate.colors)], { type: 'image/png' });
        }
        if (signal.aborted) throw cancelled();
        if (!blob) throw new Error('PNG encoding failed.');
        if (blob.size >= maxBytes) {
          lastIssue = 'Static sticker remains oversized.';
          continue;
        }
        await validateDecodedOutput(await blob.arrayBuffer(), 'png', 0, candidateWidth, candidateHeight);
        progress(100, 'Complete');
        return { url: URL.createObjectURL(blob), name: 'Nyxcord-sticker.png',
          format: 'png', size: blob.size, mime: 'image/png', width: candidateWidth,
          height: candidateHeight, fps: 0, duration: 0,
          elapsedMs: performance.now() - started, compliant: true,
          preset: 'sticker-custom', notes: ['Custom sticker dimensions may not be accepted by Discord.'] };
      }

      const indices: number[] = [];
      for (let i = 0; i < frameCount; i += candidate.stride) indices.push(i);
      if (animated && indices.length < 2 && frameCount > 1) indices.push(frameCount - 1);
      const delays = indices.map((index, i) =>
        (Math.min(frameCount, indices[i + 1] ?? frameCount) - index) * frameDuration * 1000);
      const job: EncodeJob = { id: attempt + 1, type, width: candidateWidth,
        height: candidateHeight, maxBytes, delayMs: frameDuration * 1000,
        quality, colors: candidate.colors, enforceLimit: sticker };
      encoder = createEncoder(job, signal);
      try {
        for (let i = 0; i < indices.length; i++) {
          if (signal.aborted) throw cancelled();
          const timestamp = animated
            ? settings.trimStart + frameDuration * (indices[i] + .5)
            : media.meta.kind === 'image' ? 0 : settings.playhead;
          const stored = cachedFrames?.[indices[i]];
          if (attempt > 0 && stored && cacheCanvas && cacheCtx) {
            cacheCtx.putImageData(new ImageData(new Uint8ClampedArray(stored), width, height), 0, 0);
            ctx.clearRect(0, 0, candidateWidth, candidateHeight);
            ctx.drawImage(cacheCanvas, 0, 0, candidateWidth, candidateHeight);
          } else {
            if (decoder) await seekVideo(decoder, timestamp, signal);
            drawProcessed(ctx, source, settings.crop, timestamp, candidateWidth,
              candidateHeight, 'contain', false, settings.rotation);
          }
          if (attempt === 0 && cachedFrames)
            cachedFrames.push(ctx.getImageData(0, 0, candidateWidth, candidateHeight).data.buffer.slice(0));
          renderTextLayers(ctx, overlayLayers, animated ? (timestamp - settings.trimStart) * 1000 : 0,
            candidateWidth, candidateHeight, width, height);
          const raw = ctx.getImageData(0, 0, candidateWidth, candidateHeight).data.buffer;
          await encoder!.push(raw, i, delays[i]);
          progress(Math.min(95, Math.round((attempt + (i + 1) / indices.length) / candidates.length * 95)),
            `${attempt > 0 ? 'Optimizing' : 'Encoding'} ${i + 1}/${indices.length}`);
        }
        const candidateResult = await encoder!.finish();
        encoder = null;
        if (candidateResult.withinLimit) { selected = candidateResult; break; }
        lastIssue = 'Output exceeds target size.';
        if (!sticker && attempt === candidates.length - 1) selected = candidateResult;
      } catch (error) {
        encoder?.close(); encoder = null;
        if (signal.aborted) throw cancelled();
        lastIssue = error instanceof Error ? error.message : String(error);
        if (!sticker && attempt === candidates.length - 1) throw error;
      }
    }
    if (!selected) throw new Error(type === 'png'
      ? `Cannot compress this image below 512 KB. Try a smaller crop. ${lastIssue ?? ''}`
      : 'Cannot compress this animation below 512 KB while keeping its duration. Try a shorter clip or crop. ' + (lastIssue ?? ''));
    if (signal.aborted) throw cancelled();
    const outputFormat = type as 'gif' | 'apng';
    if (!inspectAnimation(selected.buffer, outputFormat).valid)
      throw new Error('The encoder produced an invalid animation.');
    await validateDecodedOutput(selected.buffer, outputFormat, animated ? duration * 1000 : 0,
      selected.width, selected.height);
    if (signal.aborted) throw cancelled();
    const blob = new Blob([selected.buffer], { type: type === 'gif' ? 'image/gif' : 'image/png' });
    if (sticker && blob.size >= maxBytes) throw new Error('Sticker exceeds 512 KB.');
    const notes: string[] = [];
    if (selected.width !== width || selected.height !== height)
      notes.push(`Optimized to ${selected.width} × ${selected.height}.`);
    if (selected.frameCount !== frameCount)
      notes.push(`Frame count optimized to ${selected.frameCount}.`);
    if (!selected.withinLimit) notes.push('File exceeds the selected GIF size target.');
    if (sticker) notes.push('Custom sticker dimensions may not be accepted by Discord.');
    progress(100, 'Complete');
    return { url: URL.createObjectURL(blob),
      name: sticker ? type === 'gif' ? 'Nyxcord-sticker.gif' : 'Nyxcord-sticker-animated.png' : 'Nyxcord-gif.gif',
      format: outputFormat, mime: blob.type, size: blob.size,
      width: selected.width, height: selected.height,
      fps: animated ? selected.frameCount / (selected.durationMs / 1000) : 0,
      duration: selected.durationMs / 1000, notes,
      elapsedMs: performance.now() - started,
      compliant: sticker ? blob.size < maxBytes : selected.withinLimit,
      preset: sticker ? 'sticker-custom' : 'gif' };
  } finally {
    encoder?.close();
    if (decoder) { decoder.pause(); decoder.removeAttribute('src'); decoder.load(); }
    canvas.width = 0; canvas.height = 0;
  }
}
