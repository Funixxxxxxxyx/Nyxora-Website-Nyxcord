const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const read = file => fs.readFileSync(file, 'utf8');
const app = read('src/App.tsx');
const controls = read('src/components/EditorControls.tsx');
const overlay = read('src/components/text/TextOverlay.tsx');
const picker = read('src/components/text/ColorPicker.tsx');
const fonts = read('src/components/text/FontPicker.tsx');
const loader = read('src/features/text/fontLoader.ts');
const styles = read('src/styles/brutal.css') + '\n' + read('src/styles/text.css');

// P1 — 4 tabs at narrow widths, and image-only 3-tab handling.
assert.match(styles, /grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
assert.match(styles, /\.tool-tabs\.three-tabs\{grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
assert.match(controls, /media\.meta\.kind === 'image' \? 'three-tabs'/);
assert.match(styles, /\.tool-tab\{min-width:0;min-height:42px/);
// P1 — Four independent corner handles with accessible keyboard resizing.
assert.match(styles, /\.text-corner-grip \{[^}]*width:44px;height:44px/);
for (const corner of ['nw', 'ne', 'sw', 'se']) {
  assert.match(styles, new RegExp(`\\.text-corner-grip\\.corner-${corner}\\{`));
}
assert.match(overlay, /resizeByKeyboard\(event, corner\)/);
assert.match(overlay, /aria-live="polite"/);
assert.doesNotMatch(overlay, /text-move-grip|text-width-grip|text-scale-grip/);
// P1 — Contrast + loading state guard.
assert.match(styles, /\.upload-formats\{font-size:12px;line-height:1\.55;color:#c5c7d3/);
assert.match(app, /tabIndex=\{loading \? -1 : 0\}/);
assert.match(app, /aria-disabled=\{loading\} aria-busy=\{loading\}/);
assert.match(app, /role=\{loading \? 'status' : undefined\}/);
assert.match(app, /if \(!loading\) void selectFile\(/);
// P2 — Stale color guard fixed by current prop ref and callback remains frame-throttled.
assert.match(picker, /const currentValue = useRef\(safeValue\)/);
assert.match(picker, /currentValue\.current = safeValue/);
assert.match(picker, /normalized === currentValue\.current/);
assert.doesNotMatch(picker, /normalized === safeValue/);
assert.match(picker, /requestAnimationFrame\(/);
// P2 — One trigger, invalid HEX feedback, keyboard-accessible saturation & brightness.
assert.equal((picker.match(/className="nx-color-swatch"/g) || []).length, 1);
assert.doesNotMatch(picker, /className="nx-color-expand"/);
assert.match(picker, /aria-invalid=\{hexError\}/);
assert.match(picker, /setHexError\(true\)/);
assert.match(picker, /role="alert"/);
assert.match(picker, /\$\{label\} saturation/);
assert.match(picker, /\$\{label\} brightness/);
assert.match(picker, /trigger\.current\?\.focus\(\)/);
assert.match(picker, /onPointerUp=\{finish\}/);
// P2 — Preview only on demand; no bulk font requests.
assert.match(fonts, /onMouseEnter=\{\(\) => previewFont\(font, 300\)\}/);
assert.match(fonts, /isOnlineFontReady\(font\.family\)/);
assert.match(fonts, /className=\{`font-option-preview/);
assert.match(loader, /const ready = new Set<string>\(\)/);
// P2 — More compact editor only after media opens.
assert.match(app, /media \? 'editor-active' : ''/);
assert.match(styles, /\.editor-active\.main\{padding-top:24px\}/);
assert.match(styles, /\.text-color-grid>\.nx-color-picker\{grid-column:1 \/ -1\}/);
assert.match(app, /Crop, resize, add text, and export/);
for (const file of ['src/App.tsx','src/components/EditorControls.tsx','src/components/text/TextOverlay.tsx',
  'src/components/text/ColorPicker.tsx','src/components/text/FontPicker.tsx','src/features/text/fontLoader.ts']) {
  const parsed = ts.createSourceFile(file,read(file),ts.ScriptTarget.ES2022,true,
    file.endsWith('tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS);
  assert.equal(parsed.parseDiagnostics.length,0,`Syntax valid ${file}`);
}
console.log('PASS Nyxcord P1/P2: mobile tabs, 44px targets, keyboard controls, contrast, load state, picker, font previews, compact editor');
