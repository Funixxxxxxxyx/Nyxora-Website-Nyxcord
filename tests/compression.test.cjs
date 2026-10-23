const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '../src');
function load(relative, mocks = {}) {
  const code = ts.transpileModule(fs.readFileSync(path.join(root, relative), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  const requireRelative = name => mocks[name] || (name.startsWith('./')
    ? load(path.join(path.dirname(relative), name + '.ts'), mocks)
    : require(name));
  new Function('module', 'exports', 'require', code)(module, module.exports, requireRelative);
  return module.exports;
}
const { inspectAnimation } = load('lib/validateOutput.ts');
const fixtures = name => fs.readFileSync(path.join(__dirname, 'fixtures', name));
const array = name => fixtures(name).buffer.slice(fixtures(name).byteOffset, fixtures(name).byteOffset + fixtures(name).byteLength);
const realGif = fixtures('animated.gif');
const realApng = fixtures('animated.png');
const realPng = fixtures('static.png');
const toArray = b => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
assert.deepEqual(inspectAnimation(toArray(realGif), 'gif'), { valid: true, frames: 3 });
assert.deepEqual(inspectAnimation(toArray(realApng), 'apng'), { valid: true, frames: 3 });
assert.deepEqual(inspectAnimation(toArray(realPng), 'png'), { valid: true, frames: 1 });
assert.equal(inspectAnimation(toArray(realPng), 'apng').valid, false, 'Static PNG cannot masquerade as APNG');
assert.equal(inspectAnimation(toArray(realApng), 'gif').valid, false);
assert.equal(inspectAnimation(toArray(realGif), 'apng').valid, false);
const broken = Buffer.from(realApng);
broken.write('junk', 37); // invalidate acTL chunk type
assert.equal(inspectAnimation(toArray(broken), 'apng').valid, false);

const { reduceFrameRate, resizeFrames, animationDuration } = load('../tests/support/animationOptimize.ts');
const frame = v => { const bytes = new Uint8Array(16 * 16 * 4); bytes.fill(v); return bytes.buffer; };
const job = { id: 7, type: 'gif', width: 16, height: 16, frames: [frame(1), frame(2), frame(3), frame(4), frame(5), frame(6)], frameDelays:[100,110,120,130,140,150], delayMs:100, quality:85, maxBytes:512000 };
const reduced = reduceFrameRate(job, 2);
assert.equal(reduced.frames.length, 3);
assert.deepEqual(reduced.frameDelays, [210,250,290]);
assert.equal(animationDuration(reduced), 750);
assert.equal(animationDuration(reduceFrameRate(job, 80)), 750);
const resized = resizeFrames(job, .5);
assert.equal(resized.width, 8);
assert.equal(resized.height, 8);
assert.equal(resized.frames[0].byteLength, 8*8*4);
const { gifFrameDelays } = load('lib/frameTiming.ts');
const timed = { ...job, frameDelays: [103, 103, 103, 103, 103, 103] };
const delays = gifFrameDelays(timed);
assert.equal(delays.reduce((a,b)=>a+b,0), Math.round(618/10)*10, 'GIF duration rounds cumulatively');
console.log('PASS: actual 3-frame GIF/APNG fixtures, PNG detection, duration-preserving FPS changes, resize');
