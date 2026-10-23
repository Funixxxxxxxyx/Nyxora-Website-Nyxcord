const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '../src');
const cache = new Map();

function mockCreate(initializer) {
  let current;
  const listeners = new Set();
  const set = update => {
    current = { ...current, ...(typeof update === 'function' ? update(current) : update) };
    listeners.forEach(listener => listener(current));
  };
  const get = () => current;
  current = initializer(set, get);
  const hook = () => current;
  hook.getState = get;
  hook.setState = set;
  hook.subscribe = listener => { listeners.add(listener); return () => listeners.delete(listener); };
  return hook;
}
function load(relative) {
  let file = path.resolve(root, relative);
  if (!file.endsWith('.ts')) file += '.ts';
  if (cache.has(file)) return cache.get(file).exports;
  const output = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: file,
  });
  const module = { exports: {} };
  cache.set(file, module);
  const localRequire = request => {
    if (request === 'zustand') return { create: mockCreate };
    if (request.startsWith('.')) return load(path.relative(root, path.resolve(path.dirname(file), request)));
    throw new Error(`Unexpected runtime dependency: ${request}`);
  };
  new Function('module', 'exports', 'require', output.outputText)(module, module.exports, localRequire);
  return module.exports;
}

const { rotateRect, rotatedSize, unrotateRect } = load('lib/rotation');
const { useEditor } = load('store/editor');
const { exportPlan, FRAME_MEMORY_BYTES } = load('lib/exportPlan');
const rect = { x: 250, y: 135, width: 680, height: 420 };
for (const angle of [0, 90, 180, 270]) {
  const transformed = rotateRect(rect, 1920, 1080, angle);
  const restored = unrotateRect(transformed, 1920, 1080, angle);
  assert.deepEqual(restored, rect, `Rotation ${angle} round trip`);
  const limits = rotatedSize(1920, 1080, angle);
  assert(transformed.x >= 0 && transformed.x + transformed.width <= limits.width);
  assert(transformed.y >= 0 && transformed.y + transformed.height <= limits.height);
}

const s = useEditor.getState();
const image = { name: 'test.png', kind: 'image', width: 1920, height: 1080, duration: 0, fileSize: 100000 };
s.setMeta(image);
assert.equal(useEditor.getState().mode, 'sticker', 'Static images default to Sticker');
s.setMode('gif');
assert.equal(useEditor.getState().mode, 'sticker', 'Static images cannot switch to GIF');
s.setCrop(rect);
s.rotate('right');
assert.equal(useEditor.getState().rotation, 90);
assert.equal(useEditor.getState().preview, false, 'Rotation leaves crop active');
assert.equal(useEditor.getState().tool, 'crop');
assert.equal(useEditor.getState().outputHeight, 680, 'Auto output follows the rotated crop when within safe pixel budget');
assert(useEditor.getState().outputWidth <= 420, 'Automatic dimensions respect rotated crop');
const inRotatedSpace = rotateRect(useEditor.getState().crop, 1920, 1080, 90);
const changed = { ...inRotatedSpace, x: inRotatedSpace.x + 15, y: inRotatedSpace.y + 10 };
s.setCrop(unrotateRect(changed, 1920, 1080, 90));
assert.deepEqual(rotateRect(useEditor.getState().crop, 1920, 1080, 90), changed);
s.setRatio('16:9');
const framed = rotateRect(useEditor.getState().crop, 1920, 1080, 90);
assert(Math.abs(framed.width / framed.height - 16 / 9) < .001);

s.setMeta(image);
let plan = exportPlan(image);
assert.equal(plan.width, 1920, 'Auto Sticker follows full native crop below pixel budget');
assert.equal(plan.duration, 0);
assert(!plan.animated);
s.setWidth(640);
plan = exportPlan(image);
assert.equal(plan.width, 640, 'Manual Canvas Size respected');
assert.equal(plan.height, 360);
s.setWidth(12000);
assert(exportPlan(image).width <= image.width, 'Never upscale beyond native crop');

const video = { ...image, name: 'clip.mp4', kind: 'video', duration: 9 };
s.setMeta(video);
assert.equal(useEditor.getState().mode, 'gif', 'Video defaults to GIF');
plan = exportPlan(video);
assert(plan.animated && plan.duration > 0, 'GIF preserves selected duration');
s.setMode('sticker');
assert.equal(useEditor.getState().stickerMotion, 'static');
plan = exportPlan(video);
assert.equal(plan.frameCount, 1, 'Static sticker needs one selected frame');
assert.equal(plan.duration, 0, 'Static sticker has no animation duration');
assert.equal(plan.fps, 0, 'Static sticker has no FPS');
s.setPlayhead(3.25);
assert.equal(useEditor.getState().playhead, 3.25);
s.setStickerMotion('animated');
plan = exportPlan(video);
assert(plan.animated, 'Animated sticker encodes frames');
assert(plan.duration <= 5.001, 'Animated sticker observes Nyxcord five-second preset');
assert(plan.width * plan.height * 4 <= FRAME_MEMORY_BYTES, 'Streaming export bounds each frame, not the sum of all frames');
s.setMode('gif');
assert(exportPlan(video).animated, 'Switching back to GIF restores animation');

const editor = fs.readFileSync(path.join(root, 'components/OutputSettings.tsx'), 'utf8');
assert(editor.includes('moving && <section'), 'Output selector only for moving media');
assert(editor.includes('sticker && <div className="sticker-motion"'), 'Animated media has sticker type selector');
assert(editor.includes('!sticker && moving'), 'GIF-only advanced controls are conditional');
assert(!editor.includes('From crop') && !editor.includes('320 × 320'), 'No old sticker sizing controls');
const app = fs.readFileSync(path.join(root, 'App.tsx'), 'utf8');
assert(app.includes('{media && <EditorErrorBoundary') && app.includes('<OutputSettings media={media}/>'), 'Export settings hidden before upload');
const exporter = fs.readFileSync(path.join(root, 'lib/export.ts'), 'utf8');
assert(exporter.includes('settings.playhead'), 'Static video sticker uses current playhead');
assert(exporter.includes('!animated'), 'Static sticker uses PNG path');

// No unbounded one-file modules or page reload APIs.
function files(directory) {
  return fs.readdirSync(directory).flatMap(item => {
    const name = path.join(directory, item);
    return fs.statSync(name).isDirectory() ? files(name) : [name];
  });
}
for (const file of files(root)) {
  if (!/\.(tsx?|css)$/.test(file)) continue;
  const content = fs.readFileSync(file, 'utf8');
  const length = content.trimEnd().split('\n').length;
  assert(length < 1000, `${path.relative(root,file)} must stay modular (${length} lines)`);
  if (file.endsWith('.ts') || file.endsWith('.tsx')) {
    const parsed = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    assert.equal(parsed.parseDiagnostics.length, 0, `${file} should parse cleanly`);
    assert(!/location\.reload\(/.test(content), 'No forced page reload');
  }
}
const canvas = fs.readFileSync(path.join(root, 'components/CanvasEditor.tsx'), 'utf8');
assert(canvas.includes('unrotateRect('));
assert(canvas.includes('drawRotatedView('));
assert(!/rotate\('right'\);\s*setPreview\(true\)/.test(canvas));
const worker = fs.readFileSync(path.join(root, 'lib/encoder.worker.ts'), 'utf8');
assert(worker.includes('await import('), 'Encoders should be lazy loaded');
assert(worker.includes("type: 'ack'") && !worker.includes('current.frames.push'), 'Worker must acknowledge processed frames, not retain all raw frames');
console.log('PASS: conditional output, static frame, animated sticker, crop/rotation, memory and structure');
