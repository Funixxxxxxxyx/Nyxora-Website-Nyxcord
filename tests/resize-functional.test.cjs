const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '../src');
const cache = new Map();
function create(init) {
  let state;
  const set = update => { state = { ...state, ...(typeof update === 'function' ? update(state) : update) }; };
  const get = () => state;
  state = init(set, get);
  return { getState: get };
}
function load(relative) {
  let file = path.resolve(root, relative);
  if (!file.endsWith('.ts')) file += '.ts';
  if (cache.has(file)) return cache.get(file).exports;
  const mod = { exports: {} }; cache.set(file, mod);
  const source = fs.readFileSync(file, 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  }}).outputText;
  const request = spec => spec === 'zustand' ? { create } : spec.startsWith('.')
    ? load(path.relative(root, path.resolve(path.dirname(file), spec))) : require(spec);
  new Function('module', 'exports', 'require', compiled)(mod, mod.exports, request);
  return mod.exports;
}
const { useEditor, orientedCrop } = load('store/editor');
const { exportPlan } = load('lib/exportPlan');
const { resizePreviewGeometry, draggedOutputWidth } = load('lib/resizePreview');
const source = { name: 'photo.png', kind: 'image', width: 1920, height: 1080, duration: 0, fileSize: 100000 };
const store = useEditor.getState();
store.setMeta(source);
assert.deepEqual([useEditor.getState().outputWidth, useEditor.getState().outputHeight], [1920, 1080]);
assert.deepEqual([exportPlan(source).width, exportPlan(source).height], [1920, 1080]);
store.setTool('resize');
store.setWidth(960);
assert.deepEqual([useEditor.getState().outputWidth, useEditor.getState().outputHeight], [960, 540]);
assert.deepEqual([exportPlan(source).width, exportPlan(source).height], [960, 540]);
assert.deepEqual(useEditor.getState().crop, { x: 0, y: 0, width: 1920, height: 1080 }, 'Resize must not crop');
const full = resizePreviewGeometry(1920,1080,1920,1080);
const half = resizePreviewGeometry(960,540,1920,1080);
assert(Math.abs(full.width / 2 - half.width) <= 1, 'Preview must visibly shrink to half size');
assert.equal(draggedOutputWidth(960, 155, 1920, full.referenceWidth), 1440, 'Grip drag changes output width');
store.setHeight(270);
assert.deepEqual([useEditor.getState().outputWidth, useEditor.getState().outputHeight], [480, 270]);
store.setWidth(999999);
assert.deepEqual([useEditor.getState().outputWidth, useEditor.getState().outputHeight], [1920, 1080], 'No upscaling');
store.setCrop({ x: 100, y: 100, width: 800, height: 400 });
store.setWidth(400);
assert.deepEqual([useEditor.getState().outputWidth, useEditor.getState().outputHeight], [400, 200]);
assert.deepEqual([exportPlan(source).width, exportPlan(source).height], [400, 200]);
store.rotate('right');
assert.deepEqual([useEditor.getState().outputWidth, useEditor.getState().outputHeight], [200, 400]);
assert.deepEqual([exportPlan(source).width, exportPlan(source).height], [200, 400]);
assert.deepEqual(orientedCrop(useEditor.getState().crop, 90), { x: 0, y: 0, width: 400, height: 800 });
store.setWidth(1000);
assert.equal(useEditor.getState().outputWidth, 400, 'Rotated width bounded by original crop height');
store.setTool('crop'); store.setTool('resize');
assert.equal(useEditor.getState().outputWidth, 400, 'Switching tools does not restore old size');
const editor = fs.readFileSync(path.join(root, 'components/CanvasEditor.tsx'), 'utf8');
const controls = fs.readFileSync(path.join(root, 'components/EditorControls.tsx'), 'utf8');
const settings = fs.readFileSync(path.join(root, 'components/OutputSettings.tsx'), 'utf8');
assert(editor.includes('const outputView = preview || resizing'), 'Resize tab must render processed output');
assert(editor.includes('resizePreviewGeometry('), 'Resize tab must show size difference');
assert(editor.includes("beginDrag(e, 'resize')"), 'Resize handle must be interactive');
assert(controls.includes('<CanvasSizeFields />'), 'Width/Height fields must be in Resize tab');
assert(!settings.includes('<CanvasSizeFields'), 'Avoid duplicated Width/Height fields');
console.log('PASS: live resize, aspect lock, native limits, crop/rotate preservation, export dimensions, UI wiring');
