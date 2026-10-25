import { GOOGLE_FONTS } from './fontCatalog';

const loads = new Map<string, Promise<void>>();
const ready = new Set<string>();
export const isOnlineFontReady = (family: string): boolean => ready.has(family);
const online = new Set<string>(GOOGLE_FONTS);
export const isOnlineFont = (family: string) => online.has(family);

/** Loads one font at a time instead of downloading the entire catalog. */
export function ensureFontLoaded(family: string): Promise<void> {
  if (!online.has(family)) return Promise.resolve();
  const cached = loads.get(family);
  if (cached) return cached;
  const promise = new Promise<void>((resolve, reject) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    // Load the default face lazily. Browser synthesis handles unavailable bold/italic variants.
    link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g, '+')}&display=swap`;
    const timeout = window.setTimeout(() => { link.remove(); reject(new Error(`Could not load ${family}. Check your connection.`)); }, 12000);
    link.onload = () => { window.clearTimeout(timeout); ready.add(family); resolve(); };
    link.onerror = () => { window.clearTimeout(timeout); link.remove(); reject(new Error(`Could not load ${family}.`)); };
    document.head.appendChild(link);
  });
  loads.set(family, promise);
  void promise.catch(() => loads.delete(family));
  return promise;
}

export async function waitForOnlineFonts(families: string[], signal?: AbortSignal): Promise<void> {
  for (const family of new Set(families)) {
    if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
    await ensureFontLoaded(family);
  }
}
