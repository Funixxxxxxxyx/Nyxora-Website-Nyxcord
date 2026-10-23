import { Crop, RotateCcw, Scissors, ShieldCheck, SlidersHorizontal } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import CropSizeFields from './CropSizeFields';
import CanvasSizeFields from './CanvasSizeFields';
import FramePicker from './FramePicker';
import Timeline from './Timeline';
import { orientedCrop, useEditor } from '../store/editor';
import type { Tool } from '../store/editor';
import type { LoadedMedia } from '../lib/media';

const ratios = [['free', 'Free'], ['original', 'Original'], ['1:1', '1:1'],
  ['16:9', '16:9'], ['4:3', '4:3'], ['9:16', '9:16']] as const;
const tools = [
  { id: 'crop', label: 'Crop', icon: Crop },
  { id: 'trim', label: 'Trim', icon: Scissors },
  { id: 'resize', label: 'Resize', icon: SlidersHorizontal },
] as const satisfies ReadonlyArray<{ id: Tool; label: string; icon: typeof Crop }>;

export default function EditorControls({ media }: { media: LoadedMedia }) {
  const store = useEditor(useShallow(s => ({
    tool: s.tool, mode: s.mode, stickerMotion: s.stickerMotion,
    crop: s.crop, ratio: s.ratio, rotation: s.rotation, sizeAuto: s.sizeAuto,
    outputWidth: s.outputWidth, outputHeight: s.outputHeight,
    setTool: s.setTool, setRatio: s.setRatio, resetCrop: s.resetCrop,
    setSizeAuto: s.setSizeAuto, setWidth: s.setWidth,
  })));
  const busy = useEditor(s => ['preparing', 'rendering', 'optimizing'].includes(s.exportState));
  const staticFrame = store.mode === 'sticker' && store.stickerMotion === 'static';
  const native = orientedCrop(store.crop, store.rotation);

  return <fieldset className="controls-fieldset" disabled={busy}>
    <div className="editor-toolbar">
      <div className="tool-tabs">
        {tools.map(({ id, label, icon: Icon }) => {
          if (id === 'trim' && media.meta.kind === 'image') return null;
          return <button key={id} type="button" className={`tool-tab ${store.tool === id ? 'selected' : ''}`}
            aria-pressed={store.tool === id} onClick={() => store.setTool(id)}>
            <Icon size={15}/>{id === 'trim' && staticFrame ? 'Frame' : label}
          </button>;
        })}
      </div>
      <span className="tool-tip">{store.tool === 'crop' ? 'DRAG TO CROP' : store.tool === 'trim'
        ? staticFrame ? 'SELECT ONE FRAME' : 'SELECT TIME RANGE' : 'OUTPUT SIZE'}</span>
    </div>

    {store.tool === 'crop' && <div className="tool-panel crop-panel">
      <div className="panel-heading"><span><Crop size={16}/> Crop selection</span>
        <button type="button" className="text-button" onClick={store.resetCrop}><RotateCcw size={13}/> Reset</button>
      </div>
      <label className="field-title">Aspect ratio</label>
      <div className="ratio-selector">
        {ratios.map(([value, label]) => <button key={value} type="button"
          className={`ratio ${store.ratio === value ? 'active' : ''}`}
          aria-pressed={store.ratio === value} onClick={() => store.setRatio(value)}>{label}</button>)}
      </div>
      <CropSizeFields/>
      <div className="crop-info"><span>Selected area</span>
        <strong>{Math.round(native.width)} × {Math.round(native.height)} px</strong></div>
    </div>}

    {store.tool === 'trim' && (staticFrame ? <FramePicker media={media}/> : <Timeline media={media}/>)}

    {store.tool === 'resize' && <div id="nyx-resize-panel" className="tool-panel resize-panel">
      <div className="panel-heading"><span><SlidersHorizontal size={16}/> Canvas size</span>
        <button type="button" className="text-button" onClick={store.setSizeAuto} disabled={store.sizeAuto}>
          <RotateCcw size={13}/> Reset size
        </button>
      </div>
      <CanvasSizeFields />
      <label className="resize-scale">
        <span>Scale <strong>{Math.round(100 * store.outputWidth / Math.max(1, native.width))}%</strong></span>
        <input type="range" min="1" max="100" step="1"
          aria-label="Output scale percentage"
          value={Math.max(1, Math.min(100, Math.round(100 * store.outputWidth / Math.max(1, native.width))))}
          onChange={e => store.setWidth(native.width * Number(e.target.value) / 100)} />
      </label>
      <div className="canvas-size-caption"><span className={`auto-dot ${store.sizeAuto ? 'selected' : ''}`}/>
        {store.sizeAuto ? 'Auto' : 'Custom'}<span>Max {Math.floor(native.width)} × {Math.floor(native.height)}</span>
      </div>
      <div className="panel-footnote"><ShieldCheck size={14}/> No upscaling.</div>
    </div>}
  </fieldset>;
}
