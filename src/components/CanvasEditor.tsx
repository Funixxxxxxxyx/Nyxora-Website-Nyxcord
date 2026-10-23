import { useCallback, useEffect, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import type { PointerEvent as ReactPointerEvent, KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Crop, Eye, EyeOff, Maximize2, Pause, Play, RotateCcw, RotateCw } from 'lucide-react';
import { useEditor, ratioNumber } from '../store/editor';
import type { Rect } from '../store/editor';
import { drawProcessed, drawSource, formatTime, seekVideo } from '../lib/media';
import { drawRotatedView, rotateRect, rotatedSize, unrotateRect } from '../lib/rotation';
import { exportPlan } from '../lib/exportPlan';
import { draggedOutputWidth, resizePreviewGeometry } from '../lib/resizePreview';
import type { LoadedMedia } from '../lib/media';
type Handle = 'move' | 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'resize';
const handles: Array<Exclude<Handle, 'move' | 'resize'>> = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
function cropFromPointer(origin: Rect, handle: Handle, dx: number, dy: number, width: number, height: number, aspect: number | null): Rect {
    if (handle === 'move')
        return { ...origin, x: Math.max(0, Math.min(width - origin.width, origin.x + dx)), y: Math.max(0, Math.min(height - origin.height, origin.y + dy)) };
    const min = Math.min(24, width, height);
    let left = origin.x, right = origin.x + origin.width, top = origin.y, bottom = origin.y + origin.height;
    if (handle.includes('w'))
        left += dx;
    if (handle.includes('e'))
        right += dx;
    if (handle.includes('n'))
        top += dy;
    if (handle.includes('s'))
        bottom += dy;
    left = Math.max(0, Math.min(right - min, left));
    right = Math.min(width, Math.max(left + min, right));
    top = Math.max(0, Math.min(bottom - min, top));
    bottom = Math.min(height, Math.max(top + min, bottom));
    if (aspect) {
        const hor = handle.includes('e') || handle.includes('w');
        const ver = handle.includes('n') || handle.includes('s');
        let w = right - left;
        let h = bottom - top;
        if (hor && !ver)
            h = w / aspect;
        else if (ver && !hor)
            w = h * aspect;
        else if (Math.abs(dx) / Math.max(origin.width, 1) >= Math.abs(dy) / Math.max(origin.height, 1))
            h = w / aspect;
        else
            w = h * aspect;
        const anchorX = handle.includes('w') ? origin.x + origin.width : handle.includes('e') ? origin.x : origin.x + origin.width / 2;
        const anchorY = handle.includes('n') ? origin.y + origin.height : handle.includes('s') ? origin.y : origin.y + origin.height / 2;
        const maxW = Math.min(handle.includes('w') ? anchorX : handle.includes('e') ? width - anchorX : Math.min(anchorX, width - anchorX) * 2, (handle.includes('n') ? anchorY : handle.includes('s') ? height - anchorY : Math.min(anchorY, height - anchorY) * 2) * aspect);
        w = Math.max(Math.min(min, maxW), Math.min(w, maxW));
        h = w / aspect;
        left = handle.includes('w') ? anchorX - w : handle.includes('e') ? anchorX : anchorX - w / 2;
        top = handle.includes('n') ? anchorY - h : handle.includes('s') ? anchorY : anchorY - h / 2;
        right = left + w;
        bottom = top + h;
    }
    return { x: Math.max(0, left), y: Math.max(0, top), width: Math.max(1, right - left), height: Math.max(1, bottom - top) };
}
// The focus view adds a small margin around the crop so its handles remain visible.
// It is only a preview transform; exported pixels still use the original crop rectangle.
function cropFocusView(crop: Rect): Rect {
    const margin = 0.14;
    return {
        x: crop.x - crop.width * margin,
        y: crop.y - crop.height * margin,
        width: crop.width * (1 + 2 * margin),
        height: crop.height * (1 + 2 * margin),
    };
}
export default function CanvasEditor({ media }: {
    media: LoadedMedia;
}) {
    const { meta, crop, ratio, tool, preview, outputWidth, outputHeight, rotation, playhead, trimStart, trimEnd, mode, stickerMotion } = useEditor(useShallow(s => ({ meta: s.meta, crop: s.crop, ratio: s.ratio, tool: s.tool, preview: s.preview, outputWidth: s.outputWidth, outputHeight: s.outputHeight, rotation: s.rotation, playhead: s.playhead, trimStart: s.trimStart, trimEnd: s.trimEnd, mode: s.mode, stickerMotion: s.stickerMotion }))); 
    const setCrop = useEditor(s => s.setCrop);
    const setWidth = useEditor(s => s.setWidth);
    const setPlayhead = useEditor(s => s.setPlayhead);
    const setPreview = useEditor(s => s.setPreview);
    const resetCrop = useEditor(s => s.resetCrop);
    const rotate = useEditor(s => s.rotate);
    const busy = useEditor(s => ['preparing','rendering','optimizing'].includes(s.exportState));
    const [playing, setPlaying] = useState(false);
    const [focusCrop, setFocusCrop] = useState(false);
    const [heldView, setHeldView] = useState<Rect | null>(null);
    const dimensions = rotatedSize(meta?.width || 1, meta?.height || 1, rotation);
    const rotatedCrop = rotateRect(crop, meta?.width || 1, meta?.height || 1, rotation);
    const resizing = tool === 'resize' && !preview;
    const outputView = preview || resizing;
    // Invalid inputs should show a recoverable export error, not crash the editor.
    let plan: ReturnType<typeof exportPlan> | null = null;
    try { if (meta) plan = exportPlan(meta, useEditor.getState()); }
    catch { plan = null; }
    const sourceView: Rect = { x: 0, y: 0, ...dimensions };
    const view: Rect = !preview && tool === 'crop' && focusCrop ? (heldView ?? cropFocusView(rotatedCrop)) : sourceView;
    const canvas = useRef<HTMLCanvasElement>(null);
    const stage = useRef<HTMLDivElement>(null);
    const drag = useRef<{
        handle: Handle;
        x: number;
        y: number;
        crop: Rect;
        width: number;
        viewport: Rect;
        referenceWidth: number;
        nativeWidth: number;
    } | null>(null);
    const playingRef = useRef(false);
    const raf = useRef(0);
    const gifStart = useRef(0);
    const draw = useCallback((time: number) => {
        if (!canvas.current || !meta)
            return;
        const output = outputView;
        const realW = output ? (plan?.width ?? outputWidth) : view.width;
        const realH = output ? (plan?.height ?? outputHeight) : view.height;
        const scale = Math.min(3, 960 / Math.max(realW, realH));
        const w = Math.max(1, Math.round(realW * scale));
        const h = Math.max(1, Math.round(realH * scale));
        if (canvas.current.width !== w)
            canvas.current.width = w;
        if (canvas.current.height !== h)
            canvas.current.height = h;
        const ctx = canvas.current.getContext('2d');
        if (!ctx)
            return;
        if (output) {
            ctx.save();
            ctx.scale(w / realW, h / realH);
            drawProcessed(ctx, media, crop, time, realW, realH, 'contain', false, rotation);
            ctx.restore();
        }
        else {
            drawRotatedView(ctx, (x, y, sourceWidth, sourceHeight) => {
                drawSource(ctx, media, time, x, y, sourceWidth, sourceHeight);
            }, view, meta.width, meta.height, rotation, w, h);
        }
    }, [media, meta, outputView, outputWidth, outputHeight, crop, rotation, view.x, view.y, view.width, view.height, plan?.width, plan?.height]);
    const drawRef = useRef(draw);
    useEffect(() => { drawRef.current = draw; }, [draw]);
    useEffect(() => {
        draw(playhead);
        if (media.element instanceof HTMLVideoElement) {
            const video = media.element;
            video.addEventListener('seeked', onSeek);
            function onSeek() { draw(video.currentTime); }
            return () => video.removeEventListener('seeked', onSeek);
        }
    }, [draw, playhead, media]);
    useEffect(() => {
        playingRef.current = playing;
        if (!playing) {
            if (media.element instanceof HTMLVideoElement)
                media.element.pause();
            cancelAnimationFrame(raf.current);
            return;
        }
        if (media.element instanceof HTMLVideoElement) {
            const video = media.element;
            if (video.currentTime < trimStart || video.currentTime >= trimEnd)
                video.currentTime = trimStart;
            void video.play().catch(() => setPlaying(false));
        }
        gifStart.current = performance.now() - (playhead - trimStart) * 1000;
        let last = 0;
        let lastDraw = 0;
        const loop = (now: number) => {
            if (!playingRef.current) return;
            const exporting = ['preparing', 'rendering', 'optimizing'].includes(useEditor.getState().exportState);
            if (exporting) { setPlaying(false); return; }
            let time = playhead;
            if (media.element instanceof HTMLVideoElement) {
                time = media.element.currentTime;
                if (time >= trimEnd - 0.018) {
                    media.element.currentTime = trimStart;
                    time = trimStart;
                }
            }
            else if (media.meta.kind === 'gif') {
                const duration = Math.max(0.02, trimEnd - trimStart);
                time = trimStart + ((now - gifStart.current) / 1000) % duration;
            }
            if (now - lastDraw > 32) { drawRef.current(time); lastDraw = now; }
            if (now - last > 180) {
                useEditor.getState().setPlayhead(time);
                last = now;
            }
            raf.current = requestAnimationFrame(loop);
        };
        raf.current = requestAnimationFrame(loop);
        return () => { cancelAnimationFrame(raf.current); if (media.element instanceof HTMLVideoElement)
            media.element.pause(); };
        // Do not reinitialize playback on every playhead update.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [playing, media, trimStart, trimEnd]);
    useEffect(() => { setPlaying(false); }, [media, busy, mode, stickerMotion]);
    const seek = async (time: number) => {
        if (busy) return;
        setPlaying(false);
        setPlayhead(time);
        if (media.element instanceof HTMLVideoElement) {
            try {
                await seekVideo(media.element, time);
                draw(time);
            }
            catch { /* preview remains at last decoded frame */ }
        }
    };
    const beginDrag = (event: ReactPointerEvent, handle: Handle) => {
        if (!meta || !stage.current || preview || busy)
            return;
        event.preventDefault();
        event.stopPropagation();
        const bounds = stage.current.getBoundingClientRect();
        drag.current = { handle, x: event.clientX, y: event.clientY, crop: { ...rotatedCrop }, width: outputWidth, viewport: { ...view },
            referenceWidth: resizeGeometry.referenceWidth, nativeWidth: rotatedCrop.width };
        if (focusCrop)
            setHeldView({ ...view });
        (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
        // Bounds are measured on every pointer move to keep things correct after resize.
        if (bounds.width === 0)
            drag.current = null;
    };
    const onDrag = (event: ReactPointerEvent) => {
        if (!drag.current || !stage.current || !meta)
            return;
        const bounds = stage.current.getBoundingClientRect();
        const dx = (event.clientX - drag.current.x) * drag.current.viewport.width / bounds.width;
        const dy = (event.clientY - drag.current.y) * drag.current.viewport.height / bounds.height;
        if (drag.current.handle === 'resize') {
            const nextWidth = draggedOutputWidth(drag.current.width,
                event.clientX - drag.current.x, drag.current.nativeWidth, drag.current.referenceWidth);
            setWidth(nextWidth);
        }
        else {
            const chosen = ratioNumber(ratio, meta);
            const displayRatio = chosen && ratio === 'original' && (rotation === 90 || rotation === 270) ? 1 / chosen : chosen;
            const edited = cropFromPointer(drag.current.crop, drag.current.handle, dx, dy, dimensions.width, dimensions.height, displayRatio);
            setCrop(unrotateRect(edited, meta.width, meta.height, rotation));
        }
    };
    const stopDrag = () => { drag.current = null; setHeldView(null); };
    const moveCropWithKeyboard = (event: ReactKeyboardEvent<HTMLDivElement>) => {
        if (!meta || preview || busy) return;
        const step = event.shiftKey ? 10 : 1;
        const changes: Record<string, [number, number]> = {
            ArrowLeft: [-step, 0], ArrowRight: [step, 0],
            ArrowUp: [0, -step], ArrowDown: [0, step],
        };
        const delta = changes[event.key];
        if (!delta) return;
        event.preventDefault();
        event.stopPropagation();
        const updated = cropFromPointer(rotatedCrop, 'move', delta[0], delta[1],
            dimensions.width, dimensions.height, null);
        setCrop(unrotateRect(updated, meta.width, meta.height, rotation));
    };
    if (!meta)
        return null;
    const isAnimated = meta.kind !== 'image';
    const canvasRatio = outputView ? (plan?.width ?? outputWidth) / (plan?.height ?? outputHeight) : view.width / view.height;
    // Resize scales the displayed result, not the crop or its contents.
    const resizeGeometry = resizePreviewGeometry(outputWidth, outputHeight, rotatedCrop.width, rotatedCrop.height);
    const pxWidth = resizing ? resizeGeometry.width : Math.min(620, Math.max(1, 360 * canvasRatio));
    const left = (rotatedCrop.x - view.x) / view.width * 100, top = (rotatedCrop.y - view.y) / view.height * 100;
    const cw = rotatedCrop.width / view.width * 100, ch = rotatedCrop.height / view.height * 100;

    return (<section className="canvas-shell" aria-label="Live media canvas">
      <div className="canvas-topline">
        <span className="small-label">{outputView ? 'OUTPUT PREVIEW' : 'SOURCE CANVAS'} <span className="dot-spacer">·</span> {outputView ? `${plan?.width ?? outputWidth} × ${plan?.height ?? outputHeight}` : `${dimensions.width} × ${dimensions.height}`}</span>
        <div className="canvas-actions">
          {!preview && tool === 'crop' && <button className={`icon-text focus-button ${focusCrop ? 'is-active' : ''}`} onClick={() => { setHeldView(null); setFocusCrop(v => !v); }} title={focusCrop ? 'Fit full image' : 'Zoom to crop'} aria-pressed={focusCrop}><Maximize2 size={14}/> <span>{focusCrop ? 'Fit image' : 'Zoom to crop'}</span></button>}
          <div className="rotation-controls" role="group" aria-label="Rotate output">
            <button type="button" className="icon-text" disabled={busy} onClick={() => { setHeldView(null); rotate('left'); }} title="Rotate 90° counterclockwise" aria-label="Rotate 90 degrees counterclockwise"><RotateCcw size={15}/></button>
            <button type="button" className="icon-text" disabled={busy} onClick={() => { setHeldView(null); rotate('right'); }} title="Rotate 90° clockwise" aria-label="Rotate 90 degrees clockwise"><RotateCw size={15}/></button>
            <span className="rotation-value" aria-live="polite">{rotation}°</span>
          </div>
          <button className="icon-text ghost" onClick={resetCrop} title="Reset crop" disabled={preview || busy}><RotateCcw size={14}/> <span>Reset</span></button>
          <button className={`icon-text preview-button ${preview ? 'is-active' : ''}`} onClick={() => setPreview(!preview)} title={preview ? 'Back to editing' : 'Preview output'}>{preview ? <EyeOff size={15}/> : <Eye size={15}/>} <span>{preview ? 'Edit' : 'Preview'}</span></button>
        </div>
      </div>
      <div className="canvas-body">
        <div className="checkerboard" ref={stage} style={{ width: `min(100%, ${pxWidth}px)`, aspectRatio: String(canvasRatio) }}>
          <canvas className="media-canvas" ref={canvas} aria-label="Editing preview"/>
          {!preview && tool === 'crop' && <>
            <div className="crop-shade" style={{ left: 0, top: 0, width: '100%', height: `${top}%` }}/>
            <div className="crop-shade" style={{ left: 0, top: `${top + ch}%`, width: '100%', height: `${100 - top - ch}%` }}/>
            <div className="crop-shade" style={{ left: 0, top: `${top}%`, width: `${left}%`, height: `${ch}%` }}/>
            <div className="crop-shade" style={{ left: `${left + cw}%`, top: `${top}%`, width: `${100 - left - cw}%`, height: `${ch}%` }}/>
            <div className="crop-rect" role="group" aria-label="Crop selection. Use arrow keys to move; Shift moves 10 pixels" tabIndex={0} onKeyDown={moveCropWithKeyboard} style={{ left: `${left}%`, top: `${top}%`, width: `${cw}%`, height: `${ch}%` }} onPointerDown={e => beginDrag(e, 'move')} onPointerMove={onDrag} onPointerUp={stopDrag} onPointerCancel={stopDrag}>
              <div className="crop-grid"><i /><i /><i /><i /></div>
              {handles.map(h => <div key={h} className={`crop-handle h-${h}`} onPointerDown={e => beginDrag(e, h)} onPointerMove={onDrag} onPointerUp={stopDrag} onPointerCancel={stopDrag}/>)}
              <span className="crop-size">{Math.round(rotatedCrop.width)} × {Math.round(rotatedCrop.height)}</span>
            </div>
          </>}
          {resizing && <div className="resize-guide" aria-label="Resize output frame">
            <span className="resize-label">{outputWidth} × {outputHeight}</span>
            <div className="resize-grip" role="slider" tabIndex={0} aria-label="Drag to resize output"
              aria-valuemin={1} aria-valuemax={Math.floor(rotatedCrop.width)} aria-valuenow={outputWidth}
              onPointerDown={e => beginDrag(e, 'resize')} onPointerMove={onDrag}
              onPointerUp={stopDrag} onPointerCancel={stopDrag}
              aria-disabled={busy} onKeyDown={e => {
                if (busy) return;
                if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { e.preventDefault(); setWidth(outputWidth - (e.shiftKey ? 10 : 1)); }
                if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { e.preventDefault(); setWidth(outputWidth + (e.shiftKey ? 10 : 1)); }
              }}/>
          </div>}
        </div>
      </div>
      <div className="canvas-footer">
        {isAnimated ? <>
          <button className="play-control" disabled={busy} onClick={() => setPlaying(!playing)} aria-label={playing ? 'Pause' : 'Play'}>{playing ? <Pause size={16} fill="currentColor"/> : <Play size={16} fill="currentColor"/>}</button>
          <span className="timecode">{formatTime(playhead)} <span>/</span> {formatTime(meta.duration)}</span>
          <input className="scrub" disabled={busy} aria-label="Seek media" type="range" min={0} max={meta.duration} step={0.01} value={Math.min(playhead, meta.duration)} onChange={e => void seek(Number(e.target.value))}/>
        </> : <><Crop size={14}/><span>Drag the handles to frame your image</span></>}
        <Maximize2 className="footer-expand" size={14}/>
      </div>
    </section>);
}
