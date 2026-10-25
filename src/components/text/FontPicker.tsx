import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';
import { catalogFonts } from '../../features/text/fontCatalog';
import type { FontOption } from '../../features/text/fontCatalog';
import { listImportedFonts } from '../../features/text/fontRegistry';
import { ensureFontLoaded, isOnlineFontReady } from '../../features/text/fontLoader';

interface FontPickerProps {
  value: string;
  importedRevision: number;
  onPick(family: string): void;
}

export default function FontPicker({ value, importedRevision, onPick }: FontPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [installed, setInstalled] = useState<string[]>([]);
  const [systemError, setSystemError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [previewRevision, setPreviewRevision] = useState(0);
  const hoverTimer = useRef<number | null>(null);
  const closeTimer = () => { if (hoverTimer.current !== null) window.clearTimeout(hoverTimer.current); hoverTimer.current = null; };
  useEffect(() => () => closeTimer(), []);
  const previewFont = (font: FontOption, delay: number) => {
    if (font.category !== 'Online' || isOnlineFontReady(font.family)) return;
    closeTimer();
    hoverTimer.current = window.setTimeout(() => {
      hoverTimer.current = null;
      void ensureFontLoaded(font.family).then(() => setPreviewRevision(v => v + 1)).catch(() => {});
    }, delay);
  };
  void previewRevision;
  const choices = useMemo(() => catalogFonts(installed, listImportedFonts()), [installed, importedRevision]);
  const selected = choices.find(font => font.family === value);
  const matching = choices.filter(font => `${font.label} ${font.family}`.toLowerCase().includes(query.trim().toLowerCase()));
  const shown = matching.slice(0, 60);

  async function findInstalledFonts() {
    const finder = (window as Window & {
      queryLocalFonts?: () => Promise<Array<{ family: string }>>
    }).queryLocalFonts;
    if (!finder) { setSystemError('This browser cannot list installed fonts. Import a font file instead.'); return; }
    setScanning(true); setSystemError(null);
    try {
      const found = await finder.call(window);
      setInstalled([...new Set(found.map(f => f.family).filter(Boolean))].sort());
    } catch { setSystemError('Font access was not granted. You can still import a font file.'); }
    finally { setScanning(false); }
  }

  function choose(item: FontOption) {
    onPick(item.family);
    setOpen(false); setQuery('');
  }

  return <div className="font-picker" onBlur={e => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false);
  }}>
    <span className="text-field-title">Font</span>
    <button className="font-picker-trigger" type="button" aria-expanded={open}
      aria-label={`Font: ${selected?.label ?? value}. Change font`}
      onClick={() => setOpen(!open)}>
      <span className="font-picker-current">{selected?.label ?? value}</span><ChevronDown size={15}/>
    </button>
    {open && <div className="font-picker-menu">
      <div className="font-picker-search"><Search size={15}/><input autoFocus type="search" value={query}
        placeholder="Search fonts…" aria-label="Search fonts" onChange={e => setQuery(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Escape') { setOpen(false); e.preventDefault(); }
          if (e.key === 'Enter' && shown[0]) { choose(shown[0]); e.preventDefault(); }
        }}/></div>
      <div className="font-picker-results" role="group" aria-label="Matching fonts">
        {shown.map(font => {
          const canPreview = font.category !== 'Online' || isOnlineFontReady(font.family);
          return <button key={font.family} type="button"
            className={`font-picker-option ${font.family === value ? 'is-selected' : ''}`}
            onMouseDown={e => e.preventDefault()} onMouseEnter={() => previewFont(font, 300)}
            onMouseLeave={closeTimer} onFocus={() => previewFont(font, 0)}
            onBlur={closeTimer} onClick={() => choose(font)}>
            <span className="font-option-name">{font.label}<small>{font.category}</small></span>
            <span className={`font-option-preview ${canPreview ? '' : 'unavailable'}`}
              aria-hidden="true" style={canPreview ? { fontFamily: `"${font.family.replaceAll('"', '')}", sans-serif` } : undefined}>
              {canPreview ? 'Aa' : 'Preview on hover'}
            </span>
            {font.family === value && <Check size={14}/>}</button>;
        })}
        {matching.length === 0 && <p className="font-picker-empty">No matching fonts. You can import TTF, OTF, WOFF, or WOFF2.</p>}
        {matching.length > shown.length && <p className="font-picker-more">{matching.length - shown.length} more fonts. Refine your search.</p>}
      </div>
      <button type="button" className="font-picker-installed" onMouseDown={e => e.preventDefault()}
        disabled={scanning} onClick={() => void findInstalledFonts()}>
        {scanning ? 'Searching installed fonts…' : 'Find fonts installed on this device'}
      </button>
      {systemError && <p className="font-picker-empty" role="status">{systemError}</p>}
    </div>}
  </div>;
}
