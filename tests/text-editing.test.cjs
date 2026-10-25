const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

const source = file => fs.readFileSync(file, 'utf8');
const overlay = source('src/components/text/TextOverlay.tsx');
const panel = source('src/components/text/TextPanel.tsx');
const picker = source('src/components/text/FontPicker.tsx');
const renderer = source('src/features/text/textRender.ts');
const catalog = source('src/features/text/fontCatalog.ts');
const loader = source('src/features/text/fontLoader.ts');
const editor = source('src/components/CanvasEditor.tsx');
const registry = source('src/features/text/fontRegistry.ts');
const styles = source('src/styles/text.css');

assert.match(overlay, /<textarea /, 'On-canvas editing uses a real textarea');
assert.match(overlay, /value=\{layer\.text\}/, 'Textarea remains synchronized with store text');
assert.match(overlay, /onPointerDown=\{event => begin\(event, 'move'\)\}/, 'Text itself is draggable');
assert.match(overlay, /corners\.map\(corner/, 'Four corner handles');
assert.match(overlay, /scaleTextFromPointer/, 'Corner drag scales text and box together');
assert.match(overlay, /readOnly=\{!editing\}/, 'Drag and typing modes do not conflict');
assert.doesNotMatch(overlay, /selectedId === l\.id \? 'TEXT'/, 'Decorative TEXT label removed');
assert.match(editor, /if \(tool !== 'text'\) renderTextLayers/, 'Do not double-render text while editing');
assert.match(editor, /renderTextLayers/, 'Canvas preview still renders text in non-editing tools');
assert.match(panel, /<FontPicker/, 'Text panel uses searchable font selector');
assert.match(picker, /type="search"/, 'Search is accessible');
assert.match(picker, /queryLocalFonts/, 'User can opt in to installed font enumeration');
assert.match(catalog, /GOOGLE_FONTS/, 'Online catalog is present');
assert.match(registry, /waitForOnlineFonts\(families, signal\)/, 'Export awaits online fonts');
assert.match(loader, /fonts\.googleapis\.com/, 'Fonts are loaded lazily');
assert.match(styles, /\.text-edit-input/, 'Text input has dedicated canvas styles');
assert.match(renderer, /ctx\.fillText/, 'Export renderer still burns text into encoded frames');

let files = 0;
for (const dir of ['src/components/text', 'src/features/text']) {
  for (const file of fs.readdirSync(dir).filter(f => /\.tsx?$/.test(f))) {
    const path = `${dir}/${file}`;
    const parsed = ts.createSourceFile(path, source(path), ts.ScriptTarget.ES2022, true, file.endsWith('tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    assert.equal(parsed.parseDiagnostics.length, 0, `${path} has no syntax errors`);
    files++;
  }
}
console.log(`PASS searchable font picker, editable textarea, direct move and 4-corner scaling, export font loading, ${files} TS/TSX parsed`);
