import { isOnlineFont, waitForOnlineFonts } from './fontLoader';
export interface ImportedFont { family: string; filename: string }
const MAX_FONT_BYTES = 10 * 1024 * 1024;
const imported = new Map<string, ImportedFont>();
const fontFaces = new Map<string, FontFace>();
const MAX_IMPORTED_FONTS = 16;
const MAX_TOTAL_FONT_BYTES = 24 * 1024 * 1024;
let importedBytes = 0;
let generation = 0;
let next = 0;

/** Release all user-provided font faces when a media session ends. */
export function resetImportedFonts(): void {
  generation++;
  for (const face of fontFaces.values()) document.fonts.delete(face);
  fontFaces.clear();
  imported.clear();
  importedBytes = 0;
}

export function listImportedFonts(): ImportedFont[] { return [...imported.values()]; }

function validSignature(bytes: Uint8Array, ext: string): boolean {
  if (bytes.length < 4) return false;
  const signature = String.fromCharCode(...bytes.subarray(0, 4));
  if (ext === 'woff') return signature === 'wOFF';
  if (ext === 'woff2') return signature === 'wOF2';
  if (ext === 'otf') return signature === 'OTTO' || bytes[0] === 0;
  return bytes[0] === 0 && bytes[1] === 1 && bytes[2] === 0 && bytes[3] === 0;
}

export async function importFont(file: File): Promise<ImportedFont> {
  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  if (!['ttf', 'otf', 'woff', 'woff2'].includes(ext)) throw new Error('Use TTF, OTF, WOFF, or WOFF2.');
  if (file.size <= 0 || file.size > MAX_FONT_BYTES) throw new Error('Font must be smaller than 10 MB.');
  if (imported.size >= MAX_IMPORTED_FONTS || importedBytes + file.size > MAX_TOTAL_FONT_BYTES)
    throw new Error('Too many imported fonts. Start a new media session to clear them.');
  const session = generation;
  const buffer = await file.arrayBuffer();
  if (session !== generation) throw new Error('Font import cancelled by session change.');
  if (!validSignature(new Uint8Array(buffer), ext)) throw new Error('Font file is not valid.');
  const family = `NyxcordFont${++next}`;
  const font = new FontFace(family, buffer);
  try { await font.load(); } catch { throw new Error('Browser could not load this font.'); }
  if (session !== generation) throw new Error('Font import cancelled by session change.');
  if (imported.size >= MAX_IMPORTED_FONTS || importedBytes + file.size > MAX_TOTAL_FONT_BYTES)
    throw new Error('Imported font limit reached.');
  document.fonts.add(font);
  fontFaces.set(family, font);
  importedBytes += file.size;
  const entry = { family, filename: file.name };
  imported.set(family, entry);
  return entry;
}

export async function waitForTextFonts(families: string[], signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
  await waitForOnlineFonts(families, signal);
  await Promise.all([...new Set(families)].map(async family => {
    if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
    const loaded = await document.fonts.load(`16px "${family.replaceAll('"', '')}"`);
    if ((imported.has(family) || isOnlineFont(family)) && loaded.length === 0)
      throw new Error(`Font ${imported.get(family)?.filename} is not ready.`);
  }));
  if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
}
