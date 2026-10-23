import type { OutputFormat } from './validateOutput';
import { inspectAnimation, pngCrc } from './validateOutput';

const DECODER_PIXEL_BUDGET = 48 * 1024 * 1024;

type BrowserImageDecoder = {
  tracks: { ready: Promise<void>; selectedTrack: { frameCount: number } | null };
  decode(options: { frameIndex: number }): Promise<{ image: { displayWidth: number; displayHeight: number; close(): void } }>;
  close(): void;
};

async function validateApngFramesInBrowser(bytes: ArrayBuffer, expectedFrames: number, width: number, height: number): Promise<boolean> {
  const API = (globalThis as unknown as {
    ImageDecoder?: new (options: { type: string; data: Uint8Array }) => BrowserImageDecoder;
  }).ImageDecoder;
  if (!API) return false;
  let decoder: BrowserImageDecoder;
  try { decoder = new API({ type: 'image/png', data: new Uint8Array(bytes) }); }
  catch { return false; }
  try {
    await decoder.tracks.ready;
    if (decoder.tracks.selectedTrack?.frameCount !== expectedFrames)
      throw new Error('APNG image decoder reported a different frame count.');
    for (let i = 0; i < expectedFrames; i++) {
      const { image } = await decoder.decode({ frameIndex: i });
      try {
        if (image.displayWidth !== width || image.displayHeight !== height)
          throw new Error('APNG frame dimensions changed.');
      } finally { image.close(); }
    }
    return true;
  } finally { decoder.close(); }
}


async function verifyPngPixels(buffer: ArrayBuffer): Promise<{ width: number; height: number }> {
  // Decode the actual pixels; valid PNG chunks are not proof of valid compressed image data.
  if (typeof createImageBitmap === 'function') {
    const image = await createImageBitmap(new Blob([buffer], { type: 'image/png' }));
    try { return { width: image.width, height: image.height }; }
    finally { image.close(); }
  }
  const { default: UPNG } = await import('upng-js');
  const decoded = UPNG.decode(buffer);
  if (decoded.width * decoded.height * 4 > DECODER_PIXEL_BUDGET)
    throw new Error('Decoded image exceeds the validation memory budget.');
  const pixels = UPNG.toRGBA8(decoded);
  if (!pixels.length || pixels[0].byteLength !== decoded.width * decoded.height * 4)
    throw new Error('PNG pixel decoding failed.');
  return { width: decoded.width, height: decoded.height };
}

/** Rebuild one APNG frame at a time as a standalone PNG for pixel validation. */
export async function validateApngFramesIndividually(
  buffer: ArrayBuffer, expectedFrames: number, canvasWidth: number, canvasHeight: number,
): Promise<void> {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const signature = bytes.slice(0, 8);
  let header: Uint8Array | null = null;
  let chunks: Uint8Array[] = [];
  let count = 0;
  let frameWidth = 0;
  let frameHeight = 0;

  function be32(value: number): Uint8Array {
    return Uint8Array.of((value >>> 24) & 255, (value >>> 16) & 255,
      (value >>> 8) & 255, value & 255);
  }
  function pngChunk(name: string, data: Uint8Array): Uint8Array {
    const out = new Uint8Array(data.length + 12);
    out.set(be32(data.length), 0);
    for (let i = 0; i < 4; i++) out[i + 4] = name.charCodeAt(i);
    out.set(data, 8);
    out.set(be32(pngCrc(out, 4, out.length - 4)), out.length - 4);
    return out;
  }
  async function finishFrame() {
    if (!chunks.length) return;
    if (!header || !frameWidth || !frameHeight ||
        frameWidth > canvasWidth || frameHeight > canvasHeight)
      throw new Error('Unexpected APNG frame dimensions.');
    if (frameWidth * frameHeight * 4 > DECODER_PIXEL_BUDGET)
      throw new Error('APNG frame exceeds the decode memory budget.');
    const localHeader = header.slice();
    localHeader.set(be32(frameWidth), 0);
    localHeader.set(be32(frameHeight), 4);
    const parts = [signature, pngChunk('IHDR', localHeader),
      ...chunks.map(data => pngChunk('IDAT', data)), pngChunk('IEND', new Uint8Array())];
    const size = parts.reduce((sum, part) => sum + part.length, 0);
    const png = new Uint8Array(size);
    let offset = 0;
    for (const part of parts) { png.set(part, offset); offset += part.length; }
    const decoded = await verifyPngPixels(png.buffer);
    if (decoded.width !== frameWidth || decoded.height !== frameHeight)
      throw new Error('APNG frame did not decode correctly.');
    count++;
    chunks = [];
  }
  for (let pos = 8; pos + 12 <= bytes.length;) {
    const length = view.getUint32(pos);
    if (length > bytes.length - pos - 12)
      throw new Error('Corrupted APNG chunk length.');
    const type = String.fromCharCode(...bytes.subarray(pos + 4, pos + 8));
    const data = bytes.subarray(pos + 8, pos + 8 + length);
    if (type === 'IHDR') header = data.slice();
    else if (type === 'fcTL') {
      await finishFrame();
      frameWidth = new DataView(data.buffer, data.byteOffset, data.byteLength).getUint32(4);
      frameHeight = new DataView(data.buffer, data.byteOffset, data.byteLength).getUint32(8);
    } else if (type === 'IDAT') chunks.push(data);
    else if (type === 'fdAT') {
      if (length < 5) throw new Error('Truncated APNG frame data.');
      chunks.push(data.subarray(4));
    }
    pos += length + 12;
    if (type === 'IEND') break;
  }
  await finishFrame();
  if (count !== expectedFrames)
    throw new Error('APNG decoded frame count mismatch.');
}

