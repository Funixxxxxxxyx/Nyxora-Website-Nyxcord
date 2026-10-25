"""Chromium isolated media/render tests (no React bundle / npm deps required)."""
from pathlib import Path
import json,base64,subprocess
from playwright.sync_api import sync_playwright
r=Path(__file__).resolve().parents[1]
code='''const ts=require('typescript'),fs=require('fs');for(const f of process.argv.slice(1))console.log(JSON.stringify(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText))'''
scripts=[json.loads(x) for x in subprocess.check_output(['node','-e',code,'src/lib/media.ts','src/features/text/textRender.ts'],cwd=r,text=True).splitlines()]
vid=base64.b64encode((r/'tests/fixtures/video.mp4').read_bytes()).decode()
img=base64.b64encode((r/'tests/fixtures/static.png').read_bytes()).decode()
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 page=browser.new_page()
 page.goto('about:blank')
 answer=page.evaluate('''async ({scripts,vid,img})=>{
  const mods=scripts.map(code=>{const e={};new Function('exports','require',code)(e,()=>{throw Error('Unexpected import')});return e});
  const m=mods[0],r=mods[1];
  const from64=str=>Uint8Array.from(atob(str),s=>s.charCodeAt(0));
  const imgFile=new File([from64(img)],'test.png',{type:'image/png'});
  const loaded=await m.loadMedia(imgFile);
  if(loaded.meta.kind!=='image'||loaded.meta.width<1)throw Error('PNG load failed');
  const preview=document.createElement('canvas');preview.width=loaded.meta.width;preview.height=loaded.meta.height;
  const output=document.createElement('canvas');output.width=loaded.meta.width;output.height=loaded.meta.height;
  const lay={text:'AUDIT',x:.5,y:.5,width:.8,rotation:0,fontFamily:'Arial',fontSize:28,bold:true,italic:false,
   underline:false,color:'#5865F2',align:'center',outlineColor:'#000000',outlineWidth:1,shadowColor:'#000000',
   shadowBlur:0,shadowOffsetX:0,shadowOffsetY:0,background:'none',backgroundColor:'#000000',
   backgroundOpacity:0,padding:0,timing:'entire',fromMs:0,toMs:5000,hidden:false,locked:false};
  for(const target of [preview,output]){
   const ctx=target.getContext('2d');
   m.drawProcessed(ctx,loaded,{x:0,y:0,width:loaded.meta.width,height:loaded.meta.height},0,
     target.width,target.height,'contain',false,0);
   r.renderTextLayers(ctx,[lay],0,target.width,target.height);
  }
  const px1=preview.getContext('2d').getImageData(0,0,preview.width,preview.height).data;
  const px2=output.getContext('2d').getImageData(0,0,output.width,output.height).data;
  if(px1.some((v,i)=>v!==px2[i])) throw Error('Canvas preview/export composition mismatch');
  const pngBlob=await new Promise(resolve=>output.toBlob(resolve,'image/png'));
  const bitmap=await createImageBitmap(pngBlob);bitmap.close();
  const pngUrl=loaded.url;m.disposeMedia(loaded);
  let svgRejected=false;
  try {await m.loadMedia(new File(['<svg xmlns="http://www.w3.org/2000/svg"></svg>'],'attack.svg',{type:'image/svg+xml'}));}
  catch{svgRejected=true}
  if(!svgRejected)throw Error('Unsupported SVG accepted');
  const video=await m.loadMedia(new File([from64(vid)],'test.mp4',{type:'video/mp4'}));
  if(video.meta.kind!=='video'||video.meta.width!==160||video.meta.height!==90)throw Error('Video decode invalid');
  await m.seekVideo(video.element,.55);
  const canvas=document.createElement('canvas');canvas.width=90;canvas.height=160;
  const ctx=canvas.getContext('2d');
  m.drawProcessed(ctx,video,{x:0,y:0,width:video.meta.width,height:video.meta.height},.55,
    90,160,'contain',false,90);
  const sample=ctx.getImageData(0,0,90,160).data;
  let nonTransparent=0;for(let i=3;i<sample.length;i+=4)if(sample[i]>0)nonTransparent++;
  if(nonTransparent<1000)throw Error('Rotated video produced no pixels');
  m.disposeMedia(video);
  return {pngLoaded:loaded.meta.width+'x'+loaded.meta.height, pngBytes:pngBlob.size,
     previewExportPixelParity:true,svgRejected,videoLoaded:video.meta.width+'x'+video.meta.height,
     decodedVideoAtSeconds:.55,rotatedVideoOpaquePixels:nonTransparent,
     videoObjectUrlReleased:!!video.url};
}''',{'scripts':scripts,'vid':vid,'img':img})
 print(json.dumps(answer,indent=2))
 (r/'../browser-media-evidence.json').write_text(json.dumps(answer,indent=2))
 browser.close()
