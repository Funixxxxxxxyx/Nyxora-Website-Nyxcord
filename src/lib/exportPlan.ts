import type { Meta } from '../store/editor';
import { automaticFps, orientedCrop, useEditor } from '../store/editor';
export const STICKER_MAX_BYTES = 512000;
export const MAX_FRAMES = 120;
export const FRAME_MEMORY_BYTES = 96 * 1024 * 1024;

export function exportPlan(meta: Meta, settings = useEditor.getState()) {
  const sticker = settings.mode === 'sticker';
  const { outputWidth: width, outputHeight: height } = settings;
  const source = orientedCrop(settings.crop, settings.rotation);
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1)
    throw new Error('Choose valid Canvas Size dimensions.');
  if (width > Math.floor(source.width + 1e-6) || height > Math.floor(source.height + 1e-6))
    throw new Error('Canvas Size cannot exceed the selected source.');
  const animated = meta.kind !== 'image' && (!sticker || settings.stickerMotion === 'animated');
  const duration = animated ? settings.trimEnd - settings.trimStart : 0;
  if (animated && (!Number.isFinite(duration) || duration <= 0))
    throw new Error('Select a valid trim duration.');
  if (sticker && animated && duration > 5.001)
    throw new Error('Sticker duration cannot exceed 5 seconds.');
  const fps = animated ? (sticker || settings.fpsMode === 'auto'
    ? automaticFps(meta, settings.mode) : settings.fpsMode) : 0;
  // Two in-flight frame copies plus a canvas, decoder and encoder scratch buffers.
  const deviceMemory = typeof navigator !== 'undefined'
    ? (navigator as Navigator & { deviceMemory?: number }).deviceMemory : undefined;
  const perFrameCap = deviceMemory !== undefined && deviceMemory <= 4
    ? 10 * 1024 * 1024 : 24 * 1024 * 1024;
  if (width * height * 4 > perFrameCap)
    throw new Error('This canvas is too large to encode safely. Reduce Canvas Size.');
  const requestedFrames = animated ? Math.max(2, Math.ceil(duration * fps)) : 1;
  const frameCount = Math.min(requestedFrames, MAX_FRAMES);
  const actualFps = animated ? frameCount / duration : 0;
  return { width, height, sticker, animated, duration, frameCount,
    fps: actualFps, intendedFps: fps, frameDuration: animated ? duration / frameCount : 0,
    maxBytes: sticker ? STICKER_MAX_BYTES : Math.floor(settings.sizeTargetMB * 1000000),
    wasAutoReduced: false, wasFrameReduced: animated && frameCount < requestedFrames };
}
