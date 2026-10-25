const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const read = file => fs.readFileSync(file, 'utf8');
const compile = source => ts.transpileModule(source, { compilerOptions: {
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS,
}}).outputText;
const moduleExports = {};
vm.runInNewContext(compile(read('src/features/text/color.ts')), { exports: moduleExports });
const { hsvToHex, hexToHsv, normalizeHex, withHue } = moduleExports;

assert.equal(normalizeHex('#ffffff'), '#FFFFFF');
assert.equal(normalizeHex('f06'), '#FF0066');
assert.equal(normalizeHex('#5865F2'), '#5865F2');
assert.equal(normalizeHex('#GGGGGG'), null);
assert.equal(normalizeHex(''), null);
assert.equal(normalizeHex('#12345678'), null);
for (const hex of ['#000000', '#FFFFFF', '#FF0000', '#00FF00', '#0000FF', '#5865F2', '#F4A820', '#2D4F75']) {
  assert.equal(hsvToHex(hexToHsv(hex)), hex, `HSV roundtrip for ${hex}`);
}
for (let h = 0; h < 360; h += 13) for (let s = 0; s <= 1; s += .2) for (let v = 0; v <= 1; v += .25) {
  const result = hsvToHex({ h, s, v });
  assert.match(result, /^#[0-9A-F]{6}$/);
  const reencoded = hsvToHex(hexToHsv(result));
  assert.equal(result, reencoded, `HSV stable: ${h}/${s}/${v}`);
}
assert.equal(withHue({h:100,s:.6,v:.8},-1).h,0);
assert.equal(withHue({h:100,s:.6,v:.8},360).h,359);

const component = read('src/components/text/ColorPicker.tsx');
const panel = read('src/components/text/TextPanel.tsx');
const editor = read('src/components/CanvasEditor.tsx');
const css = read('src/styles/text.css');
assert.match(component, /onPointerMove/, 'Saturation square pointer movement');
assert.match(component, /setPointerCapture/, 'Smooth drag even outside picker');
assert.match(component, /requestAnimationFrame/, 'Throttled store updates');
assert.match(component, /pending\.current/, 'Most recent drag color is committed');
assert.match(component, /onPointerUp=\{finish\}/, 'Flush on pointerup');
assert.match(component, /aria-label=\{`\$\{label\} saturation`\}/, 'Accessible saturation adjustment');
assert.match(component, /aria-label=\{`\$\{label\} brightness`\}/, 'Accessible brightness adjustment');
assert.match(component, /type="range" className="nx-color-hue"/, 'Accessible hue slider');
assert.match(component, /type="text" className="nx-color-hex"/, 'Custom HEX input');
assert.match(component, /PRESETS\.map/, 'Color presets');
assert.match(component, /recentColors\.map/, 'Recent colors');
assert.doesNotMatch(component, /type="color"/, 'No native color input');
for (const name of ['Text color', 'Outline color', 'Shadow color', 'Background color']) {
  assert.ok(panel.includes(`label="${name}"`), `${name} uses custom ColorPicker`);
}
assert.match(panel, /className="text-format-toolbar"/, 'Formatting and font import in a single row');
assert.match(panel, /className="text-toggle-row"/, 'B I U formatting preserved');
assert.match(panel, /className="button button-light text-import"/, 'Import font preserved');
assert.match(editor, /tool === 'text' \? 0 : s\.revision/, 'No redundant video redraw on text edits');
assert.match(css, /\.nx-color-panel/, 'Custom palette CSS');
assert.match(css, /\.nx-color-area-white/, 'Saturation gradient');
assert.match(css, /\.nx-color-hue/, 'Hue gradient');
for (const file of ['src/components/text/ColorPicker.tsx','src/components/text/TextPanel.tsx','src/components/CanvasEditor.tsx']) {
  const ast = ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  assert.equal(ast.parseDiagnostics.length, 0, `Syntax ${file}`);
}
console.log('PASS color picker: HEX↔HSV conversion, edge cases, pointer/keyboard, color roles, inline B/I/U/import, redraw isolation');
