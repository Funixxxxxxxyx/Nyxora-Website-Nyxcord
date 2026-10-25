const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const read = name => fs.readFileSync(name, 'utf8');
const js = name => ts.transpileModule(read(name), { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
}}).outputText;
const load = (name, mapping = {}, extras = {}) => {
  const exports = {};
  const context = { exports, require: id => { if (!(id in mapping)) throw Error(`Unexpected dependency ${id}`); return mapping[id]; },
    crypto: { randomUUID: () => String(++counter) }, document: extras.document,
    FontFace: extras.FontFace, Uint8Array, console, Map, Set, Promise, DOMException,
  };
  vm.runInNewContext(js(name), context, { filename: name });
  return exports;
};
let counter = 0;
const color = load('src/features/text/color.ts');
for (let i = 0; i < 4000; i++) {
  const raw = '#' + Math.floor((i * 7993) % 0x1000000).toString(16).padStart(6, '0');
  assert.equal(color.hsvToHex(color.hexToHsv(raw)), raw.toUpperCase());
}
const textRender = load('src/features/text/textRender.ts');
const measure = { measureText: text => ({width: Array.from(text).length * 9}) };
assert.deepEqual(Array.from(textRender.wrapTextLines(measure, 'Hello world', 60)), ['Hello', 'world']);
assert.deepEqual(Array.from(textRender.wrapTextLines(measure, 'A'.repeat(19), 45)), ['AAAAA','AAAAA','AAAAA','AAAA']);
assert.ok(textRender.wrapTextLines(measure, 'A'.repeat(600), 45).length <= 100);
const defaults = load('src/features/text/types.ts');
let instance;
const zustand = { create: init => {
  let state;
  const store = selector => selector(state);
  store.getState = () => state;
  state = init(updater => { const patch = typeof updater === 'function' ? updater(state) : updater;
    if (patch === state) return;
    state = {...state, ...patch};
  });
  instance = store;
  return store;
}};
const { MAX_TEXT_LAYERS } = load('src/features/text/textStore.ts', {
  zustand, './types': defaults,
});
assert.equal(MAX_TEXT_LAYERS, 32);
instance.getState().add();
let state = instance.getState();
const id = state.layers[0].id;
const firstRevision = state.revision;
instance.getState().update(id, { color: state.layers[0].color });
assert.equal(instance.getState().revision, firstRevision, 'No-op color must not invalidate an export');
instance.getState().update('not-a-layer', {color:'#FF0000'});
assert.equal(instance.getState().revision, firstRevision, 'Unknown layer updates must be ignored');
instance.getState().update(id, {text:'x'.repeat(900)});
assert.equal(instance.getState().layers[0].text.length, 600);
for(let i=0;i<50;i++) instance.getState().add();
assert.equal(instance.getState().layers.length, 32, 'Limit protects browser from unbounded text layers');
instance.getState().duplicate(id);
assert.equal(instance.getState().layers.length, 32);
instance.getState().reset();
assert.equal(instance.getState().layers.length, 0);

// Validate session invalidation during an asynchronously decoded font.
let deliver;
const fontPromise = new Promise(resolve => {deliver = resolve;});
const faces = new Set();
class FakeFontFace {
  constructor(family) {this.family=family;}
  load() {return fontPromise;}
}
const doc = { fonts: {add(face){faces.add(face)}, delete(face){faces.delete(face)}, load:async()=>[]} };
const registry = load('src/features/text/fontRegistry.ts', {
  './fontLoader':{isOnlineFont:()=>false,waitForOnlineFonts:async()=>{}},
},{FontFace:FakeFontFace,document:doc});
const file = {name:'test.ttf',size:8,arrayBuffer:async()=>new Uint8Array([0,1,0,0,0,0,0,0]).buffer};
(async()=>{
  const importing = registry.importFont(file);
  await Promise.resolve();await Promise.resolve();
  registry.resetImportedFonts();
  deliver({});
  await assert.rejects(importing,/session change/);
  assert.equal(registry.listImportedFonts().length,0);
  assert.equal(faces.size,0);
  assert.match(read('src/App.tsx'), /editorUnsubscribe = useEditor.subscribe/);
  assert.match(read('src/App.tsx'), /textUnsubscribe = useTextStore.subscribe/);
  assert.match(read('src/App.tsx'), /next\.sizeTargetMB !== previous\.sizeTargetMB/);
  assert.match(read('src/App.tsx'), /next\.playhead !== previous\.playhead/);
  assert.match(read('src/lib/export.ts'), /watchdog\(\)/);
  assert.match(read('src/lib/media.ts'), /SVG and other browser-rendered documents/);
  assert.match(read('src/lib/media.ts'), /media\.gifCanvas\.width = 0/);

  // All source syntax, relative imports, and file-length limits.
  let parsed = 0;
  function visit(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})) {
    const filename = path.join(dir,entry.name);
    if(entry.isDirectory())visit(filename);
    else if(/\.tsx?$/.test(filename)){
      const src=read(filename);
      const ast=ts.createSourceFile(filename,src,ts.ScriptTarget.Latest,true,
        filename.endsWith('.tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS);
      assert.equal(ast.parseDiagnostics.length,0,`Parse ${filename}`);
      assert.ok(src.split('\n').length<1000,`Maintainable module size ${filename}`);
      for(const m of src.matchAll(/(?:from\s*|import\s*\()\s*['"](\.[^'"]+)['"]/g)){
        const dep=path.resolve(path.dirname(filename),m[1]);
        assert.ok(['','.ts','.tsx','.js','.jsx'].some(ext=>fs.existsSync(dep+ext)),`Missing relative module: ${filename} -> ${dep}`);
      }
      parsed++;
    }
  }}visit('src');
  assert.ok(parsed>=35);
  console.log(`PASS deep audit: 4000 HSV roundtrips, text wrap, 32-layer limit, state no-ops, import cancellation, source guards, ${parsed} TS/TSX ASTs and relative imports`);
})().catch(err => {console.error(err);process.exitCode=1});
