// 同一 Chrome、窗口、画质和 AK 大厅姿态比较改版前后。帧率仅为 headless 环境采样。
// BASELINE_URL 应指向改动前构建的静态预览。
import {chromium} from 'playwright-core';
import fs from 'node:fs';
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const output={viewport:{width:1280,height:800},quality:'low',frames:120,formula:'1000 * frameCount / elapsedMilliseconds',note:'Headless RAF sample, not a player-device FPS guarantee',samples:[]};
try {
 for(const [label,url] of [['before',process.env.BASELINE_URL||'http://127.0.0.1:8001/'],['after','http://127.0.0.1:8000/']]) {
  const page=await browser.newPage({viewport:output.viewport});await page.goto(url+'?nolock&q=low');await page.waitForFunction(()=>window.__game?.screens.visible==='home',null,{timeout:90000});
  await page.waitForTimeout(1200);
  const data=await page.evaluate(async()=>{
   const g=window.__game, gl=g.renderer.renderer; const times=[];
   await new Promise(resolve=>{function frame(t){times.push(t);if(times.length===121)resolve();else requestAnimationFrame(frame);}requestAnimationFrame(frame);});
   const autoReset=gl.info.autoReset;let render;
   try {gl.info.autoReset=false;gl.info.reset();g.lobby.render();render={calls:gl.info.render.calls,triangles:gl.info.render.triangles};}
   finally {gl.info.autoReset=autoReset;}
   return {fps:Number((120000/(times.at(-1)-times[0])).toFixed(2)),memory:{...gl.info.memory},render,programs:gl.info.programs.length};
  });output.samples.push({label,...data});await page.close();
 }
 const page=await browser.newPage({viewport:{width:1440,height:900}});await page.goto('http://127.0.0.1:8000/?nolock');await page.waitForFunction(()=>window.__game?.screens.visible==='home',null,{timeout:90000});
 await page.locator('#home [data-act=lobbyArmory]').click();await page.locator('#armory [data-filter=rifle]').click();await page.locator('#armory [data-preview=scar]').click();
 await page.screenshot({path:'tools/shots/primary-expansion/final-armory.png'});
} finally {await browser.close();}
fs.writeFileSync('tools/shots/primary-expansion/performance.json',JSON.stringify(output,null,2));console.log(JSON.stringify(output));
