import { ArrowDownToLine, ArrowRight, CheckCircle2, CircleAlert, Info, ShieldCheck } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useEditor } from '../store/editor';
import { formatBytes } from '../lib/media';
import { exportPlan } from '../lib/exportPlan';
import ResultPreview from './ResultPreview';
import DownloadMenu from './DownloadMenu';
import type { ExportResult } from '../store/editor';
import type { LoadedMedia } from '../lib/media';

type Props = {
  media: LoadedMedia;
  loading: boolean;
  working: boolean;
  beginExport: () => Promise<void>;
  cancel: () => void;
  download: (format: ExportResult['format']) => void;
  prepareFormat: (format: 'gif' | 'apng') => void;
  availableFormats: ExportResult['format'][];
};

export default function ExportControls({
  media, loading, working, beginExport, cancel, download, prepareFormat, availableFormats,
}: Props) {
  const state = useEditor(useShallow(s => ({
    mode: s.mode,
    progress: s.progress,
    progressText: s.progressText,
    error: s.error,
    result: s.result,
    exportState: s.exportState,
    setProcess: s.setProcess,
    trimStart: s.trimStart, trimEnd: s.trimEnd, fpsMode: s.fpsMode,
    outputWidth: s.outputWidth, outputHeight: s.outputHeight,
    crop: s.crop, rotation: s.rotation, stickerMotion: s.stickerMotion,
  })));
  const result = state.result;
  const stale = !!result && state.exportState !== 'complete';
  let frameWarning: string | null = null;
  try {
    const plan = exportPlan(media.meta, useEditor.getState());
    if (plan.wasFrameReduced)
      frameWarning = `Selected duration will export at about ${plan.fps.toFixed(1)} FPS to limit frame count.`;
  } catch { /* Invalid dimensions are reported when Create is pressed. */ }

  return <>
    <div className="export-area">
      <button
        type="button"
        className="button button-primary create-button"
        disabled={loading || working}
        onClick={() => void beginExport()}
      >
        {working ? <>
          <span className="spinner"/> Processing... <span>{state.progress}%</span>
        </> : <>
          <ArrowDownToLine size={18}/>
          Create {state.mode === 'gif' ? 'GIF' : 'Sticker'}
          <ArrowRight size={17}/>
        </>}
      </button>
      {working && <>
        <div
          className="progress-track"
          role="progressbar"
          aria-label="Export progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={state.progress}
        >
          <div style={{ width: `${state.progress}%` }}/>
        </div>
        <div className="progress-meta">
          <span>{state.progressText}</span>
          <button type="button" onClick={() => {
            cancel();
            state.setProcess('idle');
          }}>Cancel</button>
        </div>
      </>}
      {frameWarning && !working && <p className="result-note" role="status">{frameWarning}</p>}
      {state.error && <div className="alert-banner" role="alert">
        <CircleAlert size={16}/><span>{state.error}</span>
      </div>}
      {!working && <div className="export-hint">
        <ShieldCheck size={14}/> Export time depends on the clip and device
      </div>}
    </div>

    {result && <section className="result-panel">
      <div className="result-title">
        <div>
          <CheckCircle2 size={20}/>
          <strong>{stale ? 'Previous export' : 'Export complete'}</strong>
        </div>
        <span className={`result-badge ${result.compliant ? 'ready' : 'warning'}`}>
          {result.compliant ? 'WITHIN TARGET' : 'CHECK FILE SIZE'}
        </span>
      </div>
      <div className="result-body">
        <ResultPreview result={result}/>
        <div className="result-data">
          <span>FORMAT <b>{result.format.toUpperCase()}</b></span>
          <span>RESOLUTION <b>{result.width} × {result.height}</b></span>
          <span>FILE SIZE <b>{formatBytes(result.size)}</b></span>
          <span>EXPORT TIME <b>{(result.elapsedMs / 1000).toFixed(2)}s</b></span>
          {result.duration > 0 && <>
            <span>DURATION <b>{result.duration.toFixed(2)}s</b></span>
            <span>FRAME RATE <b>{result.fps.toFixed(1)} FPS</b></span>
          </>}
        </div>
      </div>
      {result.notes.map((note, i) => <p className="result-note" key={i}>
        <Info size={14}/>{note}
      </p>)}
      {stale && <p className="result-note">
        <Info size={14}/> Settings changed. Regenerate to apply them.
      </p>}
      <DownloadMenu
        result={result}
        stale={stale}
        working={working}
        download={download}
        prepareFormat={prepareFormat}
        availableFormats={availableFormats}
      />
    </section>}
  </>;
}
