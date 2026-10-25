import type { TextLayer } from './types';

export type TextCorner = 'nw' | 'ne' | 'sw' | 'se';
export type TextSide = 'n' | 'e' | 's' | 'w';
export type TextHandle = TextCorner | TextSide;
type Position = Pick<TextLayer, 'x' | 'y' | 'width' | 'height' | 'fontSize' | 'rotation'>;

export interface TextGestureOrigin {
  layer: Position;
  stageWidth: number;
  stageHeight: number;
  heightPx: number;
  /** Minimum displayed height needed for text and padding at the starting width. */
  minHeightPx?: number;
}

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
const direction = (corner: TextCorner) => ({
  horizontal: corner.endsWith('e') ? 1 : -1,
  vertical: corner.startsWith('s') ? 1 : -1,
});

/** Move the layer directly from its text body, without changing the box dimensions. */
export function moveTextFromPointer(origin: TextGestureOrigin, dx: number, dy: number): Pick<Position, 'x' | 'y'> {
  return {
    x: clamp(origin.layer.x + dx / Math.max(1, origin.stageWidth), 0, 1),
    y: clamp(origin.layer.y + dy / Math.max(1, origin.stageHeight), 0, 1),
  };
}

/** Opposite corner stays anchored in rotated coordinates during proportional scaling. */
export function scaleTextFromCorner(origin: TextGestureOrigin, corner: TextCorner, requestedScale: number): Pick<Position, 'x' | 'y' | 'width' | 'height' | 'fontSize'> {
  const { layer, stageWidth, stageHeight, heightPx } = origin;
  const limit = Math.min(1 / layer.width, 512 / layer.fontSize, layer.height === undefined ? Infinity : 1 / layer.height);
  const scale = clamp(requestedScale, Math.max(0.08 / layer.width, 6 / layer.fontSize), limit);
  const widthDelta = layer.width * Math.max(1, stageWidth) * (scale - 1);
  const heightDelta = Math.max(1, heightPx) * (scale - 1);
  const radians = layer.rotation * Math.PI / 180;
  const cos = Math.cos(radians), sin = Math.sin(radians);
  const { horizontal, vertical } = direction(corner);
  const localX = horizontal * widthDelta / 2;
  const localY = vertical * heightDelta / 2;
  return {
    x: clamp(layer.x + (localX * cos - localY * sin) / Math.max(1, stageWidth), 0, 1),
    y: clamp(layer.y + (localX * sin + localY * cos) / Math.max(1, stageHeight), 0, 1),
    width: layer.width * scale,
    height: layer.height === undefined ? undefined : layer.height * scale,
    fontSize: layer.fontSize * scale,
  };
}

/** Convert the screen pointer delta to the layer's rotated local axes. */
export function pointerToLocal(origin: TextGestureOrigin, dx: number, dy: number) {
  const radians = origin.layer.rotation * Math.PI / 180;
  return {
    x: dx * Math.cos(radians) + dy * Math.sin(radians),
    y: -dx * Math.sin(radians) + dy * Math.cos(radians),
  };
}

export function scaleTextFromPointer(origin: TextGestureOrigin, corner: TextCorner, dx: number, dy: number) {
  const local = pointerToLocal(origin, dx, dy);
  const width = origin.layer.width * Math.max(1, origin.stageWidth);
  const height = Math.max(1, origin.heightPx);
  const { horizontal, vertical } = direction(corner);
  const scale = 1 + (horizontal * width * local.x + vertical * height * local.y) / (width * width + height * height);
  return scaleTextFromCorner(origin, corner, scale);
}

/**
 * Side handles change only width OR height, never font size. The opposite edge
 * remains stationary after rotation. Height is optional on legacy/auto layers:
 * its first adjustment switches that layer to an explicit output-relative height.
 */
export function resizeTextFromSide(origin: TextGestureOrigin, side: TextSide, dx: number, dy: number):
  Pick<Position, 'x' | 'y' | 'width' | 'height'> {
  const { layer, stageWidth, stageHeight } = origin;
  const local = pointerToLocal(origin, dx, dy);
  const radians = layer.rotation * Math.PI / 180;
  const cos = Math.cos(radians), sin = Math.sin(radians);
  const horizontal = side === 'w' || side === 'e';
  const sign = side === 'e' || side === 's' ? 1 : -1;
  const startSize = horizontal ? layer.width * Math.max(1, stageWidth) : Math.max(1, origin.heightPx);
  const minimum = horizontal ? Math.max(20, .08 * stageWidth) : Math.max(14, origin.minHeightPx ?? 14);
  const maximum = horizontal ? stageWidth : Math.max(stageHeight, minimum);
  const nextSize = clamp(startSize + sign * (horizontal ? local.x : local.y), minimum, maximum);
  // The midpoint shifts half the change in the active edge's direction.
  const displacement = sign * (nextSize - startSize) / 2;
  const shiftX = horizontal ? displacement * cos : -displacement * sin;
  const shiftY = horizontal ? displacement * sin : displacement * cos;
  return {
    x: clamp(layer.x + shiftX / Math.max(1, stageWidth), 0, 1),
    y: clamp(layer.y + shiftY / Math.max(1, stageHeight), 0, 1),
    width: horizontal ? nextSize / Math.max(1, stageWidth) : layer.width,
    height: horizontal ? layer.height : nextSize / Math.max(1, stageHeight),
  };
}
