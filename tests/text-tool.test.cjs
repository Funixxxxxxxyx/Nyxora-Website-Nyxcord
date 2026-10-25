const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function loadTextRenderer() {
  const source = fs.readFileSync('src/features/text/textRender.ts', 'utf8');
  const output = ts.transpileModule(source, { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS,
  }}).outputText;
  const scope = { exports: {} };
  vm.runInNewContext(output, scope);
  return scope.exports;
}

const { layerVisible, renderTextLayers } = loadTextRenderer();
const layer = {
  id: 'test', text: 'Hello World', x: .5, y: .5, width: .7, rotation: 15,
  fontFamily: 'Arial', fontSize: 32, bold: true, italic: false,
  underline: false, color: '#fff', align: 'center', outlineColor: '#000',
  outlineWidth: 2, shadowColor: '#000', shadowBlur: 0,
  shadowOffsetX: 0, shadowOffsetY: 0, background: 'solid',
  backgroundColor: '#000', backgroundOpacity: .5, padding: 8,
  timing: 'custom', fromMs: 500, toMs: 1500, hidden: false, locked: false,
};

assert.equal(layerVisible(layer, 499), false);
assert.equal(layerVisible(layer, 500), true);
assert.equal(layerVisible(layer, 1499), true);
assert.equal(layerVisible(layer, 1500), false);
assert.equal(layerVisible({ ...layer, timing: 'entire' }, 99999), true);
assert.equal(layerVisible({ ...layer, hidden: true }, 500), false);

function stubCanvas() {
  const calls = [];
  const ctx = {
    save: () => calls.push('save'), restore: () => calls.push('restore'),
    translate: () => calls.push('translate'), rotate: () => calls.push('rotate'),
    beginPath: () => calls.push('beginPath'), moveTo: () => {}, arcTo: () => {},
    closePath: () => {}, rect: () => {}, fill: () => calls.push('fill'),
    measureText: text => ({ width: text.length * 12 }),
    fillText: () => calls.push('fillText'), strokeText: () => calls.push('strokeText'),
    fillRect: () => calls.push('fillRect'),
  };
  return { calls, ctx };
}

const before = stubCanvas();
renderTextLayers(before.ctx, [layer], 300, 400, 400);
assert.equal(before.calls.length, 0, 'Text cannot render before custom duration');
const during = stubCanvas();
renderTextLayers(during.ctx, [layer, { ...layer, id: 'two', text: 'Second', y: .7 }], 900, 400, 400);
assert.equal(during.calls.filter(c => c === 'fillText').length, 2, 'Render multiple layers');
assert.equal(during.calls.filter(c => c === 'strokeText').length, 2, 'Apply outlines');
assert.equal(during.calls.filter(c => c === 'fill').length, 2, 'Apply backgrounds');
assert.equal(during.calls.filter(c => c === 'rotate').length, 2, 'Apply rotations');
const after = stubCanvas();
renderTextLayers(after.ctx, [layer], 1800, 400, 400);
assert.equal(after.calls.length, 0, 'Text cannot render after custom duration');
const underline = stubCanvas();
renderTextLayers(underline.ctx, [{ ...layer, underline: true }], 700, 400, 400);
assert.ok(underline.calls.includes('fillRect'), 'Underline should render');
console.log('PASS Text Tool: multiple layers, duration, rotation, outline, background, underline');

const controls = fs.readFileSync('src/components/EditorControls.tsx', 'utf8');
assert.match(controls, /\{ id: 'text', label: 'Text', icon: Type \}/, 'Text must be accessible from the toolbar');
assert.match(controls, /store\.tool === 'text' && <TextPanel\/>/, 'Text tab must open the TextPanel');
const editorCanvas = fs.readFileSync('src/components/CanvasEditor.tsx', 'utf8');
assert.match(editorCanvas, /tool === 'text' && !busy && <TextOverlay designWidth=/, 'Text controls must appear over the canvas');
console.log('PASS Text UI: toolbar tab, panel and canvas overlay are wired');
