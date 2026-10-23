import { useState } from 'react';
import { Check, ChevronDown, Film, Image, Settings2 } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useEditor } from '../store/editor';
import type { FpsMode, Mode, QualityMode, StickerMotion } from '../store/editor';
import type { LoadedMedia } from '../lib/media';


export default function OutputSettings({ media }: { media: LoadedMedia }) {
  const [advanced, setAdvanced] = useState(false);
  const store = useEditor(useShallow(s => ({
    mode: s.mode, stickerMotion: s.stickerMotion, fpsMode: s.fpsMode,
    qualityMode: s.qualityMode, sizeTargetMB: s.sizeTargetMB,
    setMode: s.setMode, setStickerMotion: s.setStickerMotion,
    setTool: s.setTool, setFpsMode: s.setFpsMode,
    setQualityMode: s.setQualityMode, setTarget: s.setTarget,
    outputWidth: s.outputWidth, outputHeight: s.outputHeight,
  })));
  const busy = useEditor(s => ['preparing', 'rendering', 'optimizing'].includes(s.exportState));
  const moving = media.meta.kind !== 'image';
  const sticker = store.mode === 'sticker';
  const setOutput = (mode: Mode) => {
    store.setMode(mode);
    if (mode === 'sticker' && moving) store.setTool('trim');
  };
  const setMotion = (motion: StickerMotion) => {
    store.setStickerMotion(motion);
    store.setTool('trim');
  };

  return <fieldset className="controls-fieldset" disabled={busy}>
    {moving && <section className="output-section">
      <div className="section-header"><span className="step">01</span><h3>Output format</h3></div>
      <div className="format-grid" role="group" aria-label="Output format">
        <button type="button" className={`format-card ${!sticker ? 'active' : ''}`} aria-pressed={!sticker} onClick={() => setOutput('gif')}>
          <span className="format-icon"><Film size={20}/></span>
          <span className="format-name">GIF</span>
          <span className="format-check">{!sticker && <Check size={14}/>}</span>
        </button>
        <button type="button" className={`format-card ${sticker ? 'active' : ''}`} aria-pressed={sticker} onClick={() => setOutput('sticker')}>
          <span className="format-icon"><Image size={20}/></span>
          <span className="format-name">Sticker</span>
          <span className="format-check">{sticker && <Check size={14}/>}</span>
        </button>
      </div>
      {sticker && <div className="sticker-motion">
        <div className="field-title">Sticker type</div>
        <div className="mini-segment" role="group" aria-label="Sticker type">
          <button type="button" className={store.stickerMotion === 'static' ? 'active' : ''} aria-pressed={store.stickerMotion === 'static'} onClick={() => setMotion('static')}>Static frame</button>
          <button type="button" className={store.stickerMotion === 'animated' ? 'active' : ''} aria-pressed={store.stickerMotion === 'animated'} onClick={() => setMotion('animated')}>Animated clip</button>
        </div>
        {store.stickerMotion === 'static' && <p className="sticker-motion-note">Use the frame selected in the preview.</p>}
      </div>}
    </section>}
    <section className="settings-section">
      <div className="section-header"><span className="step">{moving ? '02' : '01'}</span><h3>Export settings</h3></div>
      <div className="canvas-settings canvas-size-summary">
        <div><span>Canvas size</span><strong>{store.outputWidth} × {store.outputHeight} px</strong></div>
        <button type="button" className="button button-light" onClick={() => {
          store.setTool('resize');
          requestAnimationFrame(() => document.getElementById('nyx-resize-panel')?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
        }}>Edit size</button>
      </div>
      {!sticker && moving && <>
        <div className="basic-settings">
          <label className="field"><span>Frame rate</span>
            <select value={store.fpsMode} onChange={e => store.setFpsMode(e.target.value === 'auto' ? 'auto' : Number(e.target.value) as FpsMode)}>
              <option value="auto">Auto</option>
              {[10, 15, 20, 24, 30].map(fps => <option key={fps} value={fps}>{fps} FPS</option>)}
            </select>
          </label>
          <label className="field"><span>Quality</span>
            <select value={store.qualityMode} onChange={e => store.setQualityMode(e.target.value as QualityMode)}>
              <option value="auto">Auto</option><option value="high">High</option>
              <option value="balanced">Balanced</option><option value="small">Small file</option>
            </select>
          </label>
        </div>
        <button type="button" className={`advanced-toggle ${advanced ? 'opened' : ''}`} aria-expanded={advanced} onClick={() => setAdvanced(v => !v)}>
          <span><Settings2 size={15}/> More options</span><ChevronDown size={16}/>
        </button>
        {advanced && <div className="advanced-panel">
          <label className="field max-size-field"><span>GIF target size</span>
            <select value={store.sizeTargetMB} onChange={e => store.setTarget(Number(e.target.value))}>
              {[2, 5, 10, 20, 50].map(n => <option key={n} value={n}>{n} MB</option>)}
            </select>
          </label>
          <div className="optimization-line"><Check size={15}/> Automatic compression</div>
        </div>}
      </>}
    </section>
  </fieldset>;
}
