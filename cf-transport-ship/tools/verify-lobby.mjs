// 作战大厅验收：真实模式/配装入口、刷新持久化、返回大厅及连续进出资源。
// npm run build 且 dist 静态服务已启动后：node tools/verify-lobby.mjs
// LOBBY_ONLY=flow,profile,resources,layout 可选择分段；默认仅验收桌面。
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const BASE = process.env.LOBBY_URL || 'http://127.0.0.1:8000/';
const CHROME = process.env.LOBBY_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const DIR = 'tools/shots/lobby';
const selected = (process.env.LOBBY_ONLY || '').split(',').filter(Boolean);
const want = (name) => !selected.length || selected.includes(name);
const results = [], errors = [];
fs.mkdirSync(DIR, { recursive: true });
const check = (name, ok, detail = '') => {
  results.push({ name, ok: !!ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` · ${typeof detail === 'string' ? detail : JSON.stringify(detail)}` : ''}`);
};
const shot = (page, name) => page.screenshot({ path: `${DIR}/${name}.png` });
const tap = async (page, selector) => {
  await page.locator(selector).first().click({ timeout: 10000 });
  await settle(page);
};
const home = (page) => page.waitForFunction(() => window.__game?.screens.visible === 'home', null, { timeout: 90000 });
const settle = (page) => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const snapshot = (page) => page.evaluate(() => {
  const g = window.__game, l = g.lobby;
  return {
    screen: g.screens.visible,
    playing: g.playing,
    blocking: g.uiBlocking(),
    selectedMode: g.selectedMode,
    storedMode: localStorage.getItem('cf_lobby_mode'),
    selectedBag: g.profile.data.selectedBackpackId,
    nickname: g.profile.data.nickname,
    weapon: l?.weaponId,
    soldierWeapon: l?.soldier?.gunId,
    lobbyMode: l?.mode,
    lobbyDisposed: l?.disposed,
    lobbyFog: !!l?.scene?.fog,
    mode: g.mode,
    map: g.map?.id,
    actors: g.actors.length,
    playerBag: g.player?.activeBagId,
    playerPrimary: g.player?.inv[0]?.id,
  };
});

async function ready(browser, viewport = { width: 1440, height: 900 }, init = null) {
  const context = await browser.newContext({ viewport });
  if (init) await context.addInitScript(init);
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const url = new URL(BASE);
  url.searchParams.set('nolock', '');
  url.searchParams.set('q', 'low');
  await page.goto(url.href, { waitUntil: 'domcontentloaded' });
  await home(page);
  await settle(page);
  return { page, context };
}

async function enter(page, mode, team = null) {
  await tap(page, `#home [data-act="${mode}"]`);
  await tap(page, '#home [data-act="lobbyStart"]');
  await page.waitForFunction(() => !document.getElementById('menu').classList.contains('hidden'));
  if (team) await tap(page, `#menu [data-k="team"] [data-v="${team}"]`);
  await tap(page, '#btnStart');
  await page.waitForFunction(() => window.__game.screens.visible === 'bagSelect');
  await tap(page, '#bagSelect [data-act="start"]');
  await page.waitForFunction(() => window.__game.playing && window.__game.player, null, { timeout: 30000 });
  // 本工具验证大厅流程，比赛规则由既有团队/爆破工具覆盖。冻结机器人防止慢截图期间结算。
  await page.evaluate(() => {
    for (const actor of window.__game.actors) if (!actor.isPlayer) actor.update = () => {};
  });
  await settle(page);
}

async function flow(browser) {
  const { page, context } = await ready(browser);
  let s = await snapshot(page);
  check('首次进入默认团队竞技与背包1', s.screen === 'home' && !s.playing && s.selectedMode === 'team' && s.selectedBag === 'bag-1', s);
  check('大厅人物拿取默认AK且使用独立无雾场景', s.weapon === 'ak47' && s.soldierWeapon === 'ak47' && s.lobbyMode === 'team' && !s.lobbyFog && !s.lobbyDisposed, s);
  check('首页名称为作战大厅', (await page.locator('#home').textContent()).includes('作战大厅') && !(await page.locator('#home h1').textContent()).includes('运输船'));
  await shot(page, 'home-1440');

  await tap(page, '#home [data-act="bomb"]');
  s = await snapshot(page);
  check('选择爆破后留在大厅并更新选中状态', s.screen === 'home' && s.selectedMode === 'bomb' && s.lobbyMode === 'bomb' && await page.locator('#home [data-act="bomb"]').getAttribute('aria-pressed') === 'true', s);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await home(page);
  await settle(page);
  s = await snapshot(page);
  check('刷新后记住上次爆破选择', s.selectedMode === 'bomb' && s.lobbyMode === 'bomb' && !!s.storedMode, s);
  await tap(page, '#home [data-act="lobbyStart"]');
  check('开始作战打开已选择的爆破设置', await page.locator('#setupTitle').textContent() === '沙城' && await page.locator('#bombRules').isVisible());
  await shot(page, 'bomb-setup');
  await tap(page, '#btnStart');
  await tap(page, '#bagSelect [data-act="start"]');
  await page.waitForFunction(() => window.__game.playing && window.__game.player, null, { timeout: 30000 });
  s = await snapshot(page);
  check('真实按钮进入沙城爆破对局', s.mode === 'bomb' && s.map === 'desert-gray' && s.actors === 10 && s.playerBag === 'bag-1', s);
  await shot(page, 'bomb-match');
  // ?nolock 自动化没有系统指针锁，直接打开与退出指针锁相同的暂停界面。
  await page.evaluate(() => window.__game.pause());
  await page.waitForFunction(() => window.__game.paused);
  await tap(page, '#btnQuit');
  await home(page);
  s = await snapshot(page);
  check('暂停退出回大厅且人物与模式恢复', !s.playing && s.screen === 'home' && s.selectedMode === 'bomb' && s.weapon === 'ak47' && s.soldierWeapon === 'ak47', s);

  await enter(page, 'team');
  s = await snapshot(page);
  check('真实按钮进入团队竞技运输船', s.mode === 'team' && s.map === 'transport-ship' && s.actors >= 2 && s.playerBag === 'bag-1', s);
  await shot(page, 'team-match');
  await page.evaluate(() => window.__game.pause());
  await page.waitForFunction(() => window.__game.paused);
  await tap(page, '#btnQuit');
  await home(page);

  const before = await snapshot(page);
  await page.keyboard.down('KeyW');
  await page.mouse.move(650, 420);
  await page.mouse.down();
  await page.waitForTimeout(300);
  await page.mouse.up();
  await page.keyboard.up('KeyW');
  s = await snapshot(page);
  check('大厅鼠标与移动键不触发开火或进入比赛', s.blocking && !s.playing && s.screen === 'home' && s.actors === 0 && s.weapon === before.weapon, s);
  await context.close();

  const invalid = await ready(browser, undefined, () => { localStorage.setItem('cf_lobby_mode', 'unknown-mode'); });
  s = await snapshot(invalid.page);
  check('无效模式存储仍可进入大厅并回退团队模式', s.screen === 'home' && s.selectedMode === 'team', s);
  await invalid.context.close();
}

async function profile(browser) {
  const { page, context } = await ready(browser);
  for (const [id, weapon] of [['bag-2', 'm4a1'], ['bag-3', 'awm'], ['bag-1', 'ak47']]) {
    await tap(page, `#home [data-lobby-bag="${id}"]`);
    await settle(page);
    const s = await snapshot(page);
    check(`大厅切换${id}同步持枪`, s.screen === 'home' && s.selectedBag === id && s.weapon === weapon && s.soldierWeapon === weapon, s);
  }
  await tap(page, '#home [data-lobby-bag="bag-2"]');
  await tap(page, '#home [data-act="lobbyArmory"]');
  check('大厅武器库进入当前背包的主武器槽', await page.locator('#armory').isVisible() && (await page.locator('#armory .m1Arm').count()) === 8);
  await tap(page, '#armory .m1Arm[data-preview="mp5"]');
  await page.locator('#armory [data-w="mp5"]').click();
  check('武器库装备后返回背包', (await snapshot(page)).screen === 'backpack');
  await tap(page, '#backpack [data-act="back"]');
  await home(page);
  let s = await snapshot(page);
  check('配装回到大厅后人物换成MP5', s.selectedBag === 'bag-2' && s.weapon === 'mp5' && s.soldierWeapon === 'mp5', s);
  await shot(page, 'equipped-mp5');

  await tap(page, '#home [data-act="lobbyBag"]');
  check('大厅背包入口打开管理页面', (await snapshot(page)).screen === 'backpack');
  await tap(page, '#backpack [data-act="back"]');
  await home(page);
  check('大厅背包可直接返回大厅', (await snapshot(page)).screen === 'home');

  await tap(page, '#home [data-act="personal"]');
  await page.locator('#personal [data-role="nick"]').fill('大厅验收');
  await tap(page, '#personal [data-act="saveNick"]');
  await tap(page, '#personal [data-act="home"]');
  await home(page);
  s = await snapshot(page);
  check('个人资料保存昵称后大厅显示更新', s.nickname === '大厅验收' && (await page.locator('#home').textContent()).includes('大厅验收'), s);

  await tap(page, '#home [data-act="settings"]');
  check('大厅设置入口打开设置', await page.locator('#menu').isVisible());
  await tap(page, '#btnMenuBack');
  await home(page);
  check('设置可返回大厅', (await snapshot(page)).screen === 'home');

  await page.reload({ waitUntil: 'domcontentloaded' });
  await home(page);
  await settle(page);
  s = await snapshot(page);
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('cf_player_profile')));
  check('刷新保留背包选择、装备与昵称，人物同步', s.selectedBag === 'bag-2' && s.nickname === '大厅验收' && s.weapon === 'mp5' && s.soldierWeapon === 'mp5' && stored.backpacks.find((b) => b.id === 'bag-2').primary === 'mp5', s);
  await enter(page, 'team');
  s = await snapshot(page);
  check('大厅配装进入比赛实际生效', s.playerBag === 'bag-2' && s.playerPrimary === 'mp5', s);
  await context.close();
}

