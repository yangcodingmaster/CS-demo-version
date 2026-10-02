// 原创沙城：真实入口、A/B 安包、人机任务、完整比赛及切图资源验收。
// npm run build 后运行 node tools/verify-desert.mjs；静态服务默认 8000。
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const results = [], errors = [];
const dir = 'tools/shots/desert';
fs.mkdirSync(dir, { recursive: true });
const check = (name, ok, detail = '') => {
  results.push({ name, ok: !!ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`);
};
const browser = await chromium.launch({
  executablePath: process.env.BOMB_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--mute-audio'],
});
const drive = (page, seconds) => page.evaluate((s) => window.__desertDrive(s), seconds);
const shot = (page, name) => page.screenshot({ path: `${dir}/${name}.png` });

async function ready() {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  // 固定随机序列便于回归，保留实际 AI、感知、伤害与规则。
  await page.addInitScript(() => {
    let seed = 730127;
    Math.random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  });
  await page.goto(process.env.BOMB_URL || 'http://127.0.0.1:8000/?nolock', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__game?.screens.visible === 'home', null, { timeout: 90000 });
  await page.evaluate(() => {
    const g = window.__game, simulate = g.simulate.bind(g);
    g.simulate = () => {};
    window.__desertDrive = (seconds) => {
      const until = g.time + seconds;
      while (g.playing && !g.paused && g.time < until - 1e-9) simulate(Math.min(0.025, until - g.time));
    };
    window.__desertFreeze = () => { for (const a of g.actors) if (!a.isPlayer) a.update = () => {}; };
    window.__desertTrack = () => {
      const drain = g.bomb.drainEvents.bind(g.bomb);
      window.__desertEvents = [];
      g.bomb.drainEvents = () => {
        const events = drain();
        window.__desertEvents.push(...events);
        return events;
      };
    };
  });
  return page;
}

async function flow() {
  const page = await ready();
  await shot(page, 'home');
  await page.locator('#home [data-act="bomb"]').click();
  check('默认爆破入口为沙城', await page.locator('#setupTitle').textContent() === '沙城');
  check('设置说明原创沙漠灰风格', (await page.locator('#setupDesc').textContent()).includes('沙漠灰风格的原创布局'));
  await shot(page, 'setup');
  await page.locator('#btnStart').click();
  check('初始背包显示实际地图名称', (await page.locator('#bagSelect').textContent()).includes('沙城'));
  await page.locator('#bagSelect [data-act="start"]').click();
  await page.evaluate(() => window.__desertFreeze());
  const state = await page.evaluate(() => {
    const g = window.__game;
    return {
      id: g.map.id,
      name: g.map.name,
      actors: g.actors.length,
      sites: g.map.sites,
      ocean: g.env.ocean.visible,
      shadows: g.env.mapShadowBounds,
      radar: g.hud.radarBounds,
      spawnsClear: g.actors.every((a) => !g.world.blocked(a.pos.x, a.pos.y + 0.05, a.pos.z, a.radius, 1.75)),
    };
  });
  check('新地图5v5并含A/B两个包点', state.id === 'desert-gray' && state.actors === 10 && state.sites.length === 2, state);
  check('所有出生点有站立空间，陆地海面隐藏', state.spawnsClear && !state.ocean);
  check('新地图配置独立阴影范围', Array.isArray(state.shadows) && state.shadows.length === 3);
  await shot(page, 'spawn-bl');
  for (let i = 0; i < 2; i++) {
    await page.evaluate((index) => {
      const g = window.__game;
      g.opts.team = 'BL';
      g.startBombMatch();
      window.__desertFreeze();
      window.__desertDrive(g.bomb.config.preparationSeconds + 0.05);
      const p = g.player, s = g.map.sites[index];
      p.pos.set(s.x, 0.001, s.z);
      p.vel.set(0, 0, 0);
      p.speed = 0;
      p.yaw = Math.PI;
      p.pitch = 0;
      g.clearInput();
    }, i);
    await page.keyboard.press('Digit5');
    await drive(page, 0.05);
    await page.keyboard.down('KeyE');
    await drive(page, 1);
    await shot(page, `site-${state.sites[i].id}-planting`);
    await drive(page, 2.15);
    await page.keyboard.up('KeyE');
    const planted = await page.evaluate(() => ({ ...window.__game.bomb.bomb }));
    check(`${state.sites[i].id}点真实键盘安包完成`, planted.state === 'planted' && planted.siteId === state.sites[i].id, planted);
  }
  await page.setViewportSize({ width: 1280, height: 720 });
  await shot(page, 'desktop-1280');
  check('1280桌面无横向溢出', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.evaluate(() => {
    const g = window.__game;
    g.startBombMatch();
    window.__desertFreeze();
    window.__desertDrive(g.bomb.config.preparationSeconds + 0.05);
    const site = g.map.sites[0], p = g.player;
    p.pos.set(site.x, 0.001, site.z + 8);
    p.vel.set(0, 0, 0);
    p.yaw = 0;
    p.pitch = 0;
    p.updateCamera(0.025);
    g.vm.equip(p.weapon.id, 0.001);
    g.hud.toastT = 0;
    g.hud.centerT = 0;
    g.renderFrame(0.025);
  });
  await page.waitForTimeout(600);
  await shot(page, 'a-approach');
  await page.evaluate(() => window.__game.env.apply('dusk'));
  await page.waitForTimeout(300);
  await shot(page, 'a-approach-dusk');
  await page.evaluate(() => window.__game.env.apply('day'));
  await page.evaluate(() => {
    const g = window.__game;
    g.vm.setVisible(false);
    g.bombVisual.root && (g.bombVisual.root.visible = false);
    g.renderer.camera.position.set(45, 64, 58);
    g.renderer.camera.lookAt(0, 0, 0);
    g.renderer.camera.fov = 54;
    g.renderer.camera.updateProjectionMatrix();
    // 交接用俯视图独立关闭天空、雾与泛光，以免天空泛光淹没道路。
    // 实战截图在上方按原环境采集；这里只改即将关闭的浏览器测试实例。
    g.renderer.scene.fog = null;
    g.env.sky.visible = false;
    g.env.clouds.visible = false;
    g.renderer.scene.background = g.env.sun.color.clone().set('#c6d2d8');
    if (g.renderer.bloom) g.renderer.bloom.enabled = false;
    g.renderFrame = () => g.renderer.render();
    g.renderFrame();
  });
  await page.addStyleTag({ content: '#ui, #m1root { display: none !important; }' });
  await shot(page, 'overview');
  await page.close();
}

async function bots() {
  const page = await ready();
  await page.evaluate(() => {
    const g = window.__game;
    g.opts.team = 'GR';
    g.startBombMatch();
    // 第一轮由攻方机器人携包，隔离战斗以检查真实移动、碰撞与安拆。
    for (const a of g.actors) if (!a.isPlayer) a.canSee = () => false;
    window.__desertTrack();
  });
  await drive(page, 115);
  const objective = await page.evaluate(() => ({ events: window.__desertEvents, phase: window.__game.bomb.phase, round: window.__game.bomb.round }));
  const plants = objective.events.filter((e) => e.type === 'bomb-planted');
  const defuses = objective.events.filter((e) => e.type === 'bomb-defused');
  check('隔离战斗后机器人自行导航并安包', plants.some((e) => e.actorId !== 0), objective);
  check('隔离战斗后防守机器人自行回防拆包', defuses.some((e) => e.actorId !== 0), defuses);
  check('轮换任务覆盖A/B两个包点', new Set(plants.map((e) => e.siteId)).size === 2, plants);
  await page.evaluate(() => {
    const g = window.__game;
    g.startBombMatch();
    window.__desertTrack();
  });
  // 按段快进，保持浏览器调用有界。
  for (let i = 0; i < 10; i++) {
    await drive(page, 100);
    if (await page.evaluate(() => window.__game.ended)) break;
  }
  const match = await page.evaluate(() => {
    const g = window.__game;
    return {
      ended: g.ended,
      score: g.score,
      round: g.bomb.round,
      events: window.__desertEvents,
      kills: g.actors.map((a) => a.stats.k),
      finite: g.actors.every((a) => a.pos.toArray().every(Number.isFinite) && Number.isFinite(a.yaw)),
    };
  });
  check('真实战斗整场结束且比分等于回合数', match.ended && match.score.BL + match.score.GR === match.round, match);
  check('真实人机有击杀且坐标朝向有限', match.kills.some((k) => k > 0) && match.finite);
  await shot(page, 'match-end');
  await page.close();
}

async function resources() {
  const page = await ready();
  const samples = await page.evaluate(() => {
    const g = window.__game;
    const snapshot = () => {
      const saved = [];
      for (const scene of [g.renderer.scene, g.renderer.vmScene]) scene.traverse((o) => {
        if (!o.geometry) return;
        saved.push([o, o.frustumCulled]);
        o.frustumCulled = false;
      });
      try { g.renderFrame(1 / 60); }
      finally { for (const [o, cull] of saved) o.frustumCulled = cull; }
      return {
        geometries: g.renderer.renderer.info.memory.geometries,
        textures: g.renderer.renderer.info.memory.textures,
        children: g.renderer.scene.children.length,
      };
    };
    const out = [];
    for (let i = 0; i < 5; i++) {
      g.startTeamMatch(); window.__desertFreeze(); snapshot();
      g.startBombMatch({ mapId: 'bomb-test' }); window.__desertFreeze(); snapshot();
      g.startBombMatch({ mapId: 'desert-gray' }); window.__desertFreeze();
      out.push(snapshot());
    }
    return out;
  });
  check('三张地图反复切换后资源稳定', samples.slice(2).every((s) => s.geometries === samples[1].geometries && s.textures === samples[1].textures && s.children === samples[1].children), samples);
  await page.evaluate(() => window.__game.restartMatch());
  check('再次对局保留沙城', await page.evaluate(() => window.__game.map.id === 'desert-gray'));
  await page.evaluate(() => window.__game.quitToMenu());
  check('退出后主页可见', await page.locator('#home').isVisible());
  await page.close();
}

try {
  const only = (process.env.DESERT_ONLY || '').split(',').filter(Boolean);
  for (const [name, run] of Object.entries({ flow, bots, resources })) {
    if (only.length && !only.includes(name)) continue;
    try { await run(); }
    catch (e) { check(`${name}完成`, false, e.stack); }
  }
} finally { await browser.close(); }
check('浏览器无运行错误', errors.length === 0, errors);
const pass = results.filter((r) => r.ok).length;
const fail = results.length - pass;
fs.writeFileSync(`${dir}/results.json`, JSON.stringify({ pass, fail, results, errors }, null, 2));
console.log(`沙城验收 ${pass} 通过 / ${fail} 失败`);
process.exitCode = fail ? 1 : 0;
