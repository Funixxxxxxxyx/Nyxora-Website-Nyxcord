import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { Check, Pipette } from 'lucide-react';
import { hexToHsv, hsvToHex, normalizeHex, withHue } from '../../features/text/color';
import type { HsvColor } from '../../features/text/color';

const PRESETS = ['#FFFFFF', '#17181E', '#5865F2', '#FF5C77', '#FFBE55', '#34D5C5', '#52A7FF', '#A782FF'];
const recentColors: string[] = [];

function rememberColor(value: string) {
  const hex = normalizeHex(value);
  if (!hex) return;
  const found = recentColors.indexOf(hex);
  if (found >= 0) recentColors.splice(found, 1);
  recentColors.unshift(hex);
  if (recentColors.length > 8) recentColors.length = 8;
}

interface Props {
  label: string;
  value: string;
  onChange(value: string): void;
}

/** Standalone controlled picker. Pointer changes are committed at most once per animation frame. */
export default function ColorPicker({ label, value, onChange }: Props) {
  const id = useId();
  const safeValue = normalizeHex(value) ?? '#FFFFFF';
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(safeValue);
  const [hexError, setHexError] = useState(false);
  const [hsv, setHsv] = useState<HsvColor>(() => hexToHsv(safeValue));
  const hsvRef = useRef(hsv);
  const [recentRevision, setRecentRevision] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const currentValue = useRef(safeValue);
  currentValue.current = safeValue;
  const area = useRef<HTMLDivElement>(null);
  const activePointer = useRef<number | null>(null);
  const raf = useRef<number | null>(null);
  const pending = useRef<string | null>(null);
  const latestCallback = useRef(onChange);
  latestCallback.current = onChange;
  const displayedColor = hsvToHex(hsv);

  useEffect(() => {
    // Preserve the currently dragged color until its queued frame is delivered.
    if (pending.current && safeValue !== pending.current) return;
    setDraft(safeValue);
    setHexError(false);
    setHsv(old => {
      const next = hexToHsv(safeValue);
      if (next.s === 0) next.h = hsvRef.current.h;
      hsvRef.current = next;
      return next;
    });
  }, [safeValue]);

  useEffect(() => () => {
    if (raf.current !== null) cancelAnimationFrame(raf.current);
  }, []);

  useEffect(() => {
    if (!open) return;
    const dismiss = (event: globalThis.PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const key = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') { setOpen(false); trigger.current?.focus(); }
    };
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('pointerdown', dismiss);
      document.removeEventListener('keydown', key);
    };
  }, [open]);

  const emit = useCallback((hex: string, throttled: boolean) => {
    const normalized = normalizeHex(hex);
    if (!normalized) return;
    if (!throttled && normalized === currentValue.current && raf.current === null) return;
    pending.current = normalized;
    if (!throttled) {
      if (raf.current !== null) cancelAnimationFrame(raf.current);
      raf.current = null;
      pending.current = null;
      latestCallback.current(normalized);
      return;
    }
    if (raf.current !== null) return;
    raf.current = requestAnimationFrame(() => {
      raf.current = null;
      const next = pending.current;
      pending.current = null;
      if (next) latestCallback.current(next);
    });
  }, []);

  const changeHsv = (next: HsvColor, throttled = true) => {
    hsvRef.current = next;
    setHsv(next);
    const hex = hsvToHex(next);
    setDraft(hex);
    emit(hex, throttled);
  };

  const fromPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    const bounds = area.current?.getBoundingClientRect();
    if (!bounds || !bounds.width || !bounds.height) return;
    changeHsv({ ...hsvRef.current, s: Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)),
      v: 1 - Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height)) });
  };

  const setHex = (hex: string) => {
    setDraft(hex);
    setHexError(false);
    // Avoid auto-expanding a half-typed #RGB into #RRGGBB while entering six digits.
    // Three-digit shorthand is accepted on blur or paste, not mid-keystroke.
    const normalized = /^#?[0-9a-f]{6}$/i.test(hex.trim()) ? normalizeHex(hex) : null;
    if (normalized) {
      const next = hexToHsv(normalized);
      if (next.s === 0) next.h = hsvRef.current.h;
      hsvRef.current = next;
      setHsv(next);
      emit(normalized, false);
    }
  };

  const commitHex = () => {
    const normalized = normalizeHex(draft);
    if (!normalized) { setHexError(true); return; }
    setHexError(false);
    setDraft(normalized);
    const next = hexToHsv(normalized);
    if (next.s === 0) next.h = hsvRef.current.h;
    hsvRef.current = next;
    setHsv(next);
    emit(normalized, false);
    rememberColor(normalized);
    setRecentRevision(old => old + 1);
  };

  const choose = (hex: string) => {
    setHexError(false);
    setDraft(hex);
    const next = hexToHsv(hex);
    if (next.s === 0) next.h = hsvRef.current.h;
    hsvRef.current = next;
    setHsv(next);
    emit(hex, false);
    rememberColor(hex);
    setRecentRevision(old => old + 1);
  };

  const finish = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (activePointer.current !== event.pointerId) return;
    activePointer.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    // Ensure the last pointer position is included even if the user releases within a frame.
    const last = pending.current ?? hsvToHex(hsvRef.current);
    if (pending.current) emit(pending.current, false);
    rememberColor(last);
    setRecentRevision(old => old + 1);
  };


  return <div className="nx-color-picker" ref={root}>
    <span className="text-field-title" id={`${id}-label`}>{label}</span>
    <div className="nx-color-inline">
      <button type="button" ref={trigger} className="nx-color-swatch" aria-label={`${open ? 'Close' : 'Open'} ${label.toLowerCase()} color palette`}
        aria-haspopup="true" aria-expanded={open} aria-controls={open ? `${id}-panel` : undefined} onClick={() => setOpen(!open)}>
        <span style={{ backgroundColor: displayedColor }}/><Pipette size={15}/>
      </button>
      <input type="text" className="nx-color-hex" aria-label={`${label} hex code`}
        value={draft} maxLength={7} spellCheck={false} placeholder="#RRGGBB"
        aria-invalid={hexError} aria-describedby={hexError ? `${id}-error` : undefined}
        onChange={e => setHex(e.target.value)} onBlur={commitHex}
        onKeyDown={event => {
          if (event.key === 'Escape') { setDraft(safeValue); setHexError(false); event.currentTarget.blur(); }
          if (event.key === 'Enter') { if (normalizeHex(draft)) event.currentTarget.blur(); else commitHex(); }
        }}/>
    </div>
    {hexError && <span id={`${id}-error`} className="nx-color-error" role="alert">Use a HEX color such as #5865F2.</span>}
    {open && <div className="nx-color-panel" id={`${id}-panel`} role="group" aria-labelledby={`${id}-label`}>
      <div className="nx-color-area" ref={area}
        role="img" aria-label={`Drag to pick a color. Saturation ${Math.round(hsv.s * 100)} percent, brightness ${Math.round(hsv.v * 100)} percent.`}
        style={{ backgroundColor: `hsl(${hsv.h} 100% 50%)` }}
        onPointerDown={event => {
          if (event.button !== 0 && event.pointerType === 'mouse') return;
          activePointer.current = event.pointerId;
          event.currentTarget.setPointerCapture(event.pointerId);
          fromPointer(event);
        }}
        onPointerMove={event => { if (activePointer.current === event.pointerId) fromPointer(event); }}
        onPointerUp={finish} onPointerCancel={finish}>
        <span className="nx-color-area-white"/><span className="nx-color-area-black"/>
        <span className="nx-color-area-cursor" style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%` }}/>
      </div>
      <div className="nx-color-axes" role="group" aria-label="Keyboard accessible color adjustment">
        <label>Saturation
          <input type="range" min="0" max="100" step="1" value={Math.round(hsv.s * 100)}
            aria-label={`${label} saturation`} onChange={event => changeHsv({ ...hsvRef.current, s: Number(event.target.value) / 100 })}/>
        </label>
        <label>Brightness
          <input type="range" min="0" max="100" step="1" value={Math.round(hsv.v * 100)}
            aria-label={`${label} brightness`} onChange={event => changeHsv({ ...hsvRef.current, v: Number(event.target.value) / 100 })}/>
        </label>
      </div>
      <div className="nx-color-hue-row">
        <input type="range" className="nx-color-hue" min="0" max="359" step="1" value={Math.round(hsv.h)}
          aria-label="Hue" onChange={e => changeHsv(withHue(hsvRef.current, Number(e.target.value)))}/>
        <span className="nx-color-current" style={{ backgroundColor: displayedColor }} aria-label={`Current color ${displayedColor}`}/>
      </div>
      <div className="nx-color-presets" role="group" aria-label="Preset colors">
        {PRESETS.map(hex => <button type="button" key={hex} title={hex} aria-label={`Select ${hex}`}
          className={safeValue === hex ? 'is-active' : ''} onClick={() => choose(hex)}
          style={{ backgroundColor: hex }}>{safeValue === hex && <Check size={14} color={hex === '#FFFFFF' || hex === '#FFBE55' ? '#15161C' : '#FFFFFF'}/>}</button>)}
      </div>
      {recentColors.length > 0 && <div className="nx-color-recent" key={recentRevision}>
        <span>Recent</span><div className="nx-color-presets">
          {recentColors.map(hex => <button type="button" key={hex} title={hex} aria-label={`Recent ${hex}`}
            onClick={() => choose(hex)} style={{ backgroundColor: hex }}/>) }
        </div>
      </div>}
    </div>}
  </div>;
}
