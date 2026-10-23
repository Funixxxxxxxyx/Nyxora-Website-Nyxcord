import type { EncodeJob } from './workerTypes';

export type CompressionRecipe = { scale: number; stride: number; colors: number };

/** GIF quality controls the initial palette; sticker presets optimize for file size. */
export function gifPaletteLimit(quality: number): number {
  return quality >= 90 ? 256 : quality >= 80 ? 192 : quality >= 65 ? 128 : 64;
}

export function compressionRecipes(
  format: EncodeJob['type'], sticker: boolean, quality: number,
): CompressionRecipe[] {
  if (!sticker) {
    const colors = gifPaletteLimit(quality);
    return [
      { scale: 1, stride: 1, colors },
      { scale: .82, stride: 1, colors: Math.max(16, Math.floor(colors / 2)) },
    ];
  }
  const colors = format === 'gif' ? [128, 64, 32, 16, 8, 4] : [8, 5, 4, 3, 2, 1];
  const scales = [1, .85, .7, .52, .38, .25];
  const strides = [1, 1, 2, 3, 4, 6];
  return scales.map((scale, i) => ({ scale, stride: strides[i], colors: colors[i] }));
}

export const pngRecipes: CompressionRecipe[] = [
  { scale: 1, stride: 1, colors: 0 },
  { scale: 1, stride: 1, colors: 64 },
  { scale: .75, stride: 1, colors: 32 },
  { scale: .5, stride: 1, colors: 16 },
  { scale: .3, stride: 1, colors: 8 },
];
