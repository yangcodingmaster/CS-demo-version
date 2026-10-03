// 逐枪三角面统计：对指定构建测量每件武器的第一人称模型三角面数
// 运行：node tools/measure-guns.mjs <url> [tag]
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const URL_ = process.argv[2] || 'http://127.0.0.1:8000/';
const TAG = process.argv[3] || 'now';
const CHROME = process.env.M1_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--mute-audio'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto(URL_ + (URL_.includes('?') ? '&' : '?') + 'nolock', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__game && window.__game.renderer && window.__game.screens && window.__game.screens.visible === 'home', null, { timeout: 90000 });

const stats = await page.evaluate(() => {
  const g = window.__game;
  const out = {};
  const tri = (obj) => {
    let n = 0;
    obj.traverse((o) => {
      if (!o.isMesh || !o.geometry) return;
      const geo = o.geometry;
      const count = geo.index ? geo.index.count : (geo.attributes.position ? geo.attributes.position.count : 0);
      n += count / 3;
    });
    return Math.round(n);
  };
  for (const id of Object.keys(g.hud.icons)) {
    g.vm.equip(id, 0.001);
    out[id] = { fpv: tri(g.vm.cur), meshes: (() => { let c = 0; g.vm.cur.traverse((o) => { if (o.isMesh) c++; }); return c; })() };
  }
  return out;
});

fs.mkdirSync('tools/shots/guns', { recursive: true });
const file = `tools/shots/guns/tri-${TAG}.json`;
fs.writeFileSync(file, JSON.stringify(stats, null, 2));
const total = Object.values(stats).reduce((a, s) => a + s.fpv, 0);
console.log(`[${TAG}] ` + Object.entries(stats).map(([id, s]) => `${id} ${s.fpv}/${s.meshes}mesh`).join('  '));
console.log(`[${TAG}] 合计 ${total} 三角面 / ${Object.values(stats).reduce((a, s) => a + s.meshes, 0)} 网格 → ${file}`);
await browser.close();
