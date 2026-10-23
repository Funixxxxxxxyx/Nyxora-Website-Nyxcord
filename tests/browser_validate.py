"""Optional Chromium checks. Requires Python Playwright and a Chromium browser."""
from pathlib import Path
import base64
import subprocess
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
MODULES = ['validateOutput', 'decodeValidation']


def transpile(name: str) -> str:
    code = r'''
const fs = require('fs');
const ts = require('typescript');
const source = fs.readFileSync(process.argv[1], 'utf8');
const js = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
process.stdout.write(js);
'''
    result = subprocess.check_output(
        ['node', '-e', code, str(ROOT / 'src' / 'lib' / f'{name}.ts')], cwd=ROOT
    ).decode()
    return result.replace("import { inspectAnimation } from './validateOutput';", '') \
        .replace('export function ', 'function ') \
        .replace('export async function ', 'async function ')


def main():
    script = '\n'.join(transpile(name) for name in MODULES)
    b64 = base64.b64encode((ROOT / 'tests' / 'fixtures' / 'static.png').read_bytes()).decode()
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, executable_path='/usr/bin/chromium' if Path('/usr/bin/chromium').exists() else None, args=['--no-sandbox'])
        page = browser.new_page(accept_downloads=True)
        page.goto('about:blank')
        page.add_script_tag(content=script)
        result = page.evaluate('''async b64 => {
          const original = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
          const damaged = original.slice();
          const view = new DataView(damaged.buffer);
          let p = 8;
          while (p + 12 < damaged.length) {
            const size = view.getUint32(p);
            const kind = String.fromCharCode(...damaged.slice(p + 4, p + 8));
            if (kind === 'IDAT' && size > 1) {
              damaged[p + 9] ^= 0x5e;
              view.setUint32(p + size + 8, pngCrc(damaged, p + 4, p + size + 8));
              break;
            }
            p += size + 12;
          }
          await validateDecodedOutput(original.buffer, 'png');
          const structureValid = inspectAnimation(damaged.buffer, 'png').valid;
          let corruptRejected = false;
          try { await validateDecodedOutput(damaged.buffer, 'png'); }
          catch { corruptRejected = true; }
          return { structureValid, corruptRejected };
        }''', b64)
        assert result == {'structureValid': True, 'corruptRejected': True}, result
        for _ in range(2):
            with page.expect_download() as download:
                page.evaluate('''() => {
                  if (!window.nyxUrl) window.nyxUrl = URL.createObjectURL(new Blob(['Nyxcord'], {type:'text/plain'}));
                  const a = document.createElement('a');
                  a.href = window.nyxUrl;
                  a.download = 'Nyxcord-test.txt';
                  document.body.appendChild(a);
                  a.click();
                  a.remove();
                }''')
            assert download.value.suggested_filename == 'Nyxcord-test.txt'
        assert page.url == 'about:blank', 'Download navigated instead of saving a file'
        browser.close()
        print('PASS: Chromium PNG pixel corruption and repeated Blob download without navigation')


if __name__ == '__main__':
    main()
