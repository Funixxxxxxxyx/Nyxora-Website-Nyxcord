import { useEffect, useRef, useState } from 'react';
import { ArrowRight, CircleAlert, CloudUpload, Crop, FileImage, RotateCcw, Upload, X } from 'lucide-react';
import CanvasEditor from './components/CanvasEditor';
import BrandMark from './components/BrandMark';
import EditorControls from './components/EditorControls';
import OutputSettings from './components/OutputSettings';
import ExportControls from './components/ExportControls';
import EditorErrorBoundary from './components/EditorErrorBoundary';
import { formatBytes, formatTime, disposeMedia, loadMedia } from './lib/media';
import type { LoadedMedia } from './lib/media';
import { renderMedia } from './lib/export';
import type { AnimatedExportFormat } from './lib/export';
import type { ExportResult } from './store/editor';
import { clearLegacyDraft } from './lib/session';
import { useEditor } from './store/editor';
const ACCEPT = '.mp4,.mov,.m4v,.webm,.ogv,.gif,.png,.jpg,.jpeg,.webp,.bmp,.avif';
export default function App() {
    const input = useRef<HTMLInputElement>(null);
    const [media, setMedia] = useState<LoadedMedia | null>(null);
    const [loading, setLoading] = useState(false);
    const [dragOver, setDragOver] = useState(false);
    const [notice, setNotice] = useState<string | null>(null);
    const [working, setWorking] = useState(false);
    const controller = useRef<AbortController | null>(null);
    const mediaRef = useRef<LoadedMedia | null>(null);
    const resultCache = useRef(new Map<ExportResult['format'], ExportResult>());
    const [availableFormats, setAvailableFormats] = useState<ExportResult['format'][]>([]);
    const lastJob = useRef(0);
    const clearResults = () => {
        for (const result of resultCache.current.values()) URL.revokeObjectURL(result.url);
        resultCache.current.clear();
        setAvailableFormats([]);
    };
    // Every navigation starts with an empty editor. Do not recover media or settings.
    useEffect(() => {
        clearLegacyDraft();
        useEditor.getState().resetSession();
        const onReturn = (event: PageTransitionEvent) => {
            if (!event.persisted) return;
            // Reset the restored DOM in place instead of navigating again.
            lastJob.current++;
            controller.current?.abort();
            controller.current = null;
            setWorking(false);
            disposeMedia(mediaRef.current);
            mediaRef.current = null;
            clearResults();
            setMedia(null);
            setLoading(false);
            setNotice(null);
            if (input.current) input.current.value = '';
            useEditor.getState().resetSession();
        };
        window.addEventListener('pageshow', onReturn);
        return () => window.removeEventListener('pageshow', onReturn);
    }, []);
    useEffect(() => () => {
        controller.current?.abort();
        disposeMedia(mediaRef.current);
        for (const result of resultCache.current.values()) URL.revokeObjectURL(result.url);
        resultCache.current.clear();
    }, []);
    const openFile = () => input.current?.click();
    const selectFile = async (file?: File) => {
        if (!file)
            return;
        setNotice(null);
        setLoading(true);
        cancel();
        const pending = ++lastJob.current;
        try {
            const loaded = await loadMedia(file);
            if (pending !== lastJob.current) {
                disposeMedia(loaded);
                return;
            }
            disposeMedia(mediaRef.current);
            mediaRef.current = loaded;
            setMedia(loaded);
            clearResults();
            useEditor.getState().setMeta(loaded.meta);
        }
        catch (e) {
            if (pending === lastJob.current)
                setNotice(e instanceof Error ? e.message : 'Could not open this media file.');
        }
        finally {
            if (pending === lastJob.current) {
                setLoading(false);
                if (input.current) input.current.value = '';
            }
        }
    };
    const cancel = () => {
        if (controller.current) {
            controller.current.abort();
            controller.current = null;
            useEditor.getState().setProcess('idle');
        }
        setWorking(false);
    };
    const beginExport = async (format?: AnimatedExportFormat) => {
        if (!media || controller.current)
            return;
        setNotice(null);
        setWorking(true);
        const freshExport = !format || useEditor.getState().exportState === 'idle';
        const abort = new AbortController();
        controller.current = abort;
        useEditor.getState().setProcess('preparing', 0, 'Preparing source');
        try {
            const result = await renderMedia(media, abort.signal, (progress, text) => {
                if (abort.signal.aborted)
                    return;
                useEditor.getState().setProcess(text.startsWith('Optimizing') ? 'optimizing' : 'rendering', progress, text);
            }, format);
            if (abort.signal.aborted) {
                URL.revokeObjectURL(result.url);
                return;
            }
            if (freshExport) clearResults();
            const previousFormat = resultCache.current.get(result.format);
            if (previousFormat) URL.revokeObjectURL(previousFormat.url);
            resultCache.current.set(result.format, result);
            setAvailableFormats(Array.from(resultCache.current.keys()));
            useEditor.getState().setResult(result);

        }
        catch (e) {
            if (abort.signal.aborted) {
                if (controller.current === abort)
                    useEditor.getState().setProcess('idle');
                return;
            }
            useEditor.getState().setError(e instanceof Error ? e.message : 'Export failed.');
        }
        finally {
            if (controller.current === abort) {
                controller.current = null;
                setWorking(false);
            }
        }
    };
    // A download must never trigger encoding, change the active media, or navigate.
    const downloadFile = (result: ExportResult) => {
        try {
            const anchor = document.createElement('a');
            anchor.href = result.url;
            anchor.download = result.name;
            anchor.style.display = 'none';
            document.body.appendChild(anchor);
            anchor.click();
            anchor.remove();
        } catch {
            setNotice('Download could not start. Try again in this browser.');
        }
    };
    const download = (format: ExportResult['format']) => {
        if (controller.current) return;
        const prepared = resultCache.current.get(format);
        if (prepared) downloadFile(prepared);
    };
    const prepareFormat = (format: AnimatedExportFormat) => {
        const result = useEditor.getState().result;
        if (!result || controller.current || resultCache.current.has(format) || result.duration <= 0 || result.preset === 'gif') return;
        void beginExport(format);
    };
    return <div className="page">
    <header className="site-header">
      <div className="site-brand"><BrandMark /><span>Nyxcord</span></div>
    </header>
    <main className="main">
      <div className="hero">
        <h1>GIFs &amp; stickers<span>.</span></h1>
        <p>Crop, trim, and export.</p>
      </div>
      <div className="workspace">
        <div className="workspace-title"><div><span className="workspace-icon"><Crop size={18}/></span><span>GIF & Sticker Maker</span></div></div>
        <div className="workspace-content">
          <input ref={input} className="sr-only" type="file" accept={ACCEPT} onChange={e => void selectFile(e.target.files?.[0])}/>
          {!media ? <div className={`upload-zone ${dragOver ? 'drag-over' : ''}`} onClick={openFile} role="button" tabIndex={0} aria-label="Choose an image or video" onKeyDown={e => { if (e.target !== e.currentTarget) return; if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openFile(); } }} onDragOver={e => { e.preventDefault(); setDragOver(true); }} onDragLeave={e => { e.preventDefault(); setDragOver(false); }} onDrop={e => { e.preventDefault(); setDragOver(false); void selectFile(e.dataTransfer.files?.[0]); }}>
              <div className="upload-art"><div className="upload-art-ring"><CloudUpload size={30} strokeWidth={1.8}/></div></div>
              <h2>{loading ? 'Opening media…' : 'Drop an image or video'}</h2>
              <button type="button" className="button button-primary upload-button" disabled={loading} onClick={e => { e.stopPropagation(); openFile(); }}><Upload size={15}/> Choose File <ArrowRight size={15}/></button>
              <span className="upload-formats">MP4, WebM, MOV, GIF, PNG, JPG, WebP · Up to 160 MB</span>
            </div> : <>
              <div className="source-bar"><div className="file-art"><FileImage size={20}/></div><div className="file-details"><strong title={media.meta.name}>{media.meta.name}</strong><span>{media.meta.width} × {media.meta.height} <i /> {formatBytes(media.meta.fileSize)} {media.meta.kind !== 'image' ? <> <i /> {formatTime(media.meta.duration)}</> : null}</span></div><button type="button" className="button button-light button-change" onClick={openFile}><RotateCcw size={14}/> Change</button></div>
              <EditorErrorBoundary key={media.url} onReset={() => useEditor.getState().setMeta(media.meta)}><div className="editor-area"><CanvasEditor media={media}/></div>
              <EditorControls media={media}/></EditorErrorBoundary>
            </>}
          {notice && <div className="alert-banner" role="alert"><CircleAlert size={16}/><span>{notice}</span><button type="button" onClick={() => setNotice(null)} aria-label="Dismiss notice" title="Dismiss"><X size={16}/></button></div>}
          {media && <EditorErrorBoundary key={media.url} onReset={() => useEditor.getState().setMeta(media.meta)}><OutputSettings media={media}/><ExportControls media={media} loading={loading} working={working} beginExport={beginExport} cancel={cancel} download={download} prepareFormat={prepareFormat} availableFormats={availableFormats}/></EditorErrorBoundary>}

        </div>
      </div>
    </main>
    <footer className="site-footer"><span>© {new Date().getFullYear()} Nyxcord</span></footer>
  </div>;
}
