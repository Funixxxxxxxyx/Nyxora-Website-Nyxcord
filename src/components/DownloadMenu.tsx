import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Download } from 'lucide-react';
import type { ExportResult } from '../store/editor';

type FileFormat = ExportResult['format'];

type Props = {
  result: ExportResult;
  stale: boolean;
  working: boolean;
  download: (format: FileFormat) => void;
  prepareFormat: (format: 'gif' | 'apng') => void;
  availableFormats: FileFormat[];
};

export default function DownloadMenu({ result, stale, working, download, prepareFormat, availableFormats }: Props) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    root.current?.querySelector<HTMLButtonElement>('[role=menuitem]')?.focus();
    const onPointer = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setOpen(false); trigger.current?.focus(); }
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  useEffect(() => { setOpen(false); }, [result.url]);
  const animatedSticker = result.preset !== 'gif' && result.duration > 0;
  const formats: FileFormat[] = animatedSticker && !stale ? ['gif', 'apng'] : [result.format];
  const formatName = (format: FileFormat) => format === 'gif' ? 'GIF (.gif)' :
    format === 'apng' ? 'APNG (.png)' : 'PNG (.png)';

  return <div className="download-menu" ref={root}>
    <button ref={trigger} className="button button-download" type="button" aria-haspopup="menu"
      aria-expanded={open} disabled={working || (!result.compliant && result.preset !== 'gif')} aria-controls="download-format-menu" onClick={() => setOpen(current => !current)}>
      <Download size={18}/> Download <ChevronDown size={17}/>
    </button>
    {open && <div id="download-format-menu" className="download-options" role="menu" aria-label="Download format"
      onKeyDown={event => {
        if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
        event.preventDefault();
        const items = Array.from(root.current?.querySelectorAll<HTMLButtonElement>('[role=menuitem]') ?? []);
        const index = items.indexOf(document.activeElement as HTMLButtonElement);
        items[(index + (event.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length]?.focus();
      }}>
      {formats.map(format => <button key={format} type="button" role="menuitem"
        disabled={working || (!result.compliant && result.preset !== 'gif')}
        onClick={() => { setOpen(false); trigger.current?.focus(); if (availableFormats.includes(format)) download(format); else if (format !== 'png') prepareFormat(format); }}>
        <span>{availableFormats.includes(format) ? `Download ${formatName(format)}` : `Create ${formatName(format)}`}</span>
        {!availableFormats.includes(format) && <span className="download-convert">Prepare first</span>}
      </button>)}
    </div>}
  </div>;
}