async function layout(browser) {
  const { page, context } = await ready(browser);
  for (const size of [{ width: 1440, height: 900 }, { width: 1280, height: 720 }]) {
    await page.setViewportSize(size);
    await settle(page);
    const bounds = await page.evaluate(() => {
      const home = document.getElementById('home');
      const outside = [...home.querySelectorAll('button')].filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width <= 0 || r.height <= 0 || r.left < -1 || r.top < -1 || r.right > innerWidth + 1 || r.bottom > innerHeight + 1;
      }).map((el) => el.dataset.act || el.dataset.lobbyBag || el.textContent.trim());
      return { sw: document.documentElement.scrollWidth, iw: innerWidth, outside };
    });
    check(`${size.width}×${size.height}大厅按钮全部可见且无横向溢出`, bounds.sw <= bounds.iw + 1 && bounds.outside.length === 0, bounds);
    await shot(page, `home-${size.width}x${size.height}`);
  }
  await context.close();
}

async function resources(browser) {
  const { page, context } = await ready(browser);
  const registerScenes = () => page.evaluate(() => {
    const g = window.__game, saved = [];
    // WebGL 只计数已经渲染过的物件；菜单隐藏的地图与随机站位会导致懒上传。
    // 与既有地图验收一致，量测前完整注册两个场景，随后恢复可见裁剪状态。
    for (const scene of [g.renderer.scene, g.renderer.vmScene, g.lobby.scene]) scene.traverse((object) => {
      if (!object.geometry) return;
      saved.push([object, object.frustumCulled]);
      object.frustumCulled = false;
    });
    try { g.renderer.render(); g.lobby.render(); }
    finally { for (const [object, culled] of saved) object.frustumCulled = culled; }
  });
  const samples = [];
  for (let i = 0; i < 5; i++) {
    for (const id of ['bag-1', 'bag-2', 'bag-3']) {
      await tap(page, `#home [data-lobby-bag="${id}"]`);
      await settle(page);
    }
    for (const mode of ['team', 'bomb']) {
      await enter(page, mode, mode === 'team' ? 'GR' : 'BL');
      await registerScenes();
      await page.evaluate(() => window.__game.quitToMenu());
      await home(page);
      await settle(page);
    }
    await registerScenes();
    // 资源计数只比较重复同一完整流程后的稳定值，允许首次 shader/缓存初始化。
    samples.push(await page.evaluate(() => {
      const g = window.__game, renderer = g.renderer.renderer;
      return {
        geometries: renderer.info.memory.geometries,
        textures: renderer.info.memory.textures,
        programs: renderer.info.programs.length,
        lobbyObjects: (() => { let n = 0; g.lobby.scene.traverse(() => n++); return n; })(),
        lobbyTeams: g.lobby.soldiers.size,
        lobbyDisposed: !!g.lobby.disposed,
      };
    }));
  }
  const stable = samples.slice(1).every((sample) => JSON.stringify(sample) === JSON.stringify(samples[1]));
  check('重复进出团队/爆破、双阵营及切换三背包后资源稳定', stable && samples.every((sample) => !sample.lobbyDisposed && sample.lobbyTeams === 2), samples);
  check('资源验收结束仍可使用大厅开始作战', await page.locator('#home [data-act="lobbyStart"]').isVisible());
  await shot(page, 'after-resources');
  await context.close();
}

const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--mute-audio', '--autoplay-policy=no-user-gesture-required'] });
try {
  if (want('flow')) await flow(browser);
  if (want('profile')) await profile(browser);
  if (want('layout')) await layout(browser);
  if (want('resources')) await resources(browser);
} catch (e) {
  check('验收脚本执行完成', false, String(e.stack || e).split('\n').slice(0, 5).join(' | '));
} finally {
  await browser.close();
}
check('浏览器控制台与页面零错误', errors.length === 0, errors);
const pass = results.filter((r) => r.ok).length, fail = results.length - pass;
fs.writeFileSync(`${DIR}/results.json`, JSON.stringify({ pass, fail, results, errors }, null, 2));
console.log(`\n作战大厅：${pass} 通过 / ${fail} 失败`);
process.exitCode = fail ? 1 : 0;
