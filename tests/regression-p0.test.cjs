const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '../src');
const loaded = new Map();
function create(init) {
  let state;
  const set = update => { state = {...state, ...(typeof update === 'function' ? update(state) : update)}; };
  const get = () => state;
  state = init(set,get);
  const hook = () => state;
  hook.getState = get;
  return hook;
}
function load(rel) {
  const file = path.resolve(root, rel.endsWith('.ts') ? rel : `${rel}.ts`);
  if (loaded.has(file)) return loaded.get(file).exports;
  const js = ts.transpileModule(fs.readFileSync(file,'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const mod={exports:{}};
  loaded.set(file,mod);
  const request = name => name==='zustand' ? {create} : name.startsWith('.') ? load(path.relative(root,path.resolve(path.dirname(file),name))) : require(name);
  new Function('module','exports','require',js)(mod,mod.exports,request);
  return mod.exports;
}
const { useEditor, fittedCrop } = load('store/editor');
const {rotateRect,unrotateRect} = load('lib/rotation');
const { exportPlan, FRAME_MEMORY_BYTES } = load('lib/exportPlan');
const s = useEditor.getState();
const image = {name:'original.png',kind:'image',width:1920,height:1080,duration:0,fileSize:50000};
const video = {...image, name:'sample.mp4', kind:'video',duration:5};
const CROP = () => useEditor.getState().crop;
const META = () => useEditor.getState();
const almost = (x,y)=>assert(Math.abs(x-y)<.001,`${x} != ${y}`);
let checks=0;
function test(name,fn) { fn(); checks++; process.stdout.write(`PASS ${name}\n`); }
test('CROP-01 upload starts full source',()=> {s.setMeta(image);assert.deepEqual(CROP(),{x:0,y:0,width:1920,height:1080});assert.equal(META().rotation,0);assert.equal(META().ratio,'free');});
test('CROP-02 ratio 1:1 -> 16:9 -> Free never progressively shrinks',()=>{s.setRatio('1:1');assert.deepEqual(CROP(),{x:420,y:0,width:1080,height:1080});s.setRatio('16:9');assert.deepEqual(CROP(),{x:0,y:0,width:1920,height:1080});s.setRatio('free');assert.deepEqual(CROP(),{x:0,y:0,width:1920,height:1080});});
test('CROP-03 tab switch preserves manual selection',()=>{const r={x:100,y:200,width:800,height:450};s.setCrop(r);s.setTool('trim');s.setTool('resize');s.setTool('crop');assert.deepEqual(CROP(),r);});
test('CROP-04 rotation retains same selected source pixels',()=>{const r={x:190,y:90,width:800,height:400};s.setCrop(r);s.rotate('right');assert.deepEqual(CROP(),r);const displayed=rotateRect(CROP(),1920,1080,90);assert.deepEqual(unrotateRect(displayed,1920,1080,90),r);assert.equal(META().tool,'crop');});
test('CROP-05 rotate then ratio 16:9 uses entire oriented source',()=>{s.setRatio('16:9');const shown=rotateRect(CROP(),1920,1080,90);almost(shown.width/shown.height,16/9);almost(shown.width,1080);almost(shown.height,607.5);});
test('CROP-06 resetCrop preserves rotation and unlocks ratio',()=>{s.resetCrop();assert.deepEqual(CROP(),{x:0,y:0,width:1920,height:1080});assert.equal(META().rotation,90);assert.equal(META().ratio,'free');assert(META().outputHeight<=1920);});
test('CROP-07 four clockwise rotations restore dimensions',()=>{const r={x:200,y:100,width:300,height:200};s.setCrop(r);s.rotate('right');s.rotate('right');s.rotate('right');assert.equal(META().rotation,0);assert.deepEqual(CROP(),r);});
test('CROP-08 upload replacement resets all transforms',()=>{s.setMeta({...image,name:'next.png',width:512,height:256});assert.deepEqual(CROP(),{x:0,y:0,width:512,height:256});assert.equal(META().rotation,0);assert.equal(META().playhead,0);});
test('CROP-09 strict native canvas size when width changed',()=>{s.setCrop({x:50,y:10,width:200,height:100});s.setWidth(10000);assert.equal(META().outputWidth,200);assert.equal(META().outputHeight,100);});
test('CROP-10 manual canvas size survives tabs',()=>{s.setWidth(100);s.setTool('resize');s.setTool('crop');assert.equal(META().outputWidth,100);});
test('ENC-01 animated clip 720x405 5s maintains default 15 FPS',()=>{s.setMeta(video);const p=exportPlan(video);assert.equal(p.frameCount,75);almost(p.fps,15);assert(!p.wasFrameReduced);});
test('ENC-02 animated sticker stays within memory bound without 4fps degradation',()=>{s.setMode('sticker');s.setStickerMotion('animated');const p=exportPlan(video);almost(p.fps,10);assert(p.width*p.height*4<=FRAME_MEMORY_BYTES);});
test('ENC-03 video static sticker selects one frame',()=>{s.setStickerMotion('static');s.setPlayhead(2.5);const p=exportPlan(video);assert.equal(META().playhead,2.5);assert.equal(p.frameCount,1);assert.equal(p.fps,0);});
test('SESSION-01 resetSession clears crop/media/result',()=>{s.setCrop({x:0,y:0,width:100,height:100});s.resetSession();assert.equal(META().meta,null);assert.equal(META().result,null);assert.equal(META().rotation,0);});
const source=fs.readFileSync(path.join(root,'App.tsx'),'utf8');
test('DL-01 anchor download is a button-only cached-file action',()=>{assert(source.includes('anchor.download = result.name'));assert(source.includes('downloadFile(prepared)'));assert(!source.includes('location.reload('));});
test('UI-01 one CanvasSizeFields component only',()=>{const files=['components/EditorControls.tsx','components/OutputSettings.tsx'];let count=0;for(const f of files)count+= (fs.readFileSync(path.join(root,f),'utf8').match(/<CanvasSizeFields\s*\/>/g)||[]).length;assert.equal(count,1);});
test('UI-02 conditional export settings only after media',()=>{assert(source.includes('{media && <EditorErrorBoundary'));assert(fs.readFileSync(path.join(root,'components/OutputSettings.tsx'),'utf8').includes('!sticker && moving'));});
test('UI-03 independent decoded frame validation invoked before Blob',()=>{const exportCode=fs.readFileSync(path.join(root,'lib/export.ts'),'utf8');assert(exportCode.indexOf('await validateDecodedOutput(')<exportCode.indexOf('const blob = new Blob('));});
console.log(`${checks} Nyxcord P0 regression assertions passed.`);
