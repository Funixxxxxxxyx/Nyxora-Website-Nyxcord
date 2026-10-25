import type { Meta, Rect, Rotation } from '../store/editor';
export type AnimatedFrame = {
    pixels: ImageData;
    start: number;
    end: number;
};
export type LoadedMedia = {
    file: File;
    url: string;
    meta: Meta;
    element?: HTMLImageElement | HTMLVideoElement;
    gifFrames?: AnimatedFrame[];
    gifCanvas?: HTMLCanvasElement;
    gifContext?: CanvasRenderingContext2D;
};
const MAX_FILE_MB = 160;
const mimeIsVideo = (file: File) => file.type.startsWith('video/') || /\.(mp4|mov|m4v|webm|ogv)$/i.test(file.name);
const isGif = (file: File) => file.type === 'image/gif' || /\.gif$/i.test(file.name);
const isImage = (file: File) => {
    // SVG and other browser-rendered documents are not part of the raster editor.
    if (file.type && !['image/png', 'image/jpeg', 'image/webp', 'image/bmp', 'image/avif', 'application/octet-stream'].includes(file.type))
        return false;
    return /\.(png|jpe?g|webp|bmp|avif)$/i.test(file.name) ||
        ['image/png', 'image/jpeg', 'image/webp', 'image/bmp', 'image/avif'].includes(file.type);
};
export function formatTime(sec: number): string {
    const m = Math.floor(Math.max(0, sec) / 60);
    const s = Math.floor(Math.max(0, sec) % 60);
    const cs = Math.floor((Math.max(0, sec) % 1) * 100);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}
