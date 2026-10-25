const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const ts = require('typescript');
const source = name => fs.readFileSync(name, 'utf8');
const helper = source('src/features/text/textGestures.ts');
const file = new Module('textGestures.cjs');
file.filename = 'textGestures.cjs';
file.paths = module.paths;
file._compile(ts.transpileModule(helper, {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022}}).outputText, file.filename);
const {scaleTextFromPointer, scaleTextFromCorner, moveTextFromPointer} = file.exports;
const origin = (rotation = 0) => ({
  layer: { x: 0.5, y: 0.5, width: 0.5, fontSize: 48, rotation },
  stageWidth: 500, stageHeight: 300, heightPx: 60,
});
const epsilon = 1e-8;
function near(a,b,message){assert.ok(Math.abs(a-b)<epsilon, `${message}: ${a} vs ${b}`);}
function oppositePosition(state, corner, rotation, dimensions) {
  const angle=rotation*Math.PI/180,cos=Math.cos(angle),sin=Math.sin(angle);
  const signX=corner.endsWith('e')? -1 : 1;
  const signY=corner.startsWith('s')? -1 : 1;
  const height=dimensions.heightPx*state.fontSize/dimensions.layer.fontSize;
  const vx=signX*state.width*dimensions.stageWidth/2;
  const vy=signY*height/2;
  return [state.x*dimensions.stageWidth+vx*cos-vy*sin, state.y*dimensions.stageHeight+vx*sin+vy*cos];
}
for (const rotation of [0,30,90,180]) {
  for (const corner of ['nw','ne','sw','se']) {
    const before = origin(rotation);
    const changed=scaleTextFromCorner(before,corner,1.4);
    near(changed.width,0.7,`${corner}: proportional width`);
    near(changed.fontSize,67.2,`${corner}: proportional font`);
    const anchoredBefore=oppositePosition(before.layer,corner,rotation,before);
    const anchoredAfter=oppositePosition(changed,corner,rotation,before);
    near(anchoredAfter[0],anchoredBefore[0],`${rotation}° ${corner}: fixed opposite X`);
    near(anchoredAfter[1],anchoredBefore[1],`${rotation}° ${corner}: fixed opposite Y`);
    const signX=corner.endsWith('e')? 1:-1;
    const signY=corner.startsWith('s')? 1:-1;
    const angle=rotation*Math.PI/180;
    const dx=(signX*50)*Math.cos(angle)-(signY*12)*Math.sin(angle);
    const dy=(signX*50)*Math.sin(angle)+(signY*12)*Math.cos(angle);
    const dragged=scaleTextFromPointer(before,corner,dx,dy);
    assert.ok(dragged.width > before.layer.width, `${rotation}° ${corner}: outward drag grows`);
  }
}
const moved=moveTextFromPointer(origin(),50,-30);
near(moved.x,.6,'direct move X');near(moved.y,.4,'direct move Y');
assert.ok(scaleTextFromCorner(origin(),'se',99).width<=1,'max width enforced');
assert.ok(scaleTextFromCorner(origin(),'se',0.01).fontSize>=6,'min font enforced');
const overlay=source('src/components/text/TextOverlay.tsx');
const panel=source('src/components/text/TextPanel.tsx');
const canvas=source('src/components/CanvasEditor.tsx');
const styles=source('src/styles/text.css');
assert.match(overlay,/corners\.map\(corner/);
assert.match(overlay,/readOnly=\{!editing\}/);
assert.match(overlay,/onDoubleClick=/);
assert.match(overlay,/onPointerDown=\{event => begin\(event, 'move'\)\}/);
assert.match(overlay,/onPointerCancel=\{finish\}/);
assert.match(overlay,/onLostPointerCapture=\{finish\}/);
assert.match(overlay,/cancelAnimationFrame\(/);
assert.match(canvas,/\.closest\('\.text-edit-box'\)/);
assert.match(styles,/\.text-corner-grip\.corner-nw/);
assert.match(styles,/\.text-corner-grip\.corner-ne/);
assert.match(styles,/\.text-corner-grip\.corner-sw/);
assert.match(styles,/\.text-corner-grip\.corner-se/);
assert.doesNotMatch(overlay,/GripVertical|text-move-grip|text-scale-grip/);
assert.match(panel,/Double-click to type/);
console.log('PASS 4 corners x 4 rotations anchored, proportional resizing, move, limits, selection, keyboard, cleanup');
