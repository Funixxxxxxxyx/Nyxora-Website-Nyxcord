import type { TextLayer } from './types';

/** Use the same renderer for browser preview and exported frames. */
export function layerVisible(layer: TextLayer, outputTimeMs: number): boolean {
  if (layer.hidden || !layer.text.trim()) return false;
  return layer.timing !== 'custom' || (outputTimeMs >= layer.fromMs && outputTimeMs < layer.toMs);
}

/** Wrap at word boundaries, splitting long tokens in logarithmic measureText calls.
 * A 600-character token previously measured each growing prefix (quadratic cost).
 * Keeping this implementation shared with every canvas export avoids inconsistent wraps.
 */
export function wrapTextLines(ctx: Pick<CanvasRenderingContext2D, 'measureText'>, content: string, maxWidth: number): string[] {
  const lines: string[] = [];
  const safeWidth = Math.max(1, maxWidth);
  for (const paragraph of content.split('\n')) {
    let current = '';
    for (const token of paragraph.match(/\S+|\s+/g) ?? []) {
      if (ctx.measureText(current + token).width <= safeWidth) { current += token; continue; }
      if (current.trim()) {
        lines.push(current.trimEnd());
        current = '';
      }
      if (lines.length >= 100) break;
      if (ctx.measureText(token).width <= safeWidth) { current = token; continue; }
      const characters = Array.from(token);
      let offset = 0;
      while (offset < characters.length && lines.length < 100) {
        let low = 1;
        let high = characters.length - offset;
        let best = 1;
        while (low <= high) {
          const middle = (low + high) >>> 1;
          if (ctx.measureText(characters.slice(offset, offset + middle).join('')).width <= safeWidth) {
            best = middle;
            low = middle + 1;
          } else high = middle - 1;
        }
        const chunk = characters.slice(offset, offset + best).join('');
        offset += best;
        if (offset < characters.length) lines.push(chunk);
        else current = chunk;
      }
    }
    if (lines.length >= 100) break;
    lines.push(current);
    if (lines.length >= 100) break;
  }
  return lines.slice(0, 100);
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

export function renderTextLayers(
  ctx: CanvasRenderingContext2D, layers: readonly TextLayer[],
  outputTimeMs: number, canvasWidth: number, canvasHeight: number,
  designWidth = canvasWidth, designHeight = canvasHeight,
) {
  const maxDimension = Math.max(canvasWidth, canvasHeight);
  if (!Number.isFinite(maxDimension) || maxDimension < 1) return;
  const scale = Math.min(canvasWidth / Math.max(1, designWidth), canvasHeight / Math.max(1, designHeight));
  for (const layer of layers) {
    if (!layerVisible(layer, outputTimeMs)) continue;
    ctx.save();
    try {
      ctx.translate(layer.x * canvasWidth, layer.y * canvasHeight);
      ctx.rotate(layer.rotation * Math.PI / 180);
      const size = Math.max(1, Math.min(layer.fontSize, 512) * scale);
      const lineHeight = size * 1.2;
      const boxWidth = Math.max(1, layer.width * canvasWidth);
      const padding = Math.max(0, layer.padding * scale);
      const interior = Math.max(1, boxWidth - padding * 2);
      ctx.font = `${layer.italic ? 'italic ' : ''}${layer.bold ? '700 ' : '400 '}${size}px "${layer.fontFamily.replaceAll('"', '')}", sans-serif`;
      ctx.textAlign = layer.align;
      ctx.textBaseline = 'middle';
      const lines = wrapTextLines(ctx, layer.text, interior);
      const contentHeight = Math.max(lineHeight, lines.length * lineHeight) + padding * 2;
      const h = layer.height === undefined ? contentHeight :
        Math.max(contentHeight, layer.height * canvasHeight);
      if (layer.background !== 'none') {
        ctx.fillStyle = layer.backgroundColor;
        ctx.globalAlpha = layer.backgroundOpacity;
        ctx.beginPath();
        if (layer.background === 'rounded') roundedRect(ctx, -boxWidth / 2, -h / 2, boxWidth, h, Math.min(18, size / 3));
        else ctx.rect(-boxWidth / 2, -h / 2, boxWidth, h);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      ctx.fillStyle = layer.color;
      ctx.strokeStyle = layer.outlineColor;
      ctx.lineWidth = layer.outlineWidth * 2 * scale;
      ctx.lineJoin = 'round';
      ctx.shadowColor = layer.shadowColor;
      ctx.shadowBlur = layer.shadowBlur * scale;
      ctx.shadowOffsetX = layer.shadowOffsetX * scale;
      ctx.shadowOffsetY = layer.shadowOffsetY * scale;
      const x = layer.align === 'left' ? -boxWidth / 2 + padding :
        layer.align === 'right' ? boxWidth / 2 - padding : 0;
      for (let i = 0; i < lines.length; i++) {
        const y = (i - (lines.length - 1) / 2) * lineHeight;
        if (layer.outlineWidth > 0) ctx.strokeText(lines[i], x, y, interior);
        ctx.fillText(lines[i], x, y, interior);
        if (layer.underline) {
          const textWidth = Math.min(interior, ctx.measureText(lines[i]).width);
          const underlineX = layer.align === 'left' ? x : layer.align === 'right' ? x - textWidth : x - textWidth / 2;
          ctx.save(); ctx.shadowColor = 'transparent'; ctx.fillRect(underlineX, y + size * .45, textWidth, Math.max(1, size / 16)); ctx.restore();
        }
      }
    } finally { ctx.restore(); }
  }
}
