from playwright.sync_api import sync_playwright
from pathlib import Path
import json, subprocess, base64, zlib
root=Path(__file__).resolve().parents[1]
fixture=root/'tests/fixtures/animated.png'
src1=root/'src/lib/validateOutput.ts'
src2=root/'src/lib/decodeValidation.ts'
node_script = '''
const ts = require('typescript');
const fs=require('fs');
for(const p of process.argv.slice(1)) {const js=ts.transpileModule(fs.readFileSync(p,'utf8'), {compilerOptions: {module:ts.ModuleKind.CommonJS, target:ts.ScriptTarget.ES2022}}).outputText; console.log(JSON.stringify(js));}
'''
js1,js2=(json.loads(x) for x in subprocess.check_output(['node','-e',node_script,str(src1),str(src2)],text=True,cwd=root).splitlines())
orig=bytearray(fixture.read_bytes())
# Keep PNG CRC valid, corrupt compressed stream in the last fdAT frame.
bad=bytearray(orig)
pos=8; fdats=[]
while pos+12<=len(bad):
 n=int.from_bytes(bad[pos:pos+4],'big'); typ=bytes(bad[pos+4:pos+8]);data_start=pos+8
 if typ==b'fdAT' and n>10:fdats.append((pos,n,data_start))
 pos+=12+n
if fdats:
 pos,n,start=fdats[-1]; bad[start+8] ^= 0xff
 crc=zlib.crc32(bad[pos+4:pos+8+n])&0xffffffff
 bad[pos+8+n:pos+12+n]=crc.to_bytes(4,'big')
assert orig!=bad
with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 page=browser.new_page()
 page.goto('about:blank')
 page.evaluate('''([v1,v2])=>{
 const pack=(code,fn)=>{const module={exports:{}};new Function('module','exports','require',code)(module,module.exports,fn);return module.exports};
 const val=pack(v1,()=>{throw Error('unexpected import')});
 window.helpers=pack(v2,name=>{if(name==='./validateOutput')return val;throw Error('unexpected dependency '+name)});
 window.inspector=val;
 }''',[js1,js2])
 # fixture width height derive via PNG IHDR
 width=int.from_bytes(orig[16:20],'big');height=int.from_bytes(orig[20:24],'big')
 def invoke2(content):
  return page.evaluate('''async ({data,w,h})=>{
    const bytes=Uint8Array.from(atob(data),c=>c.charCodeAt(0));
    const inspection=window.inspector.inspectAnimation(bytes.buffer,'apng');
    try {await window.helpers.validateApngFramesIndividually(bytes.buffer,inspection.frames,w,h);return {inspection,decoded:true} }
    catch(error){return {inspection,decoded:false,error:String(error)}};
   }''',{'data':base64.b64encode(content).decode(),'w':width,'h':height})
 valid=invoke2(orig)
 invalid=invoke2(bad)
 print('fixture',width,height,'valid',valid,'corrupted',invalid)
 assert valid['inspection']['valid'] and valid['decoded'], 'Valid APNG must decode all frames'
 assert invalid['inspection']['valid'] and not invalid['decoded'], 'CRC-valid compressed corruption must be rejected'
 browser.close()