export function formatBytes(bytes: number): string {
    return bytes < 1024 ? `${bytes} B` : bytes < 1024 ** 2 ? `${(bytes / 1024).toFixed(0)} KB` : `${(bytes / 1024 ** 2).toFixed(2)} MB`;
}
function loadImage(url: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const image = new Image();
        let settled = false;
        const finish = (error?: Error) => {
            if (settled) return;
            settled = true;
            clearTimeout(timeout);
            image.onload = null;
            image.onerror = null;
            if (error) reject(error); else resolve(image);
        };
        const timeout = setTimeout(() => finish(new Error('Image loading timed out.')), 15000);
        image.onload = () => finish();
        image.onerror = () => finish(new Error('This image could not be decoded.'));
        image.src = url;
    });
}
function loadVideo(url: string): Promise<HTMLVideoElement> {
    return new Promise((resolve, reject) => {
        const video = document.createElement('video');
        video.preload = 'metadata';
        video.muted = true;
        video.playsInline = true;
        let settled = false;
        const finish = (error?: Error) => {
            if (settled) return;
            settled = true;
            clearTimeout(timeout);
            video.removeEventListener('loadedmetadata', checkDimensions);
            video.removeEventListener('loadeddata', ready);
            video.removeEventListener('error', failed);
            if (error) {
                video.pause();
                video.removeAttribute('src');
                video.load();
                reject(error);
            } else resolve(video);
        };
        const checkDimensions = () => {
            try {
                guardSourceDimensions(video.videoWidth, video.videoHeight);
                if (!Number.isFinite(video.duration) || video.duration <= 0)
                    throw new Error('Video duration is unavailable.');
            } catch (error) {
                finish(error instanceof Error ? error : new Error('Invalid video dimensions.'));
            }
        };
        const ready = () => {
            if (video.videoWidth && video.videoHeight && Number.isFinite(video.duration)) finish();
            else finish(new Error('Video dimensions or duration are unavailable.'));
        };
        const failed = () => finish(new Error('This browser cannot decode the video codec.'));
        const timeout = setTimeout(() => finish(new Error('Video loading timed out.')), 15000);
        video.addEventListener('loadedmetadata', checkDimensions);
        video.addEventListener('loadeddata', ready);
        video.addEventListener('error', failed);
        video.src = url;
        video.load();
    });
}
async function readGif(file: File): Promise<{
    frames: AnimatedFrame[];
    width: number;
    height: number;
    duration: number;
}> {
    // Decode one GIF patch at a time instead of retaining all RGBA patches.
    const { decompressFrame, parseGIF } = await import('gifuct-js');
    if (file.size > 24 * 1024 * 1024)
        throw new Error('GIF is too large to decode safely. Try a smaller file.');
    const parsed = parseGIF(await file.arrayBuffer());
    const width = parsed.lsd.width;
    const height = parsed.lsd.height;
    const frameBlocks = parsed.frames.filter((block): block is Extract<typeof block, { image: unknown }> => 'image' in block);
    const frameBytes = width * height * 4;
    const lowMemory = typeof navigator !== 'undefined' &&
        (navigator as Navigator & { deviceMemory?: number }).deviceMemory !== undefined &&
        (navigator as Navigator & { deviceMemory?: number }).deviceMemory! <= 4;
    const snapshotBudget = (lowMemory ? 20 : 48) * 1024 * 1024;
    if (!Number.isSafeInteger(frameBytes) || width < 1 || height < 1 ||
        frameBytes > (lowMemory ? 8 : 16) * 1024 * 1024 ||
        !frameBlocks.length || frameBlocks.length * frameBytes > snapshotBudget)
        throw new Error('GIF exceeds the safe animation memory limit. Try a shorter or smaller GIF.');
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const patchCanvas = document.createElement('canvas');
    const patchCtx = patchCanvas.getContext('2d');
    if (!ctx || !patchCtx) throw new Error('Canvas decoding is unavailable.');
    const output: AnimatedFrame[] = [];
    let cursor = 0;
    let previousDisposal = 0;
    let previousBounds = { left: 0, top: 0, width: 0, height: 0 };
    let previousSnapshot: ImageData | null = null;
    try {
        for (const block of frameBlocks) {
            if (previousDisposal === 2)
                ctx.clearRect(previousBounds.left, previousBounds.top, previousBounds.width, previousBounds.height);
            else if (previousDisposal === 3 && previousSnapshot)
                ctx.putImageData(previousSnapshot, 0, 0);
            // gifuct-js decompressFrame returns indexed pixels without allocating an RGBA patch.
            const frame = decompressFrame(block, parsed.gct, false);
            const { left, top, width: patchWidth, height: patchHeight } = frame.dims;
            if (patchWidth < 1 || patchHeight < 1 || left < 0 || top < 0 ||
                left + patchWidth > width || top + patchHeight > height)
                throw new Error('GIF contains invalid frame boundaries.');
            if (frame.pixels.length !== patchWidth * patchHeight)
                throw new Error('GIF contains an invalid frame payload.');
            const snapshot = frame.disposalType === 3 ? ctx.getImageData(0, 0, width, height) : null;
            patchCanvas.width = patchWidth;
            patchCanvas.height = patchHeight;
            const patch = patchCtx.createImageData(patchWidth, patchHeight);
            for (let pixel = 0; pixel < frame.pixels.length; pixel++) {
                const index = frame.pixels[pixel];
                const offset = pixel * 4;
                if (index === frame.transparentIndex) continue;
                const color = frame.colorTable[index];
                if (!color) throw new Error('GIF contains an invalid palette index.');
                patch.data[offset] = color[0];
                patch.data[offset + 1] = color[1];
                patch.data[offset + 2] = color[2];
                patch.data[offset + 3] = 255;
            }
            patchCtx.putImageData(patch, 0, 0);
            ctx.drawImage(patchCanvas, left, top);
            const delay = Math.max(20, frame.delay || 100) / 1000;
            output.push({ pixels: ctx.getImageData(0, 0, width, height), start: cursor, end: cursor + delay });
            cursor += delay;
            previousDisposal = frame.disposalType;
            previousBounds = frame.dims;
            previousSnapshot = snapshot;
        }
    } finally {
        canvas.width = 0;
        patchCanvas.width = 0;
    }
    return { frames: output, width, height, duration: cursor };
}

async function rejectAnimatedWebp(file: File): Promise<void> {
    if (!/\.webp$/i.test(file.name) && file.type !== 'image/webp') return;
    const header = new Uint8Array(await file.slice(0, 30).arrayBuffer());
    const label = (start: number, end: number) => String.fromCharCode(...header.subarray(start, end));
    if (label(0, 4) === 'RIFF' && label(8, 12) === 'WEBP' &&
        label(12, 16) === 'VP8X' && (header[20] & 0x02)) {
        throw new Error('Animated WebP is not supported yet. Convert it to GIF or MP4 first.');
    }
}

