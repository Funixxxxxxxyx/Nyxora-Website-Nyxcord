declare module 'gifenc' {
    export function quantize(rgba: Uint8Array | Uint8ClampedArray, maxColors: number, options?: {
        format?: string;
        oneBitAlpha?: boolean | number;
    }): number[][];
    export function applyPalette(rgba: Uint8Array | Uint8ClampedArray, palette: number[][], format?: string): Uint8Array;
    export function GIFEncoder(): {
        writeFrame(index: Uint8Array, width: number, height: number, options: {
            palette: number[][];
            delay?: number;
            repeat?: number;
            dispose?: number;
            transparent?: boolean;
            transparentIndex?: number;
        }): void;
        finish(): void;
        bytes(): Uint8Array;
    };
}
// gifuct-js supplies its own TypeScript definitions.
declare module 'upng-js' {
    const UPNG: {
        encode(imgs: ArrayBuffer[], width: number, height: number, colors: number, delays?: number[]): ArrayBuffer;
        decode(buffer: ArrayBuffer): { frames: Array<{ delay: number }>; width: number; height: number };
        toRGBA8(decoded: { frames: Array<{ delay: number }>; width: number; height: number }): ArrayBuffer[];
    };
    export default UPNG;
}
