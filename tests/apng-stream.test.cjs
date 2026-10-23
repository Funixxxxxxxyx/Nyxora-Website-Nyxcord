const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const ts = require('typescript');
const source = fs.readFileSync(path.resolve(__dirname, '../src/lib/apngStream.ts'), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: {
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS,
} }).outputText;
const mod = { exports: {} };
new Function('module', 'exports', 'require', code)(mod, mod.exports, require);
const { ApngStreamEncoder } = mod.exports;
const durations = [110, 170, 230];
function frame(seed) {
  const rgba = new Uint8Array(16 * 12 * 4);
  for (let i = 0; i < rgba.length; i += 4) {
    rgba[i] = (i + seed * 50) % 256;
    rgba[i + 1] = seed * 60;
    rgba[i + 2] = 180;
    rgba[i + 3] = 255;
  }
  return rgba;
}
function chunks(bytes) {
  const input = Buffer.from(bytes);
  assert.equal(input.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  let offset = 8;
  const out = [];
  while (offset + 12 <= input.length) {
    const length = input.readUInt32BE(offset);
    const type = input.toString('ascii', offset + 4, offset + 8);
    out.push({ type, data: input.subarray(offset + 8, offset + 8 + length) });
    offset += length + 12;
    if (type === 'IEND') break;
  }
  assert.equal(offset, input.length);
  return out;
}
(async () => {
  for (const bits of [8, 4, 2]) {
    const writer = new ApngStreamEncoder(16, 12, bits);
    for (let i = 0; i < durations.length; i++) await writer.addFrame(frame(i), durations[i]);
    assert.equal(writer.frameCount, 3);
    assert.equal(writer.durationMs, 510);
    const output = chunks(writer.finish());
    assert.equal(output.filter(part => part.type === 'fcTL').length, 3);
    assert.equal(output.filter(part => part.type === 'fdAT').length, 2);
    const frames = output.filter(part => part.type === 'IDAT' || part.type === 'fdAT');
    for (const part of frames) {
      const compressed = part.type === 'fdAT' ? part.data.subarray(4) : part.data;
      const decoded = zlib.inflateSync(compressed);
      assert.equal(decoded.length, 12 * (16 * 4 + 1));
      for (let y = 0; y < 12; y++) assert.equal(decoded[y * 65], 2);
    }
  }
  console.log('PASS: true 3-frame APNG chunks, per-frame inflate, timing, and quantization');
})().catch(error => { console.error(error); process.exitCode = 1; });
