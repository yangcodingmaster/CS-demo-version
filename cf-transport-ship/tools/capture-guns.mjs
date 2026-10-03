// 枪械基线/对照采集：每件武器的侧面预览、第一人称画面与渲染性能
// 运行：node tools/capture-guns.mjs base   （或 new）
// 前置：8000 端口静态预览在跑，且 dist 为要测量的那版构建
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const TAG = process.argv[2] || 'base';
const BASE = process.env.M1_URL || 'http://127.0.0.1:8000/';
const CHROME = process.env.M1_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const DIR = 'tools/shots/guns';
const IDS = (process.env.GUN_IDS || 'ak47,m4a1,awm,mp5,deagle,knife,he,usp,glock18').split(',');

const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--mute-audio'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errs = [];
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
await page.goto(BASE + '?nolock', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__game && window.__game.renderer && window.__game.screens && window.__game.screens.visible === 'home', null, { timeout: 90000 });

fs.mkdirSync(DIR, { recursive: true });

// 1) 侧面预览（与武器库同源的程序化图标）
const icons = await page.evaluate(() => window.__game.makeIcons());
const report = { tag: TAG, icons: {}, fpv: {}, perf: {}, errors: errs };
for (const [id, url] of Object.entries(icons)) {
  const b64 = url.split(',')[1];
  fs.writeFileSync(`${DIR}/${TAG}-icon-${id}.png`, Buffer.from(b64, 'base64'));
  report.icons[id] = url.length;
}

// 2) 第一人称画面 + 开局性能
await page.evaluate(() => { window.__game.opts.goal = 100; window.__game.startTeamMatch(); });
await page.waitForFunction(() => window.__game.playing && window.__game.player, null, { timeout: 30000 });
await page.waitForTimeout(600);
for (const id of IDS) {
  const ok = await page.evaluate((wid) => {
    const g = window.__game;
    if (!g.hud.icons[wid]) return false;               // 该版本没有这件武器
    g.vm.equip(wid, 0.001);
    g.vm.setVisible(true);
    g.vm.drawT = 1;
    return true;
  }, id);
  if (!ok) { report.fpv[id] = 'missing'; continue; }
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${DIR}/${TAG}-fpv-${id}.png` });
  report.fpv[id] = 'ok';
}

// 3) 性能：稳定后采样 2 秒。渲染走 composer（多趟 pass），autoReset 会在每趟 pass 重置计数，
//    这里关掉 autoReset、手动 reset 后累积统计，再按帧数平均，才能反映真实每帧开销。
const perf = await page.evaluate(async () => {
  const g = window.__game;
  const r = g.renderer.renderer;
  r.info.autoReset = false;
  r.info.reset();
  const f0 = g.frame;
  const t0 = performance.now();
  await new Promise((res) => setTimeout(res, 2000));
  const dt = (performance.now() - t0) / 1000;
  const frames = Math.max(1, g.frame - f0);
  const out = {
    fps: +(frames / dt).toFixed(1),
    frames,
    callsPerFrame: +(r.info.render.calls / frames).toFixed(1),
    trisPerFrame: Math.round(r.info.render.triangles / frames),
    geometries: r.info.memory.geometries,
    textures: r.info.memory.textures,
    programs: r.info.programs ? r.info.programs.length : null,
  };
  r.info.autoReset = true;
  r.info.reset();
  return out;
});
report.perf = perf;

// 4) 资源增长：反复换枪与重新开局后不应持续增长
const growth = await page.evaluate(async () => {
  const g = window.__game, r = g.renderer.renderer;
  const before = { geometries: r.info.memory.geometries, textures: r.info.memory.textures };
  for (let i = 0; i < 6; i++) {
    for (const id of Object.keys(g.hud.icons)) { try { g.vm.equip(id, 0.001); } catch (e) { /* 忽略 */ } }
  }
  g.hud.setIcons(g.makeIcons());
  await new Promise((res) => setTimeout(res, 300));
  return { before, after: { geometries: r.info.memory.geometries, textures: r.info.memory.textures } };
});
report.growth = growth;

fs.writeFileSync(`${DIR}/${TAG}-report.json`, JSON.stringify(report, null, 2));
console.log(`[${TAG}] fps=${perf.fps} 每帧 draw calls=${perf.callsPerFrame} 三角面=${perf.trisPerFrame} geo=${perf.geometries} tex=${perf.textures}`);
console.log(`[${TAG}] 换枪6轮后 geo ${growth.before.geometries} -> ${growth.after.geometries}, tex ${growth.before.textures} -> ${growth.after.textures}`);
console.log(`[${TAG}] 图标: ${Object.keys(icons).join(', ')}`);
if (errs.length) { console.log('控制台错误：'); [...new Set(errs)].forEach((e) => console.log('  ' + e.slice(0, 160))); }
await browser.close();
process.exit(errs.length ? 1 : 0);