/** Read cheap image headers before asking the browser to allocate decoded pixels. */
async function inspectImageDimensions(file: File): Promise<{ width: number; height: number } | null> {
    const jpeg = /\.jpe?g$/i.test(file.name) || file.type === 'image/jpeg';
    const bytes = new Uint8Array(await file.slice(0, jpeg ? 1024 * 1024 : 64 * 1024).arrayBuffer());
    if (bytes.length >= 24 && bytes[0] === 137 && bytes[1] === 80 &&
        String.fromCharCode(...bytes.subarray(12, 16)) === 'IHDR') {
        const view = new DataView(bytes.buffer);
        return { width: view.getUint32(16), height: view.getUint32(20) };
    }
    if (bytes.length > 30 && String.fromCharCode(...bytes.subarray(0, 4)) === 'RIFF' &&
        String.fromCharCode(...bytes.subarray(8, 12)) === 'WEBP') {
        const kind = String.fromCharCode(...bytes.subarray(12, 16));
        if (kind === 'VP8X') return {
            width: 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16),
            height: 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16),
        };
        if (kind === 'VP8L' && bytes[20] === 0x2f) return {
            width: 1 + bytes[21] + ((bytes[22] & 0x3f) << 8),
            height: 1 + (bytes[22] >> 6) + (bytes[23] << 2) + ((bytes[24] & 0x0f) << 10),
        };
    }
    if (bytes.length >= 26 && bytes[0] === 66 && bytes[1] === 77) {
        const view = new DataView(bytes.buffer);
        return { width: Math.abs(view.getInt32(18, true)), height: Math.abs(view.getInt32(22, true)) };
    }
    if (bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
        let i = 2;
        while (i + 9 < bytes.length) {
            if (bytes[i] !== 0xff) { i++; continue; }
            while (bytes[i] === 0xff) i++;
            const marker = bytes[i++];
            if (marker === 0xd9 || marker === 0xda) break;
            if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
            if (i + 2 > bytes.length) break;
            const length = bytes[i] * 256 + bytes[i + 1];
            if (length < 2 || i + length > bytes.length) break;
            if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker))
                return { height: bytes[i + 3] * 256 + bytes[i + 4], width: bytes[i + 5] * 256 + bytes[i + 6] };
            i += length;
        }
    }
    if (jpeg) throw new Error('JPEG dimensions could not be read safely. Try re-saving the image.');
    return null;
}

function guardSourceDimensions(width: number, height: number): void {
    const deviceMemory = typeof navigator !== 'undefined'
        ? (navigator as Navigator & { deviceMemory?: number }).deviceMemory : undefined;
    const maxPixels = deviceMemory !== undefined && deviceMemory <= 4 ? 10_000_000 : 24_000_000;
    if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) ||
        width <= 0 || height <= 0 || width * height > maxPixels)
        throw new Error('Source resolution is too large for safe browser editing. Use a smaller image or video.');
}

