const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '../src');
function load(relative, overrides = {}) {
  const code = ts.transpileModule(fs.readFileSync(path.join(root, relative), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const mod = { exports: {} };
  const customRequire = request => {
    if (request in overrides) return overrides[request];
    if (request.startsWith('./')) return load(path.join(path.dirname(relative), request + '.ts'), overrides);
    return require(request);
  };
  new Function('module', 'exports', 'require', 'self', code)(mod, mod.exports, customRequire, overrides.self);
  return mod.exports;
}
const gifenc = {
  GIFEncoder: () => {
    let count = 0;
    return { writeFrame: () => { count++; }, finish: () => {}, bytes: () => new Uint8Array(64 + count * 10) };
  },
  quantize: () => [[0,0,0],[255,255,255]],
  applyPalette: rgba => new Uint8Array(rgba.byteLength / 4),
};
const wait = async (updates, predicate) => {
  for (let i = 0; i < 1000; i++) {
    const found = updates.find(predicate);
    if (found) return found;
    await new Promise(resolve => setTimeout(resolve, 1));
  }
  throw Error('Worker response timed out');
};
(async () => {
  for (const type of ['gif', 'apng']) {
    const updates = [];
    const self = { postMessage: data => updates.push(data) };
    class FakeApng {
      constructor() { this.count = 0; this.ms = 0; }
      async addFrame(_, duration) { this.count++; this.ms += duration; }
      get byteEstimate() { return 64 + this.count * 10; }
      finish() { return new Uint8Array(64 + this.count * 10); }
    }
    load('lib/encoder.worker.ts', { self, gifenc, './apngStream': { ApngStreamEncoder: FakeApng } });
    const job = { id: 18, type, width: 16, height: 16, delayMs: 100,
      maxBytes: 600, enforceLimit: true, colors: 4 };
    self.onmessage({ data: { type: 'init', job } });
    await wait(updates, item => item.type === 'ready');
    for (let index = 0; index < 8; index++) {
      self.onmessage({ data: { type: 'frame', id: job.id, index,
        frame: new Uint8Array(16 * 16 * 4).buffer, delayMs: 100 } });
      await wait(updates, item => item.type === 'ack' && item.index === index);
    }
    self.onmessage({ data: { type: 'finish', id: job.id } });
    const done = await wait(updates, item => item.type === 'done' || item.type === 'error');
    assert.equal(done.type, 'done', JSON.stringify(done));
    assert.equal(done.frameCount, 8);
    assert.equal(done.durationMs, 800);
    assert(done.buffer.byteLength < job.maxBytes);
    assert.equal(updates.filter(item => item.type === 'ack').length, 8);
  }
  console.log('PASS: per-frame ACK backpressure; streamed workers GIF/APNG; duration; strict size');
})().catch(error => { console.error(error); process.exitCode = 1; });
