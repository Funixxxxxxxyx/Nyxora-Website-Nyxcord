"""Real Chromium Canvas/color/font tests against transpiled production utilities.
This is NOT a full bundled React E2E test (npm dependencies are unavailable)."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import subprocess, json, base64, os
R=Path(__file__).resolve().parents[1]
files=['src/features/text/textRender.ts','src/features/text/color.ts','src/features/text/fontRegistry.ts','src/features/text/fontLoader.ts','src/features/text/fontCatalog.ts']
script='''const fs=require('fs'),ts=require('typescript');
for(const f of process.argv.slice(1)){
 const output=ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 console.log(JSON.stringify(output))
}'''
compiled=[json.loads(x) for x in subprocess.check_output(['node','-e',script,*files],cwd=R,text=True).splitlines()]
font=Path(os.environ.get('NYXCORD_TEST_FONT', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'))
if not font.is_file():
    raise SystemExit('SKIP: set NYXCORD_TEST_FONT to a locally installed TTF to run font tests')
font64=base64.b64encode(font.read_bytes()).decode('ascii')
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':1000,'height':800})
    page.goto('about:blank')
    page.evaluate('''codes=>{
     const modules={};
     const defs=['./textRender','./color','./fontRegistry','./fontLoader','./fontCatalog'];
     const indexes={'./fontCatalog':4, './fontLoader':3, './fontRegistry':2, './color':1, './textRender':0};
     function get(name){if(modules[name])return modules[name];const e={};
       new Function('exports','require',codes[indexes[name]])(e,get);
       return modules[name]=e;}
     window.render=get('./textRender'); window.colors=get('./color');window.fonts=get('./fontRegistry');
    }''',compiled)
    answer=page.evaluate('''async font64=>{
      const c=window.colors,r=window.render,f=window.fonts;
      const wrap=width=>r.wrapTextLines({measureText:text=>({width:Array.from(text).length*9})},'A'.repeat(600),width);
      const base = {id:'one',text:'NYXCORD',x:.5,y:.5,width:.8,rotation:0,fontFamily:'Arial',
        fontSize:42,bold:true,italic:false,underline:true,color:'#FF0000',align:'center',outlineColor:'#000000',
        outlineWidth:0,shadowColor:'#000000',shadowBlur:0,shadowOffsetX:0,shadowOffsetY:0,
        background:'none',backgroundColor:'#000000',backgroundOpacity:.8,padding:4,
        timing:'entire',fromMs:0,toMs:2000,hidden:false,locked:false};
      const timed={...base,id:'two',text:'BLUE',y:.7,color:'#0000FF',fontSize:28,rotation:15,
        timing:'custom',fromMs:500,toMs:1500};
      function draw(ms,w=320,h=240,dw=w,dh=h) {
        const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
        const ctx=canvas.getContext('2d');
        r.renderTextLayers(ctx,[base,timed],ms,w,h,dw,dh);
        return canvas;
      }
      function checksum(canvas){
        const pixels=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
        let red=0,blue=0,alpha=0;
        for(let i=0;i<pixels.length;i+=4)if(pixels[i+3]){alpha++;if(pixels[i]>pixels[i+2]+50)red++;if(pixels[i+2]>pixels[i]+50)blue++;}
        return {red,blue,alpha};
      }
      const outside=checksum(draw(100));const inside=checksum(draw(1000));const after=checksum(draw(1700));
      if(!(outside.red>100 && outside.blue===0 && inside.blue>100 && after.blue===0))
        throw Error('Timed text overlay did not appear only inside custom range '+JSON.stringify({outside,inside,after}));
      const scaled=checksum(draw(1000,640,480,320,240));
      if(!(scaled.alpha>inside.alpha*3.6 && scaled.alpha<inside.alpha*4.4))
        throw Error('Scaled canvas area should scale ~4x: '+JSON.stringify({inside,scaled}));
      const original=draw(1000);
      const png=await new Promise(resolve=>original.toBlob(resolve,'image/png'));
      const image=await createImageBitmap(png);
      if(image.width!==320 || image.height!==240)throw Error('PNG dimensions wrong');
      image.close();
      const bytes=Uint8Array.from(atob(font64),ch=>ch.charCodeAt(0));
      const userFont=await f.importFont(new File([bytes],'sample.ttf',{type:'font/ttf'}));
      await f.waitForTextFonts([userFont.family]);
      if(!document.fonts.check('16px '+userFont.family))throw Error('Imported font not ready');
      const facesBefore=document.fonts.size;
      f.resetImportedFonts();
      if(document.fonts.size!==facesBefore-1 || f.listImportedFonts().length!==0)
        throw Error('Imported font not released on reset');
      let invalidRejected=false;
      try{await f.importFont(new File([new Uint8Array([1,2,3,4])],'fake.ttf'));}catch{invalidRejected=true;}
      if(!invalidRejected)throw Error('Bad font signature was accepted');
      const warmup=()=>wrap(2250);
      for(let i=0;i<30;i++)warmup();
      const t=performance.now();for(let i=0;i<400;i++)warmup();
      const wrapTime=+(performance.now()-t).toFixed(2);
      const shades=[];
      for(let i=0;i<2000;i++){
       const hex='#'+((i*7919)%16777216).toString(16).padStart(6,'0');
       if(c.hsvToHex(c.hexToHsv(hex))!==hex.toUpperCase())throw Error('HEX roundtrip failed');
      }
      return {outside,inside,after,scaled,pngBytes:png.size, importedFont:userFont.filename,
        fontReleased:true,invalidRejected,wrap400Ms:wrapTime,hexRoundtrips:2000,chrome:navigator.userAgent};
    }''',font64)
    print(json.dumps(answer,indent=2))
    (R/'..'/'chromium-render-evidence.json').write_text(json.dumps(answer,indent=2))
    page.screenshot(path=str(R/'..'/'chromium-harness-screen.png'))
    browser.close()
