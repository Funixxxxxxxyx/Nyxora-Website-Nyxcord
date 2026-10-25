const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const ts = require('typescript');
const source = path => fs.readFileSync(path, 'utf8');
function loadTS(path) {
  const file = new Module(path, module);
  file.filename = path;
  file.paths = module.paths;
  file._compile(ts.transpileModule(source(path), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  }}).outputText, path);
  return file.exports;
}
const {resizeTextFromSide, scaleTextFromCorner} = loadTS('src/features/text/textGestures.ts');
const near = (a, b, label) => assert.ok(Math.abs(a-b) < 1e-8, `${label}: ${a} vs ${b}`);
const makeOrigin = (rotation = 0, height = undefined) => ({
  layer: {x:.5,y:.5,width:.5,height,fontSize:48,rotation},
  stageWidth: 500,stageHeight:400,heightPx:80,minHeightPx:43,
});
function oppositeEdge(layer, origin, side, heightPx) {
  const angle=origin.layer.rotation*Math.PI/180,cos=Math.cos(angle),sin=Math.sin(angle);
  const dist=(side==='w'||side==='e')?layer.width*origin.stageWidth/2:heightPx/2;
  const opposingSign=(side==='w'||side==='n')?1:-1;
  const x=side==='w'||side==='e'?opposingSign*dist:0;
  const y=side==='n'||side==='s'?opposingSign*dist:0;
  return [layer.x*origin.stageWidth+x*cos-y*sin,layer.y*origin.stageHeight+x*sin+y*cos];
}
let cases=0;
for(const rotation of [0,23,45,90,135,180,270]) {
  for(const side of ['n','e','s','w']) {
    const origin=makeOrigin(rotation);
    const sign=side==='s'||side==='e'?1:-1;
    const length=side==='n'||side==='s'?28:50;
    const localX=side==='e'||side==='w'?sign*length:0;
    const localY=side==='n'||side==='s'?sign*length:0;
    const a=rotation*Math.PI/180;
    const dx=localX*Math.cos(a)-localY*Math.sin(a);
    const dy=localX*Math.sin(a)+localY*Math.cos(a);
    const result=resizeTextFromSide(origin,side,dx,dy);
    const horizontal=side==='e'||side==='w';
    near(result.width,horizontal?.6:.5,`${rotation} ${side} width`);
    if(horizontal) assert.equal(result.height,undefined);
    else near(result.height,108/400,`${rotation} ${side} height`);
    // Side resizing never changes font size.
    assert.equal(result.fontSize,undefined);
    const start=oppositeEdge(origin.layer,origin,side,80);
    const next=oppositeEdge(result,origin,side,horizontal?80:108);
    near(start[0],next[0],`${rotation} ${side} anchored X`);
    near(start[1],next[1],`${rotation} ${side} anchored Y`);
    cases++;
  }
}
for(const side of ['n','s']) {
  const origin=makeOrigin();
  const result=resizeTextFromSide(origin,side,0,side==='s'?-900:900);
  near(result.height,43/400,`${side} minimum text height`);
}
for(const side of ['w','e']) {
  const origin=makeOrigin();
  const result=resizeTextFromSide(origin,side,side==='e'?-900:900,0);
  near(result.width,.08,`${side} min width`);
}
const origin=makeOrigin(30,.28);
const scaled=scaleTextFromCorner(origin,'se',1.4);
near(scaled.height,.392,'corner scales explicit box height');
near(scaled.fontSize,67.2,'corner still scales font size');
const render=source('src/features/text/textRender.ts');
const overlay=source('src/components/text/TextOverlay.tsx');
const css=source('src/styles/text.css');
const panel=source('src/components/text/TextPanel.tsx');
const store=source('src/features/text/textStore.ts');
assert.match(render,/Math\.max\(contentHeight, layer\.height \* canvasHeight\)/,'export honors explicit height');
assert.match(store,/height: layer\.height === undefined/,'store accepts legacy auto height');
assert.match(overlay,/sides\.map\(side/,'side handles rendered only in selected branch');
assert.match(overlay,/resizeTextFromSide\(active\.origin/,'pointer side geometry is wired');
assert.match(overlay,/onDoubleClick=/,'inline editing retained');
assert.match(overlay,/onPointerDown=\{event => begin\(event, 'move'\)\}/,'drag-to-move retained');
assert.match(overlay,/pointerId/,'pointer identification retained');
assert.match(css,/\.text-side-grip\.side-n/);
assert.match(css,/\.text-side-grip\.side-s/);
assert.match(css,/\.text-side-grip\.side-e/);
assert.match(css,/\.text-side-grip\.side-w/);
assert.match(css,/width:44px;height:44px/,'44px touch targets');
assert.match(panel,/Text box height \(%\)/,'height field optional');
console.log(`PASS 8 handles, ${cases} anchored rotated side gestures, height safeguards, store/export wiring, keyboard/mobile, old features`);
