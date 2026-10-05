import { chromium } from 'playwright-core';
import fs from 'node:fs';
const DIR='tools/shots/primary-expansion'; fs.mkdirSync(DIR,{recursive:true});
const results=[],errors=[];
const check=(name,ok,data)=>{results.push({name,ok:!!ok,data});console.log(`${ok?'PASS':'FAIL'} ${name}`);};
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--mute-audio']});
try {
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto('http://127.0.0.1:8000/?nolock&q=low');
 await page.waitForFunction(()=>window.__game?.screens.visible==='home',null,{timeout:90000});
 const snapshot=()=>page.evaluate(()=>{const g=window.__game;return {bags:structuredClone(g.profile.data.backpacks),default:g.profile.data.selectedBackpackId,lobby:g.lobby.weaponId,screen:g.screens.visible,playing:g.playing};});
 const click=s=>page.locator(s).first().click();
 const settle=()=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
 await click('#home [data-act=lobbyArmory]');
 check('主武器共八款',await page.locator('#armory [data-preview]').count()===8);
 const before=await snapshot();
 await click('#armory [data-preview=scar]');
 check('浏览不会修改背包，详情显示当前装备对比',JSON.stringify((await snapshot()).bags)===JSON.stringify(before.bags) && (await page.locator('.armoryCompare').textContent()).includes('AK-47'));
 check('浏览保留键盘焦点',await page.locator('[data-preview=scar]').evaluate(e=>e===document.activeElement));
 await click('#armory [data-filter=sniper]');
 check('狙击分类只显示两款狙击',await page.locator('#armory [data-preview]').count()===2);
 await click('#armory [data-preview=barrett]');
 await page.screenshot({path:`${DIR}/armory-sniper.png`});
 await click('#armory [data-arm-bag=bag-2]');
 check('编辑目标不改变默认出战背包',(await snapshot()).default===before.default);
 await click('#armory [data-w=barrett]');
 let s=await snapshot();
 check('明确装备只保存目标槽并返回背包',s.screen==='backpack' && s.bags[1].primary==='barrett' && s.bags[0].primary===before.bags[0].primary && s.default===before.default);
 await click('#backpack [data-act=back]');
 await click('#home [data-lobby-bag=bag-2]');await settle();
 check('大厅人物同步巴雷特',(await snapshot()).lobby==='barrett');
 await page.screenshot({path:`${DIR}/lobby-barrett.png`});
 await page.reload();await page.waitForFunction(()=>window.__game?.screens.visible==='home');await settle();
 check('刷新保存默认背包与新枪',(await snapshot()).lobby==='barrett');
 await click('#home [data-act=lobbyArmory]');
 check('已装备按钮禁用',await page.locator('#armory [data-w=barrett]').isDisabled());
 await click('#armory [data-arm-slot=secondary]');
 check('切槽仅显示副武器',await page.locator('#armory [data-preview]').count()===3);
 await click('#armory [data-arm-slot=primary]');
 await click('#armory [data-preview=p90]');
 for(const [width,height] of [[1440,900],[1280,720]]) {
  await page.setViewportSize({width,height});await settle();
  const layout=await page.evaluate(()=>{const e=document.querySelector('.armoryEquip'),r=e.getBoundingClientRect();return {overflow:document.documentElement.scrollWidth>innerWidth,button:{top:r.top,bottom:r.bottom,left:r.left,right:r.right},h:innerHeight,w:innerWidth};});
  check(`${width}桌面无横向溢出且装备按钮始终可见`,!layout.overflow&&layout.button.right<=layout.w&&layout.button.bottom<=layout.h&&layout.button.top>=0,layout);
  await page.screenshot({path:`${DIR}/armory-${width}.png`});
 }
 await page.setViewportSize({width:1440,height:900});
 // 每款通过真实武器库装备，在两模式交替进入后使用真实武器状态机开火与换弹。
 for(const [index,id] of ['scar','qbz95','p90','barrett'].entries()) {
  if((await snapshot()).screen!=='armory')await click('#home [data-act=lobbyArmory]');
  await click('#armory [data-arm-bag=bag-2]');
  await click(`#armory [data-preview=${id}]`);await click(`#armory [data-w=${id}]`);
  await click('#backpack [data-act=back]');
  const mode=index%2?'bomb':'team';await click(`#home [data-act=${mode}]`);await click('#home [data-act=lobbyStart]');
  await page.locator('#btnStart').click();
  await page.locator('#bagSelect [data-act=start]').click();
  await page.waitForFunction(()=>window.__game.playing);await settle();
  const state=await page.evaluate(()=>{
   const g=window.__game,p=g.player;g.paused=true;
   const w=p.weapon; const initial=w.mag; const old=g.time;
   g.time=Math.max(g.time,p.readyAt)+1;
   if(g.bomb) {g.bomb.advance(g.time+g.bomb.config.preparationSeconds,g.actors);g.time=g.bomb.time ?? g.time+g.bomb.config.preparationSeconds;}
   p.scoped=w.def.type==='sniper'?1:0;p.scopeT=g.time-1;
   p.weaponUpdate(.016,{fire:true,firePressed:true});
   const fired=w.mag===initial-1,scoped=p.scoped,finite=Number.isFinite(w.boltUntil)&&Number.isFinite(p.punchP);
   p.startReload();g.time=w.reloadUntil;p.weaponUpdate(.016,{});
   const reload=w.mag===initial&&!w.reloading;
   const bots=g.actors.filter(a=>!a.isPlayer).map(a=>({weapon:a.primary,role:a.role}));
   return {id:w.id,fired,scoped,finite,reload,bots};
  });
  check(`${id} ${mode}开局配装、开火与换弹`,state.id===id&&state.fired&&state.finite&&state.reload,state);
  if(id==='barrett')check('巴雷特开火保持镜内',state.scoped===1,state);
  // 用正式暂停入口退出，清掉本轮测试推进的时钟和对象。
  await page.evaluate(()=>{const g=window.__game;g.paused=false;g.pause();});
  await click('#btnQuit');await settle();
  check(`${id}退出后回大厅`,(await snapshot()).screen==='home'&&!(await snapshot()).playing);
 }
 // 所有枪暖场后多次换包/模式，检测缓存是否持续增长。
 const samples=[];
 for(let loop=0;loop<4;loop++) {
  const sample=await page.evaluate(()=>{
   const g=window.__game;
   for(const id of ['ak47','m4a1','awm','mp5','scar','qbz95','p90','barrett']){g.lobby.sync({weaponId:id});g.lobby.update(.016,1);g.lobby.render();}
   g.syncLobby();g.lobby.render();
   return {memory:{...g.renderer.renderer.info.memory},programs:g.renderer.renderer.info.programs.length,render:{...g.renderer.renderer.info.render}};
  });samples.push(sample);
 }
 check('暖场后重复换枪资源稳定',samples.slice(1).every(s=>JSON.stringify(s.memory)===JSON.stringify(samples[0].memory)&&s.programs===samples[0].programs),samples);
 check('无浏览器错误',errors.length===0,errors);
} catch(e){errors.push(e.stack);console.error(e);} finally {await browser.close();}
const report={passed:results.filter(r=>r.ok).length,failed:results.filter(r=>!r.ok).length,results,errors};
fs.writeFileSync(`${DIR}/results.json`,JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,failed:report.failed,errors}));
process.exit(report.failed||errors.length?1:0);
