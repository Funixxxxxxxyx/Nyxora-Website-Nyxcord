export type OutputFormat = 'gif' | 'png' | 'apng';

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
const crcTable = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let value = i;
  for (let j = 0; j < 8; j++) value = value & 1 ? (0xedb88320 ^ (value >>> 1)) : value >>> 1;
  crcTable[i] = value >>> 0;
}

export function pngCrc(bytes: Uint8Array, start: number, end: number): number {
  let crc = 0xffffffff;
  for (let i = start; i < end; i++) crc = crcTable[(crc ^ bytes[i]) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function inspectGif(bytes: Uint8Array): { valid: boolean; frames: number } {
  if (bytes.length < 14 || !['GIF87a', 'GIF89a'].includes(String.fromCharCode(...bytes.subarray(0, 6))))
    return { valid: false, frames: 0 };
  let p = 13;
  if (bytes[10] & 0x80) p += 3 * (1 << ((bytes[10] & 7) + 1));
  let frames = 0;
  let trailer = false;
  while (p < bytes.length) {
    const marker = bytes[p++];
    if (marker === 0x3b) { trailer = p === bytes.length; break; }
    if (marker === 0x21) {
      if (p >= bytes.length) break;
      p++;
    } else if (marker === 0x2c) {
      if (p + 9 > bytes.length) break;
      const flags = bytes[p + 8];
      p += 9;
      if (flags & 0x80) p += 3 * (1 << ((flags & 7) + 1));
      if (p >= bytes.length) break;
      p++;
      frames++;
    } else break;
    let complete = false;
    while (p < bytes.length) {
      const size = bytes[p++];
      if (size === 0) { complete = true; break; }
      if (size > bytes.length - p) return { valid: false, frames };
      p += size;
    }
    if (!complete) break;
  }
  return { valid: trailer && frames >= 2, frames };
}

export function inspectAnimation(buffer: ArrayBuffer, format: OutputFormat): { valid: boolean; frames: number } {
  const bytes = new Uint8Array(buffer);
  if (format === 'gif') return inspectGif(bytes);
  if (bytes.length < 45 || !PNG_SIGNATURE.every((b, i) => bytes[i] === b)) return { valid: false, frames: 0 };
  const view = new DataView(buffer);
  let offset = 8;
  let width = 0, height = 0, declared = 0, controls = 0;
  let imageData = false, animationData = false, ended = false, sawHeader = false;
  while (offset + 12 <= bytes.length) {
    const length = view.getUint32(offset, false);
    if (length > bytes.length - offset - 12) return { valid: false, frames: 0 };
    const kind = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    const end = offset + 8 + length;
    if (pngCrc(bytes, offset + 4, end) !== view.getUint32(end, false)) return { valid: false, frames: 0 };
    if (!sawHeader) {
      if (kind !== 'IHDR' || length !== 13 || offset !== 8) return { valid: false, frames: 0 };
      width = view.getUint32(offset + 8, false);
      height = view.getUint32(offset + 12, false);
      if (!width || !height || width > 32768 || height > 32768) return { valid: false, frames: 0 };
      sawHeader = true;
    }
    if (kind === 'acTL') {
      if (length !== 8 || declared) return { valid: false, frames: 0 };
      declared = view.getUint32(offset + 8, false);
    }
    if (kind === 'fcTL') {
      if (length !== 26 || !declared) return { valid: false, frames: 0 };
      controls++;
    }
    if (kind === 'IDAT' && length) imageData = true;
    if (kind === 'fdAT' && length > 4) animationData = true;
    offset += length + 12;
    if (kind === 'IEND') {
      if (length !== 0 || offset !== bytes.length) return { valid: false, frames: 0 };
      ended = true;
      break;
    }
  }
  if (!sawHeader || !ended || !imageData) return { valid: false, frames: 0 };
  if (format === 'png') return { valid: !declared && controls === 0, frames: 1 };
  return { valid: declared >= 2 && declared === controls && animationData, frames: controls };
}

export function isEncodedFormat(buffer: ArrayBuffer, format: OutputFormat): boolean {
  return inspectAnimation(buffer, format).valid;
}
