import { useEffect, useRef } from 'react';
import { useEditor } from '../store/editor';
import { formatTime, seekVideo } from '../lib/media';
import type { LoadedMedia } from '../lib/media';

export default function FramePicker({ media }: { media: LoadedMedia }) {
  const playhead = useEditor(s => s.playhead);
  const setPlayhead = useEditor(s => s.setPlayhead);
  const busy = useEditor(s => ['preparing', 'rendering', 'optimizing'].includes(s.exportState));
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);
  const duration = media.meta.duration;

  useEffect(() => () => { if (pending.current) clearTimeout(pending.current); }, []);
  const chooseFrame = (time: number) => {
    const value = Math.min(Math.max(0, time), Math.max(0, duration - .001));
    setPlayhead(value);
    if (pending.current) clearTimeout(pending.current);
    if (media.element instanceof HTMLVideoElement) {
      pending.current = setTimeout(() => {
        if (media.element instanceof HTMLVideoElement) {
          void seekVideo(media.element, value).catch(() => {});
        }
      }, 70);
    }
  };
  return <div className="tool-panel frame-picker">
    <div className="panel-heading"><span>Select frame</span><span className="hint">{formatTime(playhead)}</span></div>
    <input type="range" aria-label="Select sticker frame" min={0} max={Math.max(.001, duration - .001)}
      step={0.01} value={playhead} onChange={e => chooseFrame(Number(e.target.value))} disabled={busy}/>
    <div className="frame-picker-times"><span>{formatTime(0)}</span><span>{formatTime(duration)}</span></div>
  </div>;
}
