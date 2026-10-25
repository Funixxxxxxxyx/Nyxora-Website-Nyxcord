import { memo, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent, KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useTextStore } from '../../features/text/textStore';
import type { TextLayer } from '../../features/text/types';
import { moveTextFromPointer, resizeTextFromSide, scaleTextFromCorner, scaleTextFromPointer } from '../../features/text/textGestures';
import type { TextCorner, TextSide, TextHandle, TextGestureOrigin } from '../../features/text/textGestures';
import { useEditor } from '../../store/editor';

type Gesture = 'move' | TextHandle;
interface ActiveGesture {
  type: Gesture;
  pointerId: number;
  x: number;
  y: number;
  origin: TextGestureOrigin;
}
const corners: TextCorner[] = ['nw', 'ne', 'sw', 'se'];
const sides: TextSide[] = ['n', 'e', 's', 'w'];

const EditableLayer = memo(function EditableLayer({ layer, selected, designWidth, designHeight, stageWidth, stageHeight }: {
  layer: TextLayer; selected: boolean; designWidth: number; designHeight: number;
  stageWidth: number; stageHeight: number;
}) {
  const select = useTextStore(s => s.select);
  const update = useTextStore(s => s.update);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const container = useRef<HTMLDivElement>(null);
  const gesture = useRef<ActiveGesture | null>(null);
  const frame = useRef<number | null>(null);
  const pending = useRef<Partial<TextLayer> | null>(null);
  const [editing, setEditing] = useState(false);
  const [resizeStatus, setResizeStatus] = useState('');

  const displayScale = Math.min(stageWidth / Math.max(1, designWidth), stageHeight / Math.max(1, designHeight));
  const fontSize = Math.max(.8, layer.fontSize * displayScale);
  const padding = layer.padding * displayScale;
  const stroke = layer.outlineWidth * displayScale;

  // A freshly created layer must be ready for immediate typing.
  useLayoutEffect(() => {
    if (selected && !layer.text) setEditing(true);
  }, [layer.id]);
  useLayoutEffect(() => {
    if (editing) textarea.current?.focus();
  }, [editing]);
  useLayoutEffect(() => {
    if (!selected) setEditing(false);
  }, [selected]);
  useLayoutEffect(() => {
    const el = textarea.current;
    if (!el) return;
    el.style.height = '0px';
    const naturalHeight = Math.max(fontSize * 1.2 + padding * 2, el.scrollHeight);
    el.style.height = `${naturalHeight}px`;
    if (container.current) container.current.style.minHeight = `${naturalHeight}px`;
  }, [layer.text, layer.width, layer.fontSize, layer.bold, layer.italic, layer.fontFamily, stageWidth, fontSize, padding, layer.height]);

  const flush = () => {
    if (frame.current !== null) { cancelAnimationFrame(frame.current); frame.current = null; }
    if (pending.current) { update(layer.id, pending.current); pending.current = null; }
  };
  useLayoutEffect(() => () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    pending.current = null;
  }, []);
  const queue = (patch: Partial<TextLayer>) => {
    pending.current = patch;
    if (frame.current !== null) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      const next = pending.current;
      pending.current = null;
      if (next) update(layer.id, next);
    });
  };
  const begin = (event: ReactPointerEvent<HTMLElement>, type: Gesture) => {
    if (event.button !== 0) return;
    // In editing mode, drag-select characters rather than dragging the layer.
    if (editing && type === 'move') return;
    if (layer.locked && type !== 'move') return;
    select(layer.id);
    if (layer.locked) return;
    event.preventDefault();
    event.stopPropagation();
    if (type === 'move') textarea.current?.focus({ preventScroll: true });
    const target = container.current;
    if (!target) return;
    gesture.current = {
      type, pointerId: event.pointerId, x: event.clientX, y: event.clientY,
      origin: {
        layer: { x: layer.x, y: layer.y, width: layer.width, height: layer.height, fontSize: layer.fontSize, rotation: layer.rotation },
        stageWidth, stageHeight, heightPx: container.current?.offsetHeight ?? fontSize * 1.2 + padding * 2,
        minHeightPx: textarea.current?.scrollHeight ?? fontSize * 1.2 + padding * 2,
      },
    };
    target.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const active = gesture.current;
    if (!active || active.pointerId !== event.pointerId) return;
    event.preventDefault();
    const dx = event.clientX - active.x;
    const dy = event.clientY - active.y;
    queue(active.type === 'move' ? moveTextFromPointer(active.origin, dx, dy) :
      sides.includes(active.type as TextSide) ? resizeTextFromSide(active.origin, active.type as TextSide, dx, dy) :
      scaleTextFromPointer(active.origin, active.type as TextCorner, dx, dy));
  };
  const finish = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (gesture.current?.pointerId !== event.pointerId) return;
    flush();
    gesture.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const onKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault(); event.stopPropagation();
      if (editing) { setEditing(false); textarea.current?.blur(); }
      else select(null);
      return;
    }
    if (editing || layer.locked) return;
    if (event.key === 'Enter' || event.key === 'F2') {
      event.preventDefault(); setEditing(true); return;
    }
    const arrows: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1],
    };
    const delta = arrows[event.key];
    if (!delta) return;
    event.preventDefault();
    const multiplier = event.shiftKey ? 10 : 1;
    update(layer.id, {
      x: layer.x + delta[0] * multiplier / Math.max(1, designWidth),
      y: layer.y + delta[1] * multiplier / Math.max(1, designHeight),
    });
  };
  const resizeByKeyboard = (event: ReactKeyboardEvent<HTMLButtonElement>, handle: TextHandle) => {
    if (layer.locked || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    const side = sides.includes(handle as TextSide) ? handle as TextSide : null;
    // Side handles adjust only their own axis. Corner handles retain proportional scaling.
    if (side && ((side === 'n' || side === 's') !==
      (event.key === 'ArrowUp' || event.key === 'ArrowDown'))) return;
    event.preventDefault();
    const amount = (event.shiftKey ? 10 : 2);
    const localX = event.key === 'ArrowRight' ? amount : event.key === 'ArrowLeft' ? -amount : 0;
    const localY = event.key === 'ArrowDown' ? amount : event.key === 'ArrowUp' ? -amount : 0;
    const radians = layer.rotation * Math.PI / 180;
    const dx = localX * Math.cos(radians) - localY * Math.sin(radians);
    const dy = localX * Math.sin(radians) + localY * Math.cos(radians);
    const origin: TextGestureOrigin = {
      layer, stageWidth, stageHeight,
      heightPx: container.current?.offsetHeight ?? fontSize * 1.2 + padding * 2,
      minHeightPx: textarea.current?.scrollHeight ?? fontSize * 1.2 + padding * 2,
    };
    const patch = side ? resizeTextFromSide(origin, side, dx, dy) :
      scaleTextFromPointer(origin, handle as TextCorner, dx, dy);
    update(layer.id, patch);
    setResizeStatus(`Text box width ${Math.round(patch.width * 100)} percent; height ${
      patch.height === undefined ? 'automatic' : Math.round(patch.height * 100) + ' percent'}; font ${
      Math.round('fontSize' in patch ? patch.fontSize as number : layer.fontSize)} pixels`);
  };

  const style: CSSProperties = {
    left: `${layer.x * 100}%`, top: `${layer.y * 100}%`, width: `${layer.width * 100}%`,
    height: layer.height === undefined ? undefined : `${layer.height * 100}%`,
    transform: `translate(-50%, -50%) rotate(${layer.rotation}deg)`,
  };
  const inputStyle: CSSProperties = {
    fontFamily: `"${layer.fontFamily.replaceAll('"', '')}", sans-serif`,
    fontSize: `${fontSize}px`, fontWeight: layer.bold ? 700 : 400,
    fontStyle: layer.italic ? 'italic' : 'normal', textAlign: layer.align,
    lineHeight: 1.2, color: layer.color, padding: `${padding}px`,
    WebkitTextStroke: stroke > 0 ? `${stroke * 2}px ${layer.outlineColor}` : undefined,
    paintOrder: 'stroke fill',
    textShadow: layer.shadowBlur || layer.shadowOffsetX || layer.shadowOffsetY
      ? `${layer.shadowOffsetX * displayScale}px ${layer.shadowOffsetY * displayScale}px ${layer.shadowBlur * displayScale}px ${layer.shadowColor}`
      : undefined,
    textDecoration: layer.underline ? 'underline' : 'none',
    background: 'transparent',
  };
  const backgroundStyle: CSSProperties = layer.background !== 'none' ? {
    backgroundColor: layer.backgroundColor, opacity: layer.backgroundOpacity,
    borderRadius: layer.background === 'rounded' ? `${Math.min(18, layer.fontSize / 3) * displayScale}px` : '0px',
  } : {};

  return <div ref={container} className={`text-edit-box ${selected ? 'active' : ''} ${editing ? 'editing' : ''} ${layer.locked ? 'locked' : ''}`}
    style={style} onPointerDown={event => begin(event, 'move')}
    onPointerMove={onPointerMove} onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={finish}
    onDoubleClick={event => {
      event.stopPropagation();
      if (!layer.locked) { select(layer.id); setEditing(true); }
    }}>
    {layer.background !== 'none' && <span className="text-edit-background" style={backgroundStyle} aria-hidden="true"/>}
    <textarea ref={textarea} className="text-edit-input" value={layer.text} rows={1} readOnly={!editing}
      placeholder={selected ? 'Type here…' : ''} maxLength={600} spellCheck={false}
      style={inputStyle} aria-label={editing ? 'Edit text on canvas' : 'Text layer; press Enter to edit, or drag to move'}
      onFocus={() => select(layer.id)} onBlur={() => { if (editing) setEditing(false); }}
      onPointerDown={event => { if (editing) event.stopPropagation(); }}
      onKeyDown={onKeyDown} onChange={event => { if (editing) update(layer.id, { text: event.target.value }); }}/>
    {selected && !layer.locked && !editing && <>
      {corners.map(corner => <button type="button" key={corner}
        className={`text-corner-grip corner-${corner}`} aria-label={`Resize text from ${corner} corner`}
        title="Drag a corner to scale text and font; arrow keys resize"
        onPointerDown={event => begin(event, corner)} onKeyDown={event => resizeByKeyboard(event, corner)}/>)}
      {sides.map(side => <button type="button" key={side}
        className={`text-side-grip side-${side}`} aria-label={`Resize text box from ${side === 'n' ? 'top' : side === 's' ? 'bottom' : side === 'e' ? 'right' : 'left'} edge`}
        title="Drag to resize the box without changing the font size; arrow keys adjust"
        onPointerDown={event => begin(event, side)} onKeyDown={event => resizeByKeyboard(event, side)}/>)}
      <span className="sr-only" role="status" aria-live="polite">{resizeStatus}</span>
    </>}
  </div>;
});

