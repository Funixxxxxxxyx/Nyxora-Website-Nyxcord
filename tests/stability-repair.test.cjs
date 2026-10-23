const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '../src');
const modules = new Map();
function create(init) {
  let state;
  const get = () => state;
  const set = update => { state = { ...state, ...(typeof update === 'function' ? update(state) : update) }; };
  state = init(set, get);
  const hook = () => state;
  hook.getState = get;
  return hook;
}
function load(relative) {
  const sourceFile = path.resolve(root, relative.endsWith('.ts') ? relative : `${relative}.ts`);
  if (modules.has(sourceFile)) return modules.get(sourceFile).exports;
  const code = ts.transpileModule(fs.readFileSync(sourceFile, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const mod = { exports: {} };
  modules.set(sourceFile, mod);
  new Function('module', 'exports', 'require', code)(mod, mod.exports, request => {
    if (request === 'zustand') return { create };
    if (request.startsWith('.')) return load(path.relative(root, path.resolve(path.dirname(sourceFile), request)));
    throw new Error('Unexpected dependency: ' + request);
  });
  return mod.exports;
}
const { useEditor, automaticDimensions } = load('store/editor');
const { exportPlan } = load('lib/exportPlan');
const image = { name: 'test.png', kind: 'image', width: 1920, height: 1080, duration: 0, fileSize: 1000 };
const store = useEditor.getState();
store.setMeta(image);
assert.deepEqual([useEditor.getState().outputWidth, useEditor.getState().outputHeight], [1920, 1080], 'Auto size should follow native crop');
store.setCrop({ x: 20, y: 30, width: 800, height: 450 });
assert.deepEqual([useEditor.getState().outputWidth, useEditor.getState().outputHeight], [800, 450], 'Crop updates native canvas size');
const base = useEditor.getState();
assert.throws(() => exportPlan(image, { ...base, outputWidth: 801 }), /Canvas Size cannot exceed/, '1px upscaling is forbidden');
assert.throws(() => exportPlan(image, { ...base, outputHeight: 451 }), /Canvas Size cannot exceed/, '1px vertical upscaling is forbidden');
assert.equal(exportPlan(image, { ...base, outputWidth: 800, outputHeight: 450 }).width, 800);
assert(automaticDimensions({ width: 7000, height: 6000 }, 'gif').width * automaticDimensions({ width: 7000, height: 6000 }, 'gif').height <= 5_000_000);
const mediaModule = load('lib/media');
(async () => {
  const original = global.URL.createObjectURL;
  let attemptedDecode = false;
  global.URL.createObjectURL = () => { attemptedDecode = true; return 'blob:fake'; };
  try {
    const bytes = new Uint8Array(24);
    bytes.set([137, 80, 78, 71, 13, 10, 26, 10], 0);
    bytes.set(Buffer.from('IHDR'), 12);
    new DataView(bytes.buffer).setUint32(16, 90000);
    new DataView(bytes.buffer).setUint32(20, 90000);
    const file = new File([bytes], 'huge.png', { type: 'image/png' });
    await assert.rejects(() => mediaModule.loadMedia(file), /resolution is too large/);
    assert.equal(attemptedDecode, false, 'PNG pixel guard should reject before browser decode');
  } finally {
    global.URL.createObjectURL = original;
  }
  const mediaText = fs.readFileSync(path.join(root, 'lib/media.ts'), 'utf8');
  assert(mediaText.includes('decompressFrame(block, parsed.gct, false)'), 'GIF imports must not build all RGBA patches');
  assert(!mediaText.includes('decompressFrames(parsed, true)'), 'Old all-at-once patch decoder must be absent');
  const timelineText = fs.readFileSync(path.join(root, 'components/Timeline.tsx'), 'utf8');
  assert(timelineText.includes('if (allocatedVideo)'), 'Video must be released even after failed metadata');
  const exportText = fs.readFileSync(path.join(root, 'lib/export.ts'), 'utf8');
  assert(exportText.includes('canCache ? [] : null'), 'Cache remains optional');
  console.log('PASS stability: native size, strict 1px bounds, PNG preflight, GIF memory, timeline cleanup');
})().catch(e => { console.error(e); process.exitCode = 1; });
