import { useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { Clock3, Scissors } from 'lucide-react';
import { useEditor } from '../store/editor';
import { drawSource, formatTime, seekVideo } from '../lib/media';
import type { LoadedMedia } from '../lib/media';
export default function Timeline({ media }: {
    media: LoadedMedia;
}) {
    const meta = useEditor(s => s.meta);
    const trimStart = useEditor(s => s.trimStart);
    const trimEnd = useEditor(s => s.trimEnd);
    const playhead = useEditor(s => s.playhead);
    const mode = useEditor(s => s.mode);
    const stickerMotion = useEditor(s => s.stickerMotion);
    const setTrim = useEditor(s => s.setTrim);
    const setPlayhead = useEditor(s => s.setPlayhead);
    const [thumbs, setThumbs] = useState<string[]>([]);
    const [maxDuration, setMaxDuration] = useState('');
    const active = useRef<'start' | 'end' | 'move' | 'playhead' | null>(null);
    const gesture = useRef({ start: 0, end: 0, x: 0 });
    const bar = useRef<HTMLDivElement>(null);
    const duration = meta?.duration ?? 0;
    useEffect(() => {
        if (!meta || meta.kind === 'image')
            return;
        let stopped = false;
        const aborter = new AbortController();
        const source = media;
        const createThumbs = async () => {
            const canvas = document.createElement('canvas');
            canvas.width = 118;
            canvas.height = 70;
            const ctx = canvas.getContext('2d');
            if (!ctx)
                return;
            const screenshots: string[] = [];
            // Use an independent video element: thumbnail seeking must never disturb playback.
            let video: HTMLVideoElement | null = null;
            let allocatedVideo: HTMLVideoElement | null = null;
            if (source.meta.kind === 'video') {
                video = document.createElement('video');
                allocatedVideo = video;
                video.muted = true;
                video.preload = 'auto';
                video.playsInline = true;
                const metadata = new Promise<void>((resolve, reject) => {
                    let finished = false;
                    const done = (error?: Error) => {
                        if (finished) return;
                        finished = true;
                        clearTimeout(timeout);
                        if (error) reject(error); else resolve();
                    };
                    const timeout = setTimeout(() => done(new Error('Timeline timed out.')), 8000);
                    aborter.signal.addEventListener('abort', () => done(new Error('Cancelled.')), { once: true });
                    video!.addEventListener('loadedmetadata', () => done(), { once: true });
                    video!.addEventListener('error', () => done(new Error('Timeline decode unavailable.')), { once: true });
                });
                video.src = source.url;
                video.load();
                try {
                    await metadata;
                }
                catch {
                    video = null;
                }
            }
            for (let i = 0; i < 9; i++) {
                if (stopped)
                    break;
                const t = Math.min(duration - .001, (i + .5) * duration / 9);
                try {
                    if (source.meta.kind === 'video' && !video)
                        break;
                    if (video)
                        await seekVideo(video, t, aborter.signal);
                    if (video)
                        ctx.drawImage(video, 0, 0, 118, 70);
                    else
                        drawSource(ctx, source, t, 0, 0, 118, 70);
                    screenshots.push(canvas.toDataURL('image/jpeg', .64));
                }
                catch {
                    break;
                }
            }
            if (allocatedVideo) {
                allocatedVideo.pause();
                allocatedVideo.removeAttribute('src');
                allocatedVideo.load();
            }
            if (!stopped)
                setThumbs(screenshots);
            canvas.width = 0;
        };
        void createThumbs();
        return () => { stopped = true; aborter.abort(); };
    }, [media, meta, duration]);
    if (!meta || meta.kind === 'image')
        return null;
    const left = trimStart / duration * 100, right = (1 - trimEnd / duration) * 100;
    const play = playhead / duration * 100;
    const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>, type: 'start' | 'end' | 'move' | 'playhead') => {
        e.preventDefault();
        e.stopPropagation();
        active.current = type;
        gesture.current = { start: trimStart, end: trimEnd, x: e.clientX };
        bar.current?.setPointerCapture(e.pointerId);
    };
    const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
        if (!active.current || !bar.current)
            return;
        const width = bar.current.getBoundingClientRect().width;
        const offset = (e.clientX - gesture.current.x) / width * duration;
        if (active.current === 'start')
            setTrim(Math.max(0, Math.min(gesture.current.end - .1, gesture.current.start + offset)), gesture.current.end);
        else if (active.current === 'end')
            setTrim(gesture.current.start, Math.max(gesture.current.start + .1, gesture.current.end + offset));
        else if (active.current === 'move') {
            const span = gesture.current.end - gesture.current.start;
            const start = Math.max(0, Math.min(duration - span, gesture.current.start + offset));
            setTrim(start, start + span);
        }
        else {
            const t = Math.max(0, Math.min(duration, (e.clientX - bar.current.getBoundingClientRect().left) / width * duration));
            setPlayhead(t);
            if (media.element instanceof HTMLVideoElement)
                media.element.currentTime = t;
        }
    };
    const onPointerUp = () => { active.current = null; };
    const changeStart = (v: number) => setTrim(v, Math.max(v + .1, trimEnd));
    const changeEnd = (v: number) => setTrim(trimStart, v);
    const applyDuration = (value: string) => {
        setMaxDuration(value);
        const target = Number(value);
        if (value !== '' && Number.isFinite(target) && target >= .1 && target <= duration)
            setTrim(trimStart, Math.min(trimEnd, trimStart + target));
    };
    return <div className="tool-panel timeline-panel">
    <div className="panel-heading"><span><Scissors size={16}/> Trim timeline</span><span className="hint">{formatTime(duration)} total</span></div>
    <div ref={bar} className="filmstrip" onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
      {thumbs.length ? thumbs.map((src, i) => <img key={i} alt="" draggable={false} src={src}/>) : Array.from({ length: 9 }, (_, i) => <div className="thumb-placeholder" key={i}/>)}
      <div className="timeline-dim" style={{ left: 0, width: `${left}%` }}/>
      <div className="timeline-dim" style={{ right: 0, width: `${right}%` }}/>
      <div className="timeline-selected" style={{ left: `${left}%`, right: `${right}%` }} onPointerDown={e => onPointerDown(e, 'move')}/>
      <div className="trim-handle trim-start" style={{ left: `${left}%` }} onPointerDown={e => onPointerDown(e, 'start')}><span /></div>
      <div className="trim-handle trim-end" style={{ left: `${100 - right}%` }} onPointerDown={e => onPointerDown(e, 'end')}><span /></div>
      <div className="timeline-playhead" style={{ left: `${play}%` }} onPointerDown={e => onPointerDown(e, 'playhead')}/>
    </div>
    <div className="timeline-ticks"><span>0:00</span><span>{formatTime(duration / 2).slice(0, 5)}</span><span>{formatTime(duration).slice(0, 5)}</span></div>
    <div className="field-grid three-fields">
      <label className="field"><span>Start (sec)</span><input type="number" min="0" max={duration - .1} step="0.1" value={Number(trimStart.toFixed(2))} onChange={e => changeStart(Number(e.target.value))}/></label>
      <label className="field"><span>End (sec)</span><input type="number" min="0.1" max={duration} step="0.1" value={Number(trimEnd.toFixed(2))} onChange={e => changeEnd(Number(e.target.value))}/></label>
      <label className="field"><span>Max duration (sec)</span><input type="number" min="0.1" max={mode === 'sticker' && stickerMotion === 'animated' ? 5 : duration} step="0.1" placeholder={mode === 'sticker' && stickerMotion === 'animated' ? '5.0' : 'Optional'} value={maxDuration} onChange={e => applyDuration(e.target.value)}/></label>
    </div>
    <div className="panel-footnote"><Clock3 size={13}/><span>Selected {formatTime(trimEnd - trimStart)} {mode === 'sticker' && stickerMotion === 'animated' ? '· 5 seconds max for Nyxcord sticker preset' : ''}</span></div>
  </div>;
}
