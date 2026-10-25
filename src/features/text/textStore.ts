import { create } from 'zustand';
import { defaultTextLayer } from './types';
import type { TextLayer } from './types';

export const MAX_TEXT_LAYERS = 32;
const clamp = (n: number, lo: number, hi: number) => Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : lo;
const clampLayer = (layer: TextLayer): TextLayer => ({
  ...layer,
  text: layer.text.slice(0, 600),
  x: clamp(layer.x, 0, 1), y: clamp(layer.y, 0, 1), width: clamp(layer.width, 0.08, 1),
  height: layer.height === undefined ? undefined : clamp(layer.height, 0.02, 1),
  fontSize: clamp(layer.fontSize, 6, 512), rotation: clamp(layer.rotation, -360, 360),
  outlineWidth: clamp(layer.outlineWidth, 0, 32), shadowBlur: clamp(layer.shadowBlur, 0, 50),
  shadowOffsetX: clamp(layer.shadowOffsetX, -100, 100), shadowOffsetY: clamp(layer.shadowOffsetY, -100, 100),
  backgroundOpacity: clamp(layer.backgroundOpacity, 0, 1), padding: clamp(layer.padding, 0, 100),
  fromMs: Math.max(0, Number.isFinite(layer.fromMs) ? layer.fromMs : 0),
  toMs: Math.max(0, Number.isFinite(layer.toMs) ? layer.toMs : 0),
});

interface TextState {
  layers: TextLayer[];
  selectedId: string | null;
  revision: number;
  reset(): void;
  add(): void;
  select(id: string | null): void;
  update(id: string, patch: Partial<TextLayer>): void;
  remove(id: string): void;
  duplicate(id: string): void;
  move(id: string, direction: -1 | 1): void;
}

export const useTextStore = create<TextState>((set) => ({
  layers: [], selectedId: null, revision: 0,
  reset: () => set(s => ({ layers: [], selectedId: null, revision: s.revision + 1 })),
  add: () => set(s => {
    if (s.layers.length >= MAX_TEXT_LAYERS) return s;
    const layer = defaultTextLayer();
    return { layers: [...s.layers, layer], selectedId: layer.id, revision: s.revision + 1 };
  }),
  select: selectedId => set({ selectedId }),
  update: (id, patch) => set(s => {
    const index = s.layers.findIndex(l => l.id === id);
    if (index < 0) return s;
    const old = s.layers[index];
    const next = clampLayer({ ...old, ...patch, id: old.id });
    // Avoid expensive overlay updates and invalidating downloads on no-op inputs.
    if (Object.keys(patch).every(key =>
      old[key as keyof TextLayer] === next[key as keyof TextLayer])) return s;
    const layers = [...s.layers];
    layers[index] = next;
    return { layers, revision: s.revision + 1 };
  }),
  remove: id => set(s => ({
    layers: s.layers.filter(l => l.id !== id),
    selectedId: s.selectedId === id ? null : s.selectedId,
    revision: s.revision + 1,
  })),
  duplicate: id => set(s => {
    const source = s.layers.find(l => l.id === id);
    if (!source || s.layers.length >= MAX_TEXT_LAYERS) return s;
    const copy = { ...source, id: crypto.randomUUID(), x: Math.min(1, source.x + .04), y: Math.min(1, source.y + .04) };
    return { layers: [...s.layers, copy], selectedId: copy.id, revision: s.revision + 1 };
  }),
  move: (id, direction) => set(s => {
    const index = s.layers.findIndex(l => l.id === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= s.layers.length) return s;
    const layers = [...s.layers];
    [layers[index], layers[target]] = [layers[target], layers[index]];
    return { layers, revision: s.revision + 1 };
  }),
}));
