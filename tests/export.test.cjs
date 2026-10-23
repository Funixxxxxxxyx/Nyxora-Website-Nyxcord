const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '../src');

function load(relative) {
  const file = path.join(root, relative);
  const source = fs.readFileSync(file, 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  new Function('exports', 'module', 'require', code)(module.exports, module, request => {
    if (request.startsWith('./')) return load(path.join(path.dirname(relative), request + '.ts'));
    throw new Error('Unexpected dependency ' + request);
  });
  return module.exports;
}

const { compressionProfiles } = load('../tests/support/compressProfiles.ts');
const { mergeDuplicateFrames } = load('../tests/support/frameDedup.ts');
const { isEncodedFormat } = load('lib/validateOutput.ts');
const frame = value => new Uint8Array([value, 1, 2, 255, value, 3, 4, 255]).buffer;
const job = { id: 1, type: 'gif', frames: [frame(1), frame(1), frame(2)], delayMs: 100, quality: 85, maxBytes: 512000 };
const merged = mergeDuplicateFrames(job);
assert.equal(merged.frames.length, 2, 'Duplicate frames should merge');
assert.deepEqual(merged.frameDelays, [200, 100], 'Merge retains total animation duration');
assert.equal(mergeDuplicateFrames({ ...job, frames: [frame(1), frame(1)] }).frames.length, 2, 'All-identical APNG animations must still have two frames');
assert.deepEqual(compressionProfiles(job).map(p => p.colors), [192, 64, 24, 8, 2]);
assert.deepEqual(compressionProfiles({ ...job, type: 'apng' }).map(p => p.colors), [0, 128, 48, 16, 4, 2]);

const gif = Uint8Array.from([...Buffer.from('GIF89a'), 0, 0]).buffer;
assert(!isEncodedFormat(gif, 'gif'), 'GIF without actual frames must be rejected');
assert(!isEncodedFormat(gif, 'apng'));
const signature = [137,80,78,71,13,10,26,10];
const chunk = (tag, data=[]) => [...new Uint8Array(new Uint32Array([data.length]).buffer).reverse(), ...Buffer.from(tag), ...data, 0,0,0,0];
const png = Uint8Array.from([...signature, ...chunk('IHDR', []), ...chunk('IEND')]).buffer;
const apng = Uint8Array.from([...signature, ...chunk('IHDR', []), ...chunk('acTL', [0,0,0,2]), ...chunk('IDAT'), ...chunk('IEND')]).buffer;
assert(!isEncodedFormat(png, 'png'), 'PNG without a valid IHDR must be rejected');
assert(!isEncodedFormat(png, 'apng'), 'Static PNG must not be labelled APNG');
assert(!isEncodedFormat(apng, 'apng'), 'Fake acTL alone cannot satisfy multi-frame validation');
assert(!isEncodedFormat(apng, 'gif'));

const exportSource = fs.readFileSync(path.join(root, 'lib/export.ts'), 'utf8');
const app = fs.readFileSync(path.join(root, 'App.tsx'), 'utf8');
const download = fs.readFileSync(path.join(root, 'components/DownloadMenu.tsx'), 'utf8');
assert(exportSource.includes("sticker ? animatedStickerFormat : 'gif'"), 'Animated stickers must default to actual GIF encoding');
assert(exportSource.includes('Nyxcord-sticker.gif'), 'Animated GIF sticker must have .gif extension');
assert(download.includes("['gif', 'apng']"), 'Animated sticker menu offers GIF and APNG');
assert(download.includes('aria-expanded={open}'), 'Dropdown must expose its expanded state');
assert(!app.includes('downloadAfter'), 'Download must not implicitly re-encode');
assert(app.includes('resultCache.current.get(format)'), 'Download uses only prepared file');
assert(app.includes('downloadFile(prepared)'), 'Download triggers a prepared file');
assert(download.includes('Prepare first'), 'Alternate formats are explicitly prepared before download');
const worker = fs.readFileSync(path.join(root, 'lib/encoder.worker.ts'), 'utf8');
assert(worker.includes('if (job.enforceLimit && bytes.byteLength >= job.maxBytes)'), 'Reject oversized sticker instead of allowing download');
assert(exportSource.includes('inspectAnimation(selected.buffer, outputFormat)'), 'Validate actual encoded animation bytes before download');
console.log('PASS: encoded format checks, animation frames, compression profiles and download menu');
