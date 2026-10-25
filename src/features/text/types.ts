export type TextBackground = 'none' | 'solid' | 'rounded';
export type TextTiming = 'entire' | 'custom';

export interface TextLayer {
  id: string;
  text: string;
  // Center position and text box width, relative to the exported canvas.
  x: number;
  y: number;
  width: number;
  /** Optional box height relative to output canvas; absent means content-sized. */
  height?: number;
  rotation: number;
  fontFamily: string;
  fontSize: number;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  color: string;
  align: 'left' | 'center' | 'right';
  outlineColor: string;
  outlineWidth: number;
  shadowColor: string;
  shadowBlur: number;
  shadowOffsetX: number;
  shadowOffsetY: number;
  background: TextBackground;
  backgroundColor: string;
  backgroundOpacity: number;
  padding: number;
  timing: TextTiming;
  fromMs: number;
  toMs: number;
  hidden: boolean;
  locked: boolean;
}

export const FONT_FAMILIES = [
  'Arial', 'Helvetica', 'Georgia', 'Times New Roman', 'Verdana',
  'Trebuchet MS', 'Impact', 'Courier New', 'monospace', 'sans-serif', 'serif',
] as const;

export function defaultTextLayer(): TextLayer {
  return {
    id: crypto.randomUUID(), text: '', x: 0.5, y: 0.5, width: 0.75,
    rotation: 0, fontFamily: 'Arial', fontSize: 48, bold: true, italic: false,
    underline: false, color: '#ffffff', align: 'center', outlineColor: '#111111',
    outlineWidth: 2, shadowColor: '#000000', shadowBlur: 0,
    shadowOffsetX: 0, shadowOffsetY: 0, background: 'none',
    backgroundColor: '#000000', backgroundOpacity: 0.8, padding: 10,
    timing: 'entire', fromMs: 0, toMs: 2000, hidden: false, locked: false,
  };
}
