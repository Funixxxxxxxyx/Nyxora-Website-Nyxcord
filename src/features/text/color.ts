/** Small, dependency-free conversions used by every Nyxcord text color control. */
export interface HsvColor { h: number; s: number; v: number }

const clamp = (value: number, min = 0, max = 1) => Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));

export function normalizeHex(raw: string): string | null {
  const value = raw.trim().replace(/^#/, '');
  if (/^[\da-f]{3}$/i.test(value)) return `#${value.split('').map(c => c + c).join('').toUpperCase()}`;
  if (/^[\da-f]{6}$/i.test(value)) return `#${value.toUpperCase()}`;
  return null;
}

export function hexToHsv(input: string): HsvColor {
  const normalized = normalizeHex(input) ?? '#FFFFFF';
  const r = parseInt(normalized.slice(1, 3), 16) / 255;
  const g = parseInt(normalized.slice(3, 5), 16) / 255;
  const b = parseInt(normalized.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  let h = 0;
  if (delta) {
    if (max === r) h = ((g - b) / delta) % 6;
    else if (max === g) h = (b - r) / delta + 2;
    else h = (r - g) / delta + 4;
  }
  return { h: (h * 60 + 360) % 360, s: max ? delta / max : 0, v: max };
}

export function hsvToHex(input: HsvColor): string {
  const h = ((Number.isFinite(input.h) ? input.h : 0) % 360 + 360) % 360;
  const s = clamp(input.s);
  const v = clamp(input.v);
  const c = v * s;
  const x = c * (1 - Math.abs((h / 60) % 2 - 1));
  const m = v - c;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0]
    : h < 180 ? [0, c, x] : h < 240 ? [0, x, c]
    : h < 300 ? [x, 0, c] : [c, 0, x];
  return `#${[r, g, b].map(n => Math.round((n + m) * 255).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}

export function withHue(color: HsvColor, hue: number): HsvColor {
  return { ...color, h: clamp(hue, 0, 359) };
}