export async function validateDecodedOutput(
  bytes: ArrayBuffer, format: OutputFormat, expectedDurationMs = 0,
  expectedWidth?: number, expectedHeight?: number,
): Promise<void> {
  const inspected = inspectAnimation(bytes, format);
  if (!inspected.valid) throw new Error('Encoder produced an invalid file.');
  let width = 0, height = 0, frames = 1, durationMs = 0;
  if (format === 'png') {
    ({ width, height } = await verifyPngPixels(bytes));
  } else if (format === 'gif') {
    const { parseGIF, decompressFrames } = await import('gifuct-js');
    const parsed = parseGIF(bytes);
    width = parsed.lsd.width;
    height = parsed.lsd.height;
    // Decode LZW pixel indices, not full RGBA patches; this avoids a 4x peak allocation.
    if (width * height * inspected.frames > 48 * 1024 * 1024)
      throw new Error('GIF validation would exceed the decoder memory budget.');
    const decoded = decompressFrames(parsed, false);
    frames = decoded.length;
    if (frames !== inspected.frames || decoded.some(f =>
      !f.pixels || f.pixels.length !== f.dims.width * f.dims.height))
      throw new Error('GIF frames failed LZW decoding.');
    durationMs = decoded.reduce((sum, frame) => sum + Math.max(20, frame.delay || 100), 0);
  } else {
    const { default: UPNG } = await import('upng-js');
    const decoded = UPNG.decode(bytes);
    frames = decoded.frames?.length ?? 0;
    width = decoded.width;
    height = decoded.height;
    if (frames !== inspected.frames || frames < 2)
      throw new Error('APNG frame count mismatch.');
    const verifiedInBrowser = await validateApngFramesInBrowser(bytes, frames, width, height);
    if (!verifiedInBrowser) {
      // Never accept a large animation after decoding only its poster frame.
      await validateApngFramesIndividually(bytes, frames, width, height);
    }
    durationMs = decoded.frames.reduce((sum, frame) => sum + (frame.delay || 0), 0);
  }
  if (format !== 'png' && frames < 2) throw new Error('Animated output must contain at least two frames.');
  if ((expectedWidth !== undefined && width !== expectedWidth) ||
      (expectedHeight !== undefined && height !== expectedHeight))
    throw new Error('Decoded dimensions do not match the export.');
  if (expectedDurationMs > 0 && Math.abs(durationMs - expectedDurationMs) > Math.max(110, expectedDurationMs * .04))
    throw new Error('Decoded animation duration differs from the selected trim.');
}
