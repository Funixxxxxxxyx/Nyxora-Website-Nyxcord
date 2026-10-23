const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '../src');

function moduleAt(file) {
  const js = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const mod = { exports: {} };
  new Function('module', 'exports', 'require', js)(mod, mod.exports, () => {
    throw new Error(`Unexpected runtime dependency in ${file}`);
  });
  return mod.exports;
}
const { GifDelayClock, gifFrameDelays } = moduleAt('lib/frameTiming.ts');
const { gifPaletteLimit, compressionRecipes, pngRecipes } = moduleAt('lib/compressionStrategy.ts');
for (const seconds of [1, 3, 5]) {
  for (const fps of [10, 15, 20, 24, 30]) {
    const count = seconds * fps;
    const delays = gifFrameDelays({ frameCount: count, delayMs: 1000 / fps });
    const total = delays.reduce((sum, delay) => sum + delay, 0);
    assert.equal(total, seconds * 1000, `${seconds}s at ${fps}fps must preserve duration`);
    assert(delays.every(delay => delay >= 20 && delay % 10 === 0));
  }
}
const clock = new GifDelayClock();
assert.equal([103, 103, 103, 103, 103, 103].map(n => clock.next(n)).reduce((a, b) => a + b, 0), 620);
assert.equal(clock.durationMs, 620);
assert.deepEqual([45, 75, 85, 95].map(gifPaletteLimit), [64, 128, 192, 256]);
for (const q of [45, 75, 85, 95]) {
  const first = compressionRecipes('gif', false, q)[0];
  assert.equal(first.colors, gifPaletteLimit(q), `Quality ${q} changes palette`);
  assert.equal(first.scale, 1);
}
assert.equal(compressionRecipes('gif', true, 95).length, 6);
assert.equal(compressionRecipes('apng', true, 95).length, 6);
assert.equal(pngRecipes.length, 5);
const source = fs.readFileSync(path.join(root, 'lib/export.ts'), 'utf8');
assert(source.includes("if (type === 'png') {"));
assert(source.indexOf("if (type === 'png') {") < source.indexOf('encoder = createEncoder(job, signal)'),
  'PNG finishes or tries the next recipe before creating a worker');
assert(!source.includes('encoder!.finish()') || source.indexOf('encoder!.finish()') > source.indexOf('encoder = createEncoder(job, signal)'));
const validation = fs.readFileSync(path.join(root, 'lib/decodeValidation.ts'), 'utf8');
assert(validation.includes('await validateApngFramesIndividually(bytes, frames, width, height)'));
assert(!validation.includes('const poster = await verifyPngPixels(bytes)'));
for (const stale of ['gifEncoder.ts', 'apngEncoder.ts']) {
  assert(!fs.existsSync(path.join(root, 'lib', stale)), `Unused ${stale} should be removed`);
}
console.log('PASS: 15 GIF duration scenarios, active GIF quality, PNG branch, APNG frame validation, unused files');
