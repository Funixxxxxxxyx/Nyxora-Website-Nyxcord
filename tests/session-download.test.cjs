const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '../src');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const app = read('App.tsx');
const menu = read('components/DownloadMenu.tsx');
const store = read('store/editor.ts');
const session = read('lib/session.ts');
const worker = read('lib/encoder.worker.ts');

assert(!/readDraftFile|saveDraftFile|restoreDraftSettings|saveDraftSettings/.test(app), 'No editor auto-restore or persistent saves');
assert(!/readDraftFile|saveDraftFile|restoreDraftSettings|saveDraftSettings/.test(session), 'Remove obsolete draft persistence');
assert(app.includes('clearLegacyDraft()'), 'Old stored data is cleared at startup');
assert(app.includes('event.persisted') && app.includes('resetSession()'), 'Back/forward cache restores reset in place');
assert(!/window\.location\.reload\s*\(/.test(app), 'Download and history should not force reload');
assert(app.includes('resultCache.current.set(result.format, result)'), 'Keep encoded result available for download');
assert(app.includes('resultCache.current.get(format)'), 'Downloading uses cached finished file');
assert(app.includes('downloadFile(prepared)'), 'Download does not start encoding');
assert(app.includes('anchor.download = result.name'), 'Use a real file download');
assert(!/downloadAfter/.test(app), 'No hidden conversion on download');
assert(menu.includes('availableFormats.includes(format)') && menu.includes('prepareFormat(format)'), 'Alternate format is explicit preparation');
assert(menu.includes('type="button"'), 'Dropdown never submits a form');
assert(store.includes('resetSession()'), 'Store has full reset');
assert(!worker.includes('current.frames.push') && worker.includes("type: 'ack'"), 'Worker must have backpressure');
assert(read('lib/exportPlan.ts').includes('96 * 1024 * 1024'), 'Frame memory has a bounded budget that supports a five-second clip');

let removed = [], deleted = [], cleared = 0;
const js = ts.transpileModule(session, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS }}).outputText;
const mod = { exports: {} };
new Function('exports', 'module', 'sessionStorage', 'localStorage', 'indexedDB', 'window', js)(
  mod.exports, mod, { removeItem: k => removed.push(k) }, { removeItem: k => removed.push(k) },
  { deleteDatabase: k => { deleted.push(k); } }, { indexedDB: true }
);
mod.exports.clearLegacyDraft();
mod.exports.clearLegacyDraft();
assert.deepEqual(removed, ['nyxcord-editor-settings', 'nyxcord-editor-settings']);
assert.deepEqual(deleted, ['nyxcord-draft']);
console.log('PASS: no auto-restoration; download keeps state; dropdown separates creation from saving');