export async function loadMedia(file: File): Promise<LoadedMedia> {
    await rejectAnimatedWebp(file);
    if (file.size > MAX_FILE_MB * 1024 * 1024)
        throw new Error(`Files over ${MAX_FILE_MB} MB aren't supported in this browser-only editor.`);
    if (!mimeIsVideo(file) && !isGif(file) && !isImage(file))
        throw new Error('Use MP4, WebM, MOV, GIF, PNG, JPG, or WebP files.');
    if (!mimeIsVideo(file) && !isGif(file)) {
        const header = await inspectImageDimensions(file);
        if (header) guardSourceDimensions(header.width, header.height);
    }
    const url = URL.createObjectURL(file);
    try {
        if (isGif(file)) {
            const parsed = await readGif(file);
            guardSourceDimensions(parsed.width, parsed.height);
            const gifCanvas = document.createElement('canvas');
            gifCanvas.width = parsed.width;
            gifCanvas.height = parsed.height;
            const gifContext = gifCanvas.getContext('2d', { willReadFrequently: true });
            if (!gifContext)
                throw new Error('Canvas processing is unavailable.');
            return { file, url, gifFrames: parsed.frames, gifCanvas, gifContext,
                meta: { name: file.name, kind: parsed.frames.length > 1 ? 'gif' : 'image', width: parsed.width, height: parsed.height, duration: parsed.frames.length > 1 ? parsed.duration : 0, fileSize: file.size } };
        }
        if (mimeIsVideo(file)) {
            const video = await loadVideo(url);
            guardSourceDimensions(video.videoWidth, video.videoHeight);
            return { file, url, element: video,
                meta: { name: file.name, kind: 'video', width: video.videoWidth, height: video.videoHeight, duration: video.duration, fileSize: file.size } };
        }
        const image = await loadImage(url);
        guardSourceDimensions(image.naturalWidth, image.naturalHeight);
        return { file, url, element: image,
            meta: { name: file.name, kind: 'image', width: image.naturalWidth, height: image.naturalHeight, duration: 0, fileSize: file.size } };
    }
    catch (error) {
        URL.revokeObjectURL(url);
        throw error;
    }
}
export function disposeMedia(media: LoadedMedia | null): void {
    if (!media)
        return;
    if (media.element instanceof HTMLVideoElement) {
        media.element.pause();
        media.element.removeAttribute('src');
        media.element.load();
    }
    URL.revokeObjectURL(media.url);
    media.gifFrames = undefined;
    if (media.gifCanvas) {
        media.gifCanvas.width = 0;
        media.gifCanvas.height = 0;
        media.gifContext = undefined;
        media.gifCanvas = undefined;
    }
}
export function drawSource(ctx: CanvasRenderingContext2D, media: LoadedMedia, time: number, x: number, y: number, width: number, height: number): void {
    if (media.gifFrames?.length && media.gifCanvas && media.gifContext) {
        const duration = media.meta.duration || 1;
        const t = Math.max(0, Math.min(time, duration - 0.001));
        const frame = media.gifFrames.find(f => t >= f.start && t < f.end) ?? media.gifFrames[media.gifFrames.length - 1];
        media.gifContext.putImageData(frame.pixels, 0, 0);
        ctx.drawImage(media.gifCanvas, x, y, width, height);
    }
    else if (media.element) {
        ctx.drawImage(media.element, x, y, width, height);
    }
}
export function drawProcessed(ctx: CanvasRenderingContext2D, media: LoadedMedia, crop: Rect, time: number, canvasWidth: number, canvasHeight: number, fit: 'contain' | 'cover', sticker: boolean, rotation: Rotation = 0): void {
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);
    // Crop remains in source pixels. Rotation is performed AFTER cropping so
    // editing and export use exactly the same region.
    const quarter = rotation === 90 || rotation === 270;
    const orientedWidth = quarter ? crop.height : crop.width;
    const orientedHeight = quarter ? crop.width : crop.height;
    const contain = Math.min(canvasWidth / orientedWidth, canvasHeight / orientedHeight);
    const cover = Math.max(canvasWidth / orientedWidth, canvasHeight / orientedHeight);
    // Standard stickers can add transparent margins, but never enlarge artwork.
    const scale = sticker ? Math.min(1, fit === 'cover' ? cover : contain) : contain;
    const drawW = crop.width * scale;
    const drawH = crop.height * scale;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, canvasWidth, canvasHeight);
    ctx.clip();
    ctx.translate(canvasWidth / 2, canvasHeight / 2);
    ctx.rotate(rotation * Math.PI / 180);
    if (media.gifFrames?.length && media.gifCanvas && media.gifContext) {
        // For GIFs use the same source-region cropping as for video and images.
        const duration = media.meta.duration || 1;
        const t = Math.max(0, Math.min(time, duration - 0.001));
        const frame = media.gifFrames.find(f => t >= f.start && t < f.end) ?? media.gifFrames[media.gifFrames.length - 1];
        media.gifContext.putImageData(frame.pixels, 0, 0);
        ctx.drawImage(media.gifCanvas, crop.x, crop.y, crop.width, crop.height, -drawW / 2, -drawH / 2, drawW, drawH);
    }
    else if (media.element) {
        ctx.drawImage(media.element, crop.x, crop.y, crop.width, crop.height, -drawW / 2, -drawH / 2, drawW, drawH);
    }
    ctx.restore();
}
export function seekVideo(video: HTMLVideoElement, time: number, signal?: AbortSignal): Promise<void> {
    if (signal?.aborted)
        return Promise.reject(new DOMException('Cancelled', 'AbortError'));
    const target = Math.min(Math.max(time, 0), Math.max(0, video.duration - 0.001));
    if (Math.abs(video.currentTime - target) < 0.015 && video.readyState >= 2)
        return Promise.resolve();
    return new Promise((resolve, reject) => {
        let timeout: ReturnType<typeof setTimeout>;
        const clean = () => { clearTimeout(timeout); video.removeEventListener('seeked', done); video.removeEventListener('error', fail); signal?.removeEventListener('abort', abort); };
        const done = () => { clean(); resolve(); };
        const fail = () => { clean(); reject(new Error('Video seek failed.')); };
        const abort = () => { clean(); reject(new DOMException('Cancelled', 'AbortError')); };
        video.addEventListener('seeked', done, { once: true });
        video.addEventListener('error', fail, { once: true });
        signal?.addEventListener('abort', abort, { once: true });
        timeout = setTimeout(() => { clean(); reject(new Error('Video seeking timed out. Try a smaller file or a different codec.')); }, 12000);
        video.currentTime = target;
    });
}
