"""Chromium smoke check for the downloadFile implementation, not a full React E2E test."""
from pathlib import Path
import re
import os
import shutil
from playwright.sync_api import sync_playwright

root = Path(__file__).resolve().parents[1]
source = (root / 'src/App.tsx').read_text()
match = re.search(r'    const downloadFile = \(result: ExportResult\) => \{.*?\n    \};', source, re.S)
assert match, 'downloadFile function missing'
implementation = match.group(0).replace('(result: ExportResult)', '(result)')
with sync_playwright() as pw:
    browser_path = os.getenv('CHROMIUM_PATH') or shutil.which('chromium') or shutil.which('google-chrome')
    browser = pw.chromium.launch(executable_path=browser_path, headless=True, args=['--no-sandbox'])
    context = browser.new_context(accept_downloads=True)
    page = context.new_page()
    page.set_content('<div id="editor">Editor stays open</div><button id="save">Download</button>')
    page.evaluate("""code => {
      const setNotice = () => {};
      const run = new Function('setNotice', code + '; return downloadFile;')(setNotice);
      const blob = new Blob(['NYXCORD_TEST_OK'], {type:'application/octet-stream'});
      const url = URL.createObjectURL(blob);
      document.getElementById('save').onclick = () => run({url, name:'Nyxcord-test.bin'});
    }""", implementation)
    with page.expect_download(timeout=10000) as info:
        page.get_by_role('button', name='Download').click()
    dl = info.value
    assert dl.suggested_filename == 'Nyxcord-test.bin', dl.suggested_filename
    saved = Path('/tmp/nyxcord-browser-download.bin')
    dl.save_as(str(saved))
    assert saved.read_bytes() == b'NYXCORD_TEST_OK'
    assert page.locator('#editor').inner_text() == 'Editor stays open'
    assert page.url == 'about:blank', f'unexpected navigation: {page.url}'
    print('PASS: Chromium downloaded the actual Blob; page remained open (no navigation)')
    context.close()
    browser.close()
