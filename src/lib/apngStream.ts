/** Incremental RGBA APNG writer. Only compressed chunks are retained. */
const pngSignature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const encoder = new TextEncoder();
const table = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let crc = i;
  for (let j = 0; j < 8; j++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  table[i] = crc >>> 0;
}
function u32(value: number): Uint8Array {
  return Uint8Array.of(value >>> 24, value >>> 16, value >>> 8, value);
}
function chunk(type: string, data: Uint8Array): Uint8Array {
  const kind = encoder.encode(type);
  const result = new Uint8Array(12 + data.length);
  result.set(u32(data.length), 0);
  result.set(kind, 4);
  result.set(data, 8);
  let crc = 0xffffffff;
  for (let i = 4; i < result.length - 4; i++) crc = table[(crc ^ result[i]) & 0xff] ^ (crc >>> 8);
  result.set(u32((crc ^ 0xffffffff) >>> 0), result.length - 4);
  return result;
}
function concat(arrays: Uint8Array[]): Uint8Array {
  const length = arrays.reduce((sum, a) => sum + a.byteLength, 0);
  const out = new Uint8Array(length);
  let cursor = 0;
  for (const array of arrays) { out.set(array, cursor); cursor += array.byteLength; }
  return out;
}
function gcd(a: number, b: number): number {
  while (b) [a, b] = [b, a % b];
  return a || 1;
}
function frameDelay(ms: number): Uint8Array {
  const units = Math.max(1, Math.min(65535, Math.round(ms)));
  const divisor = gcd(units, 1000);
  const num = Math.round(units / divisor);
  const den = Math.round(1000 / divisor);
  return Uint8Array.of(num >>> 8, num, den >>> 8, den);
}
async function deflate(raw: Uint8Array): Promise<Uint8Array> {
  if (typeof CompressionStream === 'undefined')
    throw new Error('This browser does not support APNG compression. Use GIF instead.');
  const stream = new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export class ApngStreamEncoder {
  private readonly compressed: Uint8Array[] = [];
  private readonly delays: number[] = [];
  private total = 0;
  constructor(readonly width: number, readonly height: number, readonly bits = 8) {}

  async addFrame(rgba: Uint8Array, ms: number): Promise<void> {
    const stride = this.width * 4;
    const raw = new Uint8Array(this.height * (stride + 1));
    // PNG Up filter: local, predictable memory and better compression than filter None.
    for (let y = 0; y < this.height; y++) {
      const offset = y * (stride + 1);
      raw[offset] = 2;
      for (let x = 0; x < stride; x++) {
        const p = y * stride + x;
        let value = rgba[p];
        if (this.bits < 8 && x % 4 !== 3) {
          const levels = (1 << this.bits) - 1;
          value = Math.round(value * levels / 255) * 255 / levels;
          value = Math.round(value);
        }
        let above = y ? rgba[p - stride] : 0;
        if (this.bits < 8 && y && x % 4 !== 3) {
          const levels = (1 << this.bits) - 1;
          above = Math.round(Math.round(above * levels / 255) * 255 / levels);
        }
        raw[offset + 1 + x] = (value - above + 256) & 255;
      }
    }
    const compressed = await deflate(raw);
    this.compressed.push(compressed);
    this.delays.push(ms);
    this.total += compressed.length + 40;
  }
  get byteEstimate(): number { return this.total + 128; }
  get frameCount(): number { return this.compressed.length; }
  get durationMs(): number { return this.delays.reduce((sum, v) => sum + v, 0); }
  finish(): Uint8Array {
    if (this.compressed.length < 2) throw new Error('APNG requires at least two frames.');
    const ihdr = new Uint8Array(13);
    ihdr.set(u32(this.width), 0); ihdr.set(u32(this.height), 4);
    ihdr[8] = 8; ihdr[9] = 6; // RGBA 8-bit, consistent across every frame.
    const pieces = [pngSignature, chunk('IHDR', ihdr),
      chunk('acTL', concat([u32(this.compressed.length), u32(0)]))];
    let sequence = 0;
    for (let i = 0; i < this.compressed.length; i++) {
      const control = new Uint8Array(26);
      control.set(u32(sequence++), 0);
      control.set(u32(this.width), 4); control.set(u32(this.height), 8);
      control.set(frameDelay(this.delays[i]), 20);
      control[24] = 0; // APNG dispose none
      control[25] = 0; // blend source
      pieces.push(chunk('fcTL', control));
      pieces.push(i === 0 ? chunk('IDAT', this.compressed[i])
        : chunk('fdAT', concat([u32(sequence++), this.compressed[i]])));
    }
    pieces.push(chunk('IEND', new Uint8Array(0)));
    return concat(pieces);
  }
}
