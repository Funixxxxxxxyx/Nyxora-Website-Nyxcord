import { create } from 'zustand';
import { rotatedSize } from '../lib/rotation';
export type Mode = 'gif' | 'sticker';
export type Tool = 'crop' | 'trim' | 'resize' | 'text';
export type Rotation = 0 | 90 | 180 | 270;
export type Ratio = 'free' | 'original' | '1:1' | '16:9' | '4:3' | '9:16';
export type Rect = {
    x: number;
    y: number;
    width: number;
    height: number;
};
export type Meta = {
    name: string;
    kind: 'image' | 'video' | 'gif';
    width: number;
    height: number;
    duration: number;
    fileSize: number;
};
export type StickerMotion = 'static' | 'animated';
export type QualityMode = 'auto' | 'high' | 'balanced' | 'small';
export type FpsMode = 'auto' | 10 | 15 | 20 | 24 | 30;
export type ExportResult = {
    format: 'gif' | 'png' | 'apng';
    url: string;
    name: string;
    size: number;
    mime: string;
    width: number;
    height: number;
    fps: number;
    duration: number;
    elapsedMs: number;
    compliant: boolean;
    notes: string[];
    preset: 'gif' | 'sticker-custom' | 'sticker-standard';
};
export type ProcessState = 'idle' | 'preparing' | 'rendering' | 'optimizing' | 'complete' | 'error';
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, Number.isFinite(v) ? v : min));
const nativeWidth = (crop: Rect) => Math.max(1, Math.floor(crop.width));
const nativeHeight = (crop: Rect) => Math.max(1, Math.floor(crop.height));
export function ratioNumber(ratio: Ratio, meta: Meta): number | null {
    if (ratio === 'free')
        return null;
    if (ratio === 'original')
        return meta.width / meta.height;
    const [w, h] = ratio.split(':').map(Number);
    return w / h;
}
/** Reset ratio presets against the entire source, never the prior crop. */
export function fittedCrop(meta: Meta, ratio: Ratio, rotation: Rotation = 0): Rect {
    const full: Rect = { x: 0, y: 0, width: meta.width, height: meta.height };
    if (ratio === 'free' || ratio === 'original') return full;
    const displayRatio = ratioNumber(ratio, meta)!;
    const sourceRatio = isQuarterTurn(rotation) ? 1 / displayRatio : displayRatio;
    let width = meta.width;
    let height = width / sourceRatio;
    if (height > meta.height) {
        height = meta.height;
        width = height * sourceRatio;
    }
    return { x: (meta.width - width) / 2, y: (meta.height - height) / 2, width, height };
}
// Native pixels are never enlarged; rounding always respects the selected crop.
export function isQuarterTurn(rotation: Rotation): boolean { return rotation === 90 || rotation === 270; }
export function orientedCrop(crop: Rect, rotation: Rotation): Rect {
    const dims = rotatedSize(crop.width, crop.height, rotation);
    return { x: 0, y: 0, ...dims };
}
export function dimensionsForCrop(crop: Rect, wantedWidth: number) {
    const width = Math.max(1, Math.min(nativeWidth(crop), Math.round(wantedWidth)));
    return { width, height: Math.max(1, Math.min(nativeHeight(crop), Math.round(width * crop.height / crop.width))) };
}
export function dimensionsFromHeight(crop: Rect, wantedHeight: number) {
    const height = Math.max(1, Math.min(nativeHeight(crop), Math.round(wantedHeight)));
    return { width: Math.max(1, Math.min(nativeWidth(crop), Math.round(height * crop.width / crop.height))), height };
}
export function automaticDimensions(dims: { width: number; height: number }, _mode: Mode) {
    // Auto means crop-native resolution, limited only by a safe pixel budget.
    // Explicit Width/Height remain available for further downscaling.
    const memory = typeof navigator !== 'undefined'
        ? (navigator as Navigator & { deviceMemory?: number }).deviceMemory : undefined;
    const maxPixels = memory !== undefined && memory <= 4 ? 2_000_000 : 5_000_000;
    const pixels = dims.width * dims.height;
    if (pixels <= maxPixels) return dims;
    const factor = Math.sqrt(maxPixels / pixels);
    return { width: Math.max(1, Math.floor(dims.width * factor)),
        height: Math.max(1, Math.floor(dims.height * factor)) };
}
export function automaticFps(meta: Meta | null, mode: Mode = 'gif'): number { return meta?.kind === 'image' ? 0 : mode === 'sticker' ? 10 : 15; }
export function effectiveQuality(mode: QualityMode): number {
    return mode === 'high' ? 95 : mode === 'balanced' ? 75 : mode === 'small' ? 45 : 85;
}
export interface EditorState {
    meta: Meta | null;
    crop: Rect;
    ratio: Ratio;
    rotation: Rotation;
    trimStart: number;
    trimEnd: number;
    savedGifTrim: { start: number; end: number } | null;
    savedStickerTrim: { start: number; end: number } | null;
    playhead: number;
    mode: Mode;
    stickerMotion: StickerMotion;
    tool: Tool;
    preview: boolean;
    outputWidth: number;
    outputHeight: number;
    sizeAuto: boolean;
    fpsMode: FpsMode;
    qualityMode: QualityMode;
    sizeTargetMB: number;
    exportState: ProcessState;
    progress: number;
    progressText: string;
    error: string | null;
    result: ExportResult | null;
    setMeta: (meta: Meta | null) => void;
    setCrop: (crop: Rect) => void;
    setRatio: (ratio: Ratio) => void;
    rotate: (direction: 'left' | 'right') => void;
    setTrim: (start: number, end: number) => void;
    setPlayhead: (value: number) => void;
    setMode: (mode: Mode) => void;
    setStickerMotion: (motion: StickerMotion) => void;
    setTool: (tool: Tool) => void;
    setPreview: (preview: boolean) => void;
    setWidth: (width: number) => void;
    setHeight: (height: number) => void;
    setSizeAuto: () => void;
    setFpsMode: (fpsMode: FpsMode) => void;
    setQualityMode: (qualityMode: QualityMode) => void;
    setTarget: (target: number) => void;
    setProcess: (state: ProcessState, progress?: number, progressText?: string) => void;
    setError: (error: string | null) => void;
    setResult: (result: ExportResult | null) => void;
    resetCrop: () => void;
    resetSession: () => void;
}
// Shared state contains numbers and controls only, never video frames or raw pixel buffers.
export const useEditor = create<EditorState>((set, get) => ({
    meta: null, crop: { x: 0, y: 0, width: 1, height: 1 },
    ratio: 'free', rotation: 0, trimStart: 0, trimEnd: 0, savedGifTrim: null, savedStickerTrim: null, playhead: 0,
    mode: 'gif', stickerMotion: 'static', tool: 'crop', preview: false,
    outputWidth: 1, outputHeight: 1, sizeAuto: true,
    fpsMode: 'auto', qualityMode: 'auto', sizeTargetMB: 20,
    exportState: 'idle', progress: 0, progressText: '', error: null, result: null,
    resetSession() {
        set({ meta: null, crop: { x: 0, y: 0, width: 1, height: 1 }, ratio: 'free', rotation: 0,
            trimStart: 0, trimEnd: 0, savedGifTrim: null, savedStickerTrim: null, playhead: 0, mode: 'gif', stickerMotion: 'static', tool: 'crop',
            preview: false, outputWidth: 1, outputHeight: 1, sizeAuto: true, fpsMode: 'auto',
            qualityMode: 'auto', sizeTargetMB: 20, exportState: 'idle', progress: 0,
            progressText: '', error: null, result: null });
    },
    setMeta(meta) {
        set(() => {
            if (!meta)
                return { meta: null, exportState: 'idle', error: null, result: null };
            const crop = { x: 0, y: 0, width: meta.width, height: meta.height };
            const mode = meta.kind === 'image' ? 'sticker' : 'gif';
            const dims = automaticDimensions(dimensionsForCrop(crop, crop.width), mode);
            return { meta, crop, mode, stickerMotion: 'static', ratio: 'free', rotation: 0, trimStart: 0,
                trimEnd: meta.duration || 0, savedGifTrim: null, savedStickerTrim: null, playhead: 0,
                ...{ outputWidth: dims.width, outputHeight: dims.height }, sizeAuto: true,
                tool: 'crop', preview: false, fpsMode: 'auto', qualityMode: 'auto', sizeTargetMB: 20,
                exportState: 'idle', progress: 0, progressText: '', error: null, result: null };
        });
    },
    setCrop(rect) {
        const { meta, crop, outputWidth, sizeAuto, rotation, mode } = get();
        if (!meta)
            return;
        const width = clamp(rect.width, 1, meta.width);
        const height = clamp(rect.height, 1, meta.height);
        const next = { x: clamp(rect.x, 0, meta.width - width), y: clamp(rect.y, 0, meta.height - height), width, height };
        // With Auto active, a crop directly determines output pixels. Otherwise preserve manual resize scale.
        const previousNative = orientedCrop(crop, rotation);
        const nextNative = orientedCrop(next, rotation);
        const wanted = sizeAuto ? nextNative.width : nextNative.width * outputWidth / Math.max(1, previousNative.width);
        const rawDims = dimensionsForCrop(nextNative, wanted);
        const dims = sizeAuto ? automaticDimensions(rawDims, mode) : rawDims;
        set({ crop: next, outputWidth: dims.width, outputHeight: dims.height, exportState: 'idle' });
    },
    setRatio(ratio) {
        const { meta, crop, sizeAuto, outputWidth, rotation, mode } = get();
        if (!meta) return;
        const next = fittedCrop(meta, ratio, rotation);
        const oldBounds = orientedCrop(crop, rotation);
        const newBounds = orientedCrop(next, rotation);
        const scale = sizeAuto ? 1 : outputWidth / Math.max(1, oldBounds.width);
        const dims = sizeAuto
            ? automaticDimensions(dimensionsForCrop(newBounds, newBounds.width), mode)
            : dimensionsForCrop(newBounds, newBounds.width * scale);
        set({ ratio, crop: next, ...dimsToOutput(dims), exportState: 'idle' });
    },
    rotate(direction) {
        const old = get().rotation;
        const rotation = ((old + (direction === 'right' ? 90 : 270)) % 360) as Rotation;
        const { outputWidth, outputHeight } = get();
        // Rotate the source visually; preserve the same source pixels in the crop.
        set({ rotation, ratio: get().ratio === '1:1' || get().ratio === 'original' ? get().ratio : 'free',
            preview: false, outputWidth: outputHeight, outputHeight: outputWidth, exportState: 'idle' });
    },
    setTrim(start, end) {
        const { meta, mode, stickerMotion } = get();
        if (!meta || meta.kind === 'image')
            return;
        const duration = meta.duration;
        const maxSpan = mode === 'sticker' && stickerMotion === 'animated' ? 5 : duration;
        start = clamp(start, 0, Math.max(0, duration - 0.01));
        end = clamp(end, start + Math.min(0.1, duration - start), Math.min(duration, start + maxSpan));
        set({ trimStart: start, trimEnd: end, playhead: clamp(get().playhead, start, end), exportState: 'idle' });
    },
    setPlayhead(playhead) {
        set(state => ({ playhead, exportState: state.mode === 'sticker' && state.stickerMotion === 'static' && state.result && state.playhead !== playhead ? 'idle' : state.exportState }));
    },
    setMode(mode) {
        const { meta, trimStart, trimEnd, savedGifTrim, stickerMotion, crop, rotation, sizeAuto } = get();
        if (mode === 'gif' && meta?.kind === 'image') return;
        if (mode === get().mode) return;
        const oriented = orientedCrop(crop, rotation);
        const resized = sizeAuto ? automaticDimensions(dimensionsForCrop(oriented, oriented.width), mode) : null;
        const movingToSticker = mode === 'sticker' && meta?.kind !== 'image';
        const restoringGif = mode === 'gif' && !!savedGifTrim;
        const nextStart = restoringGif ? savedGifTrim.start : trimStart;
        const nextEnd = restoringGif ? savedGifTrim.end :
            (movingToSticker && stickerMotion === 'animated' ? Math.min(trimEnd, trimStart + 5) : trimEnd);
        set({ mode, ...(resized ? dimsToOutput(resized) : {}),
            savedGifTrim: movingToSticker ? { start: trimStart, end: trimEnd } : null,
            savedStickerTrim: null,
            trimStart: nextStart, trimEnd: nextEnd,
            playhead: clamp(get().playhead, nextStart, nextEnd), exportState: 'idle' });
    },
    setStickerMotion(stickerMotion) {
        const { meta, trimStart, trimEnd, savedStickerTrim, stickerMotion: oldMotion } = get();
        if (stickerMotion === oldMotion) return;
        const movingToAnimated = stickerMotion === 'animated' && meta?.kind !== 'image';
        const restored = !movingToAnimated && savedStickerTrim ? savedStickerTrim : { start: trimStart, end: trimEnd };
        const nextEnd = movingToAnimated ? Math.min(trimEnd, trimStart + 5) : restored.end;
        set({ stickerMotion,
            savedStickerTrim: movingToAnimated ? { start: trimStart, end: trimEnd } : null,
            trimStart: restored.start, trimEnd: nextEnd,
            playhead: clamp(get().playhead, restored.start, nextEnd),
            exportState: 'idle' });
    },
    setTool(tool) { set({ tool, preview: false }); },
    setPreview(preview) { set({ preview }); },
    setWidth(value) {
        const { crop, rotation } = get();
        const dims = dimensionsForCrop(orientedCrop(crop, rotation), value);
        set({ ...dimsToOutput(dims), sizeAuto: false, exportState: 'idle' });
    },
    setHeight(value) {
        const { crop, rotation } = get();
        const dims = dimensionsFromHeight(orientedCrop(crop, rotation), value);
        set({ ...dimsToOutput(dims), sizeAuto: false, exportState: 'idle' });
    },
    setSizeAuto() {
        const { crop, rotation, mode } = get();
        const oriented = orientedCrop(crop, rotation);
        const dims = automaticDimensions(dimensionsForCrop(oriented, oriented.width), mode);
        set({ ...dimsToOutput(dims), sizeAuto: true, exportState: 'idle' });
    },
    setFpsMode(fpsMode) { set({ fpsMode, exportState: 'idle' }); },
    setQualityMode(qualityMode) { set({ qualityMode, exportState: 'idle' }); },
    setTarget(sizeTargetMB) { set({ sizeTargetMB, exportState: 'idle' }); },
    setProcess(exportState, progress = 0, progressText = '') { set({ exportState, progress, progressText, error: null }); },
    setError(error) { set({ error, exportState: error ? 'error' : 'idle' }); },
    setResult(result) { set({ result, exportState: result ? 'complete' : 'idle', progress: result ? 100 : 0 }); },
    resetCrop() {
        const meta = get().meta;
        if (!meta)
            return;
        const crop = { x: 0, y: 0, width: meta.width, height: meta.height };
        const oriented = orientedCrop(crop, get().rotation);
        const dims = automaticDimensions(dimensionsForCrop(oriented, oriented.width), get().mode);
        set({ crop, ratio: 'free', ...dimsToOutput(dims), sizeAuto: true, exportState: 'idle' });
    },
}));
function dimsToOutput(dims: {
    width: number;
    height: number;
}) { return { outputWidth: dims.width, outputHeight: dims.height }; }