export default function TextOverlay({ designWidth, designHeight }: { designWidth: number; designHeight: number }) {
  const layers = useTextStore(s => s.layers);
  const selectedId = useTextStore(s => s.selectedId);
  const trimStart = useEditor(s => s.trimStart);
  const meta = useEditor(s => s.meta);
  const mode = useEditor(s => s.mode);
  const motion = useEditor(s => s.stickerMotion);
  const playhead = useEditor(s => s.playhead);
  const stage = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const element = stage.current;
    if (!element) return;
    const measure = () => {
      const rect = element.getBoundingClientRect();
      setDimensions(old => old.width === rect.width && old.height === rect.height ? old :
        { width: rect.width, height: rect.height });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const isAnimated = meta?.kind !== 'image' && (mode === 'gif' || motion === 'animated');
  const elapsedMs = Math.max(0, (playhead - trimStart) * 1000);
  return <div className="text-overlay" ref={stage} aria-label="Editable text layers">
    {dimensions.width > 0 && layers.filter(layer => !layer.hidden &&
      (!isAnimated || layer.timing === 'entire' || (elapsedMs >= layer.fromMs && elapsedMs < layer.toMs)))
      .map(layer => <EditableLayer key={layer.id} layer={layer} selected={selectedId === layer.id}
        designWidth={designWidth} designHeight={designHeight}
        stageWidth={dimensions.width} stageHeight={dimensions.height}/>)}
  </div>;
}
