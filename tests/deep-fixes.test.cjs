const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '../src');
const loaded = new Map();
function create(initializer) {
  let state;
  const set = patch => { state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) }; };
  const get = () => state;
  state = initializer(set, get);
  const hook = () => state;
  hook.getState = get;
  return hook;
}
function load(relative) {
  const file = path.resolve(root, relative.endsWith('.ts') ? relative : `${relative}.ts`);
  if (loaded.has(file)) return loaded.get(file).exports;
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const mod = { exports: {} };
  loaded.set(file, mod);
  new Function('exports', 'module', 'require', code)(mod.exports, mod, name => {
    if (name === 'zustand') return { create };
    if (name.startsWith('.')) return load(path.relative(root, path.resolve(path.dirname(file), name)));
    throw new Error('Unexpected module: ' + name);
  });
  return mod.exports;
}
const { inspectAnimation, pngCrc } = load('lib/validateOutput');
const asBuffer = bytes => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
const png = fs.readFileSync(path.resolve(__dirname, 'fixtures/static.png'));
const apng = fs.readFileSync(path.resolve(__dirname, 'fixtures/animated.png'));
assert(inspectAnimation(asBuffer(png), 'png').valid);
assert(inspectAnimation(asBuffer(apng), 'apng').valid);

const broken = Buffer.from(png);
let offset = 8;
let damaged = false;
while (offset + 12 < broken.length) {
  const length = broken.readUInt32BE(offset);
  const kind = broken.toString('ascii', offset + 4, offset + 8);
  if (kind === 'IDAT' && length >= 2) {
    broken[offset + 9] ^= 0x5e;
    damaged = true;
    break;
  }
  offset += 12 + length;
}
assert(damaged, 'Fixture should have IDAT data');
assert(!inspectAnimation(asBuffer(broken), 'png').valid, 'IDAT corruption must fail CRC');
const repairedCrc = Buffer.from(broken);
const end = offset + 8 + repairedCrc.readUInt32BE(offset);
repairedCrc.writeUInt32BE(pngCrc(repairedCrc, offset + 4, end), end);
assert(inspectAnimation(asBuffer(repairedCrc), 'png').valid,
  'CRC-valid PNG with corrupted compressed pixels needs a pixel-level decoder');

const { useEditor } = load('store/editor');
const state = useEditor.getState();
const video = { name:'clip.mp4', kind:'video', width:1920, height:1080, duration:12, fileSize:10000 };
state.setMeta(video);
state.setTrim(1.5, 11.5);
state.setMode('sticker');
state.setStickerMotion('animated');
assert(useEditor.getState().trimEnd <= 6.5, 'Animated sticker cannot exceed five seconds');
state.setMode('gif');
assert.equal(useEditor.getState().trimStart, 1.5);
assert.equal(useEditor.getState().trimEnd, 11.5, 'GIF trim must be restored after sticker selection');
state.setMode('sticker');
state.setStickerMotion('static');
state.setTrim(2, 10);
state.setStickerMotion('animated');
assert(useEditor.getState().trimEnd <= 7, 'Animated sticker trim capped to five seconds');
state.setStickerMotion('static');
assert.equal(useEditor.getState().trimEnd, 10, 'Static sticker restores chosen trim');
state.setMeta({ ...video, name:'new.mp4' });
assert.equal(useEditor.getState().savedGifTrim, null, 'New upload clears previous trim backup');
const plan = load('lib/exportPlan').exportPlan(video);
assert(plan.frameCount > 0);
const mediaSource = fs.readFileSync(path.join(root, 'lib/media.ts'), 'utf8');
const exportSource = fs.readFileSync(path.join(root, 'lib/export.ts'), 'utf8');
assert(mediaSource.includes('rejectAnimatedWebp'), 'Animated WebP must not silently flatten');
assert(exportSource.includes('isolatedVideo(media, signal)'), 'Export uses separate video decoder');
assert(exportSource.includes("type: 'frame'"), 'Frame packets must be sent to worker');
assert(!exportSource.includes('const frames: ArrayBuffer[] = []'), 'Do not accumulate raw video frames in main thread');
assert(exportSource.includes('validateDecodedOutput(await blob.arrayBuffer()'), 'Static PNG fast-path must decode before download');
console.log('PASS: CRC regression, decoder-required corrupt PNG, GIF trim restore, video isolation, stream transfer');
