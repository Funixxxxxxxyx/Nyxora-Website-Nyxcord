import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ArrowDown, ArrowUp, Copy, Plus, Trash2, Type, Upload } from 'lucide-react';
import { MAX_TEXT_LAYERS, useTextStore } from '../../features/text/textStore';
import FontPicker from './FontPicker';
import ColorPicker from './ColorPicker';
import { waitForTextFonts } from '../../features/text/fontRegistry';
import type { TextLayer } from '../../features/text/types';
import { importFont } from '../../features/text/fontRegistry';
import { useEditor } from '../../store/editor';

const num = (value: string, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
function Field({ title, children }: { title: string; children: ReactNode }) {
  return <label className="text-field"><span>{title}</span>{children}</label>;
}
function NumberField({ title, value, min, max, step = 1, update }: {
  title: string; value: number; min: number; max: number; step?: number; update(value: number): void;
}) {
  return <Field title={title}><input type="number" value={value} min={min} max={max} step={step}
    onChange={e => update(num(e.target.value, min))}/></Field>;
}

function TextProperties({ layer, update, isAnimated, durationMs }: {
  layer: TextLayer; update(patch: Partial<TextLayer>): void; isAnimated: boolean; durationMs: number;
}) {
  const [fontRevision, setFontRevision] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const operation = useRef(0);
  useEffect(() => () => { operation.current++; }, [layer.id]);
  const active = (token: number) => token === operation.current &&
    useTextStore.getState().layers.some(item => item.id === layer.id);
  const onFont = async (file?: File) => {
    if (!file) return;
    const token = ++operation.current;
    setLoading(true); setError(null);
    try {
      const entry = await importFont(file);
      if (active(token)) { setFontRevision(rev => rev + 1); update({ fontFamily: entry.family }); }
    } catch (e) { if (active(token)) setError(e instanceof Error ? e.message : 'Font import failed.'); }
    finally {
      if (active(token)) setLoading(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };
  const selectFont = (family: string) => {
    const token = ++operation.current;
    setLoading(true); setError(null);
    void waitForTextFonts([family]).then(() => { if (active(token)) update({ fontFamily: family }); })
      .catch(e => { if (active(token)) setError(e instanceof Error ? e.message : 'Font could not load.'); })
      .finally(() => { if (active(token)) setLoading(false); });
  };
  return <div className="text-properties" key={layer.id}>
    <Field title="Text"><textarea rows={3} maxLength={600} placeholder="Type your text here…" value={layer.text} onChange={e => update({ text: e.target.value })}/></Field>
    <div className="text-two-col">
      <FontPicker value={layer.fontFamily} importedRevision={fontRevision} onPick={selectFont}/>
      <NumberField title="Size (px)" value={layer.fontSize} min={6} max={512} update={v => update({ fontSize: v })}/>
    </div>
    <input ref={fileInput} type="file" hidden accept=".ttf,.otf,.woff,.woff2" onChange={e => void onFont(e.target.files?.[0])}/>
    <div className="text-format-toolbar" role="group" aria-label="Text formatting and fonts">
      <div className="text-toggle-row">
        <button type="button" title="Bold" aria-label="Bold" className={layer.bold ? 'selected' : ''} aria-pressed={layer.bold} onClick={() => update({ bold: !layer.bold })}><b>B</b></button>
        <button type="button" title="Italic" aria-label="Italic" className={layer.italic ? 'selected' : ''} aria-pressed={layer.italic} onClick={() => update({ italic: !layer.italic })}><i>I</i></button>
        <button type="button" title="Underline" aria-label="Underline" className={layer.underline ? 'selected' : ''} aria-pressed={layer.underline} onClick={() => update({ underline: !layer.underline })}><u>U</u></button>
      </div>
      <button type="button" className="button button-light text-import" onClick={() => fileInput.current?.click()} disabled={loading}>
        <Upload size={14}/>{loading ? 'Loading…' : 'Import font'}
      </button>
    </div>
    {error && <p className="text-error" role="alert">{error}</p>}
    <ColorPicker key={`${layer.id}-fill`} label="Text color" value={layer.color} onChange={color => update({ color })}/>
    <div className="text-two-col text-color-align">
      <Field title="Alignment"><select value={layer.align} onChange={e => update({ align: e.target.value as TextLayer['align'] })}>
        <option value="left">Left</option><option value="center">Center</option><option value="right">Right</option>
      </select></Field>
      <NumberField title="Rotation (°)" value={layer.rotation} min={-360} max={360} update={v => update({ rotation: v })}/>
      <NumberField title="Text box width (%)" value={Math.round(layer.width * 100)} min={8} max={100} update={v => update({ width: v / 100 })}/>
      <Field title="Text box height (%)">
        <input type="number" min={2} max={100} step={1} placeholder="Auto" value={layer.height === undefined ? '' : Math.round(layer.height * 100)}
          onChange={e => update({ height: e.target.value === '' ? undefined : Number(e.target.value) / 100 })}/>
      </Field>
    </div>
    <details className="text-style-details"><summary>Outline & shadow</summary>
      <div className="text-two-col text-color-grid">
        <NumberField title="Outline (px)" value={layer.outlineWidth} min={0} max={32} update={v => update({ outlineWidth: v })}/>
        <ColorPicker label="Outline color" value={layer.outlineColor} onChange={outlineColor => update({ outlineColor })}/>
        <NumberField title="Shadow blur" value={layer.shadowBlur} min={0} max={50} update={v => update({ shadowBlur: v })}/>
        <ColorPicker label="Shadow color" value={layer.shadowColor} onChange={shadowColor => update({ shadowColor })}/>
        <NumberField title="Shadow X" value={layer.shadowOffsetX} min={-100} max={100} update={v => update({ shadowOffsetX: v })}/>
        <NumberField title="Shadow Y" value={layer.shadowOffsetY} min={-100} max={100} update={v => update({ shadowOffsetY: v })}/>
      </div>
    </details>
    <details className="text-style-details"><summary>Background</summary>
      <Field title="Style"><select value={layer.background} onChange={e => update({ background: e.target.value as TextLayer['background'] })}>
        <option value="none">None</option><option value="solid">Solid</option><option value="rounded">Rounded</option>
      </select></Field>
      {layer.background !== 'none' && <div className="text-two-col text-color-grid">
        <ColorPicker label="Background color" value={layer.backgroundColor} onChange={backgroundColor => update({ backgroundColor })}/>
        <NumberField title="Opacity (%)" value={Math.round(layer.backgroundOpacity * 100)} min={0} max={100} update={v => update({ backgroundOpacity: v / 100 })}/>
        <NumberField title="Padding (px)" value={layer.padding} min={0} max={100} update={v => update({ padding: v })}/>
      </div>}
    </details>
    {isAnimated && <div className="text-duration">
      <Field title="Text duration"><select value={layer.timing} onChange={e => update({ timing: e.target.value as TextLayer['timing'] })}>
        <option value="entire">Entire clip</option><option value="custom">Custom duration</option>
      </select></Field>
      {layer.timing === 'custom' && <div className="text-two-col">
        <NumberField title="From (seconds)" value={layer.fromMs / 1000} min={0} max={durationMs / 1000} step={0.1} update={v => update({ fromMs: Math.max(0, Math.min(v * 1000, durationMs)) })}/>
        <NumberField title="To (seconds)" value={layer.toMs / 1000} min={0} max={durationMs / 1000} step={0.1} update={v => update({ toMs: Math.max(0, Math.min(v * 1000, durationMs)) })}/>
        {layer.toMs <= layer.fromMs && <p className="text-error">End must be later than start.</p>}
      </div>}
    </div>}
  </div>;
}

export default function TextPanel() {
  const layers = useTextStore(s => s.layers);
  const selectedId = useTextStore(s => s.selectedId);
  const store = useTextStore;
  const meta = useEditor(s => s.meta);
  const mode = useEditor(s => s.mode);
  const motion = useEditor(s => s.stickerMotion);
  const start = useEditor(s => s.trimStart);
  const end = useEditor(s => s.trimEnd);
  const selected = layers.find(l => l.id === selectedId);
  const isAnimated = meta?.kind !== 'image' && (mode === 'gif' || motion === 'animated');
  const durationMs = Math.max(0, (end - start) * 1000);
  return <div className="tool-panel text-panel">
    <p className="text-editor-hint">Click text to select. Drag the text to move, corners to scale, or edges to resize its width or height. Double-click to type. Click outside to deselect.</p>
    <div className="panel-heading"><span><Type size={16}/> Text layers</span>
      <button type="button" className="button button-primary text-add" disabled={layers.length >= MAX_TEXT_LAYERS} onClick={() => store.getState().add()}><Plus size={14}/> Add text</button>
    </div>
    {layers.length === 0 ? <p className="text-empty">Add text to place it on the image or video.</p> : <div className="text-layer-list">
      {layers.map((l, i) => <div key={l.id} className={`text-layer-row ${l.id === selectedId ? 'active' : ''}`}>
        <button type="button" className="text-layer-select" onClick={() => store.getState().select(l.id)} aria-pressed={l.id === selectedId}>
          <span>{i + 1}</span>{l.text.trim().slice(0, 28) || 'Empty text'}
        </button>
        <button type="button" title="Move down" aria-label="Move layer backward" disabled={i === 0} onClick={() => store.getState().move(l.id, -1)}><ArrowDown size={14}/></button>
        <button type="button" title="Move up" aria-label="Move layer forward" disabled={i === layers.length - 1} onClick={() => store.getState().move(l.id, 1)}><ArrowUp size={14}/></button>
        <button type="button" aria-label="Duplicate layer" disabled={layers.length >= MAX_TEXT_LAYERS} onClick={() => store.getState().duplicate(l.id)}><Copy size={14}/></button>
        <button type="button" aria-label="Delete layer" onClick={() => store.getState().remove(l.id)}><Trash2 size={14}/></button>
      </div>)}
    </div>}
    {selected && <TextProperties key={selected.id} layer={selected} update={patch => store.getState().update(selected.id, patch)} isAnimated={isAnimated} durationMs={durationMs}/>}
  </div>;
}
