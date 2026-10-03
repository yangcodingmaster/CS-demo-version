// M1 验收：用 playwright-core 驱动本机 Chrome，检查 M1 的存储、配装、输入屏蔽与界面表现
// 运行：node tools/verify-m1.mjs
//   M1_ONLY=functional,storage,rules,ui,mobile   只跑指定分段
//   M1_MOBILE=1                                  额外跑手机竖屏/横屏分段（自 2026-10-02 起手机端不作为验收项，默认跳过）
// 前置：8000 端口已有 `python3 -m http.server 8000 --bind 127.0.0.1 --directory dist`，且 dist 为最新构建
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const BASE = process.env.M1_URL || 'http://127.0.0.1:8000/';
const CHROME = process.env.M1_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const SHOT_DIR = 'tools/shots';
const results = [];

const check = (name, ok, detail = '') => {
  results.push({ name, ok: !!ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' · ' + detail : ''}`);
};

// 横向溢出：页面级 scrollWidth 超过视口，或卡片内部出现横向滚动
async function overflow(page) {
  return page.evaluate(() => {
    const boxes = [...document.querySelectorAll('.menuBox,.m1Box,.pauseBox,.endBox')]
      .filter((e) => e.offsetParent !== null && e.scrollWidth > e.clientWidth + 1)
      .map((e) => `${e.id || e.className}:${e.scrollWidth}>${e.clientWidth}`);
    return { sw: document.documentElement.scrollWidth, iw: window.innerWidth, boxes };
  });
}

async function shoot(page, name) {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  await page.screenshot({ path: `${SHOT_DIR}/${name}.png` });
}

function watchErrors(page, bucket) {
  page.on('pageerror', (e) => bucket.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') bucket.push('console: ' + m.text()); });
}

// 页面局部状态快照
const snapshot = (page, extra = '') => page.evaluate((extraJs) => {
  const g = window.__game, p = g.player;
  const base = {
    screen: g.screens.visible, playing: g.playing, paused: g.paused, inLoadout: !!g.inLoadout,
    blocking: g.uiBlocking(), bag: p ? p.activeBagId : null, nextBag: p ? p.pendingBagId : null,
    inv: p ? p.inv.map((w) => w.id) : null, mags: p ? p.inv.map((w) => w.mag) : null,
    slot: p ? p.slot : null, pos: p ? [+p.pos.x.toFixed(3), +p.pos.z.toFixed(3)] : null,
    keys: p ? [...p.keys] : null, mouseL: p ? p.mouse.l : null,
    nickname: g.profile.data.nickname, selected: g.profile.data.selectedBackpackId,
    bags: g.profile.data.backpacks.map((b) => b.id + ':' + b.primary), presets: g.profile.data.presets || null,
    ended: !!g.ended, goal: g.goal, score: g.score,
  };
  return extraJs ? Object.assign(base, eval(extraJs)) : base;
}, extra);

async function ready(page, url = BASE) {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__game && window.__game.screens && window.__game.screens.visible === 'home', null, { timeout: 90000 });
  await page.waitForTimeout(300);
}

// ---------- 功能链路：直接驱动 window.__game，不依赖界面标记 ----------
async function functional(browser, errs) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  watchErrors(page, errs);
  await ready(page, BASE + '?nolock');
  await shoot(page, 'desktop-01-home');

  // 存储：默认档案
  let s = await snapshot(page);
  check('档案默认：3 个背包，主武器 ak47/m4a1/awm', s.bags.join(',') === 'bag-1:ak47,bag-2:m4a1,bag-3:awm', s.bags.join(','));
  check('档案默认：选中 bag-1', s.selected === 'bag-1', s.selected);

  // 配装写入并持久化
  await page.evaluate(() => {
    window.__game.profile.equip('bag-2', 'primary', 'mp5');
    window.__game.profile.setNickname('验收员');
    window.__game.profile.selectBackpack('bag-2');
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__game && window.__game.profile, null, { timeout: 90000 });
  s = await snapshot(page);
  check('刷新后配置仍在：bag-2 主武器 mp5', s.bags.includes('bag-2:mp5'), s.bags.join(','));
  check('刷新后昵称保留', s.nickname === '验收员', s.nickname);
  check('刷新后选中背包保留', s.selected === 'bag-2', s.selected);

  // 开局使用主页选中背包
  await page.waitForFunction(() => window.__game.screens.visible === 'home', null, { timeout: 90000 });
  await page.evaluate(() => window.__game.startTeamMatch());
  await page.waitForFunction(() => window.__game.playing && window.__game.player, null, { timeout: 20000 });
  s = await snapshot(page);
  check('开局配装 = bag-2（mp5/deagle/knife/he）', s.inv.join(',') === 'mp5,deagle,knife,he', s.inv.join(','));
  check('开局生效背包标记 = bag-2', s.bag === 'bag-2', String(s.bag));
  check('玩家昵称进入对局', (await page.evaluate(() => window.__game.player.name)) === '验收员');
  const magsBefore = s.mags.join(',');

  // B 面板：打开后阻断输入，关闭后不残留
  await page.evaluate(() => window.__game.toggleLoadout());
  await page.waitForTimeout(150);
  s = await snapshot(page);
  check('B 面板打开：inLoadout + 输入屏蔽', s.inLoadout === true && s.blocking === true, JSON.stringify({ inLoadout: s.inLoadout, blocking: s.blocking }));
  const posBefore = s.pos;
  await page.keyboard.down('KeyW');
  await page.mouse.move(700, 450);
  await page.mouse.down();
  await page.waitForTimeout(400);
  s = await snapshot(page);
  check('面板打开时按住 W 不入队', (s.keys || []).length === 0, JSON.stringify(s.keys));
  check('面板打开时不移动', s.pos && s.pos[0] === posBefore[0] && s.pos[1] === posBefore[1], JSON.stringify([posBefore, s.pos]));
  check('面板打开时不左键开火', s.mouseL === false, String(s.mouseL));
  await page.mouse.up();

  // 换包只登记，不刷弹
  await page.evaluate(() => window.__game.requestBagChange('bag-3'));
  s = await snapshot(page);
  check('换包只登记 nextBag=bag-3', s.nextBag === 'bag-3' && s.bag === 'bag-2', JSON.stringify({ next: s.nextBag, active: s.bag }));
  check('换包不刷新弹药', s.mags.join(',') === magsBefore, `${magsBefore} -> ${s.mags.join(',')}`);

  // 关闭面板后输入恢复、无残留
  await page.evaluate(() => window.__game.closeBagPanel());
  await page.waitForTimeout(150);
  s = await snapshot(page);
  check('关闭面板：输入恢复且无残留按键', s.inLoadout === false && (s.keys || []).length === 0, JSON.stringify(s.keys));
  check('关闭面板后可以继续开枪', s.mouseL === false && s.blocking === false);

  // 复活时待生效背包生效
  await page.evaluate(() => window.__game.spawnActor(window.__game.player, false));
  await page.waitForTimeout(200);
  s = await snapshot(page);
  check('复活后生效背包 = bag-3', s.bag === 'bag-3', String(s.bag));
  check('复活后配装 = bag-3 主武器 awm', s.inv[0] === 'awm', s.inv.join(','));
  check('复活后弹药为满（这是唯一补给时机）', s.mags[0] === 5, String(s.mags[0]));

  // 暂停：同样阻断输入
  await page.evaluate(() => window.__game.pause());
  await page.waitForTimeout(100);
  await page.keyboard.down('KeyD');
  await page.waitForTimeout(200);
  s = await snapshot(page);
  check('暂停时输入被阻断', (s.keys || []).length === 0 && s.blocking === true, JSON.stringify(s.keys));
  await page.keyboard.up('KeyD');
  await page.evaluate(() => window.__game.resume(true));
  s = await snapshot(page);
  check('恢复后回到对局', s.paused === false && s.blocking === false);

  // 一局打到结算：把目标击杀设为 1，机器人对拼即可结束
  await page.evaluate(() => { window.__game.opts.goal = 1; window.__game.goal = 1; });
  await page.waitForFunction(() => window.__game.ended === true, null, { timeout: 60000 }).catch(() => {});
  s = await snapshot(page);
  check('对局可正常结算', s.ended === true, JSON.stringify({ ended: s.ended, score: s.score }));
  await shoot(page, 'desktop-02-end');

  // 返回主页路径完整
  await page.evaluate(() => window.__game.quitToMenu());
  await page.waitForTimeout(200);
  s = await snapshot(page);
  check('结算后返回主页', s.screen === 'home' && s.playing === false, JSON.stringify({ screen: s.screen, playing: s.playing }));
  await page.close();
}

// ---------- 界面链路：点真实按钮走完 主页→设置→背包→武器库→对局 ----------
async function uiFlow(browser, errs) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  watchErrors(page, errs);
  await ready(page, BASE + '?nolock');
  const tap = async (sel) => { await page.locator(sel).first().click({ timeout: 8000 }); await page.waitForTimeout(250); };
  let s;

  // 爆破入口必须是明确的开发中提示，且点了不进入任何模式
  // 注意：该按钮带 aria-disabled="true"，Playwright 会按不可点击处理，这里用 force 绕过可操作性检查
  const bomb = page.locator('#home [data-act="bomb"]');
  const bombOff = await bomb.getAttribute('class');
  const bombAria = await bomb.getAttribute('aria-disabled');
  await bomb.click({ force: true, timeout: 5000 });
  await page.waitForTimeout(250);
  check('主页：爆破入口标为开发中且点击不进入', /off/.test(bombOff || '') && bombAria === 'true' && (await snapshot(page)).screen === 'home', JSON.stringify({ cls: bombOff, aria: bombAria }));

  await tap('#home [data-act="team"]');
  check('主页 → 团队模式设置', await page.locator('#menu').isVisible(), JSON.stringify({ visible: await page.locator('#menu').isVisible() }));
  await shoot(page, 'desktop-02-team-setup');

  await tap('#btnStart');
  s = await snapshot(page);
  check('设置页 → 初始背包选择', s.screen === 'bagSelect', String(s.screen));
  await shoot(page, 'desktop-03-bagselect');
  let ov = await overflow(page);
  check('桌面：背包选择无横向溢出', ov.sw <= ov.iw + 1 && ov.boxes.length === 0, JSON.stringify(ov));

  // 选初始背包：点整张卡片改主页默认背包
  await tap('#bagSelect .m1Bag[data-bag="bag-3"]');
  s = await snapshot(page);
  check('初始背包选择写入主页默认背包', s.selected === 'bag-3', String(s.selected));

  await tap('#bagSelect [data-act="start"]');
  await page.waitForFunction(() => window.__game.playing && window.__game.player, null, { timeout: 20000 });
  s = await snapshot(page);
  check('从选择页进入对局并使用 bag-3', s.inv[0] === 'awm' && s.bag === 'bag-3', JSON.stringify({ inv: s.inv, bag: s.bag }));

  // 局内 B 面板：界面上的背包卡片可点，登记下次复活背包
  await page.evaluate(() => window.__game.toggleLoadout());
  await page.waitForTimeout(250);
  await shoot(page, 'desktop-04-match-bagpanel');
  check('局内 B 面板显示「当前使用」标记', (await page.locator('#backpack .m1Tag.on').count()) >= 1);
  await tap('#backpack .m1Bag[data-bag="bag-1"]');
  s = await snapshot(page);
  check('局内点卡片登记下次复活背包', s.nextBag === 'bag-1', String(s.nextBag));
  check('局内换包标记「下次复活生效」', (await page.locator('#backpack .m1Tag.next').count()) >= 1);
  await tap('#backpack [data-act="closeBag"]');
  s = await snapshot(page);
  check('关闭按钮关闭面板并回到对局', s.inLoadout === false && s.screen === null, JSON.stringify({ inLoadout: s.inLoadout, screen: s.screen }));

  await page.evaluate(() => window.__game.quitToMenu());
  await page.waitForTimeout(250);

  // 个人界面 → 背包 → 武器库 → 点选装备即保存
  await tap('#home [data-act="personal"]');
  check('主页 → 个人界面', (await snapshot(page)).screen === 'personal');
  await shoot(page, 'desktop-05-personal');
  ov = await overflow(page);
  check('桌面：个人界面无横向溢出', ov.sw <= ov.iw + 1 && ov.boxes.length === 0, JSON.stringify(ov));

  const nickVisible = await page.locator('#personal [data-role="nick"]').isVisible();
  await page.locator('#personal [data-role="nick"]').fill('阿验收');
  await tap('#personal [data-act="saveNick"]');
  s = await snapshot(page);
  check('个人界面可改昵称并保存', nickVisible && s.nickname === '阿验收', s.nickname);

  await tap('#personal [data-act="manage"]');
  check('个人界面 → 背包管理', (await snapshot(page)).screen === 'backpack');
  await shoot(page, 'desktop-06-backpack');
  ov = await overflow(page);
  check('桌面：背包无横向溢出', ov.sw <= ov.iw + 1 && ov.boxes.length === 0, JSON.stringify(ov));

  await tap('#backpack .m1Slot[data-bag="bag-2"][data-slot="primary"]');
  check('背包点槽位 → 武器库', (await snapshot(page)).screen === 'armory');
  await shoot(page, 'desktop-07-armory');
  const armCount = await page.locator('#armory .m1Arm').count();
  const armIds = await page.locator('#armory .m1Arm').evaluateAll((els) => els.map((e) => e.dataset.w));
  check('武器库主武器只列 4 件已实现装备', armCount === 4 && armIds.every((id) => ['ak47', 'm4a1', 'awm', 'mp5'].includes(id)), JSON.stringify(armIds));
  const plannedShown = await page.evaluate(() => ['usp', 'glock18', 'flash', 'smoke'].filter((id) => document.querySelector(`#armory [data-w="${id}"]`)).length);
  check('武器库不出现未交付装备', plannedShown === 0, String(plannedShown));

  await tap('#armory .m1Arm[data-w="mp5"]');
  s = await snapshot(page);
  check('点选装备立即保存并返回背包', s.screen === 'backpack' && s.bags.includes('bag-2:mp5'), JSON.stringify({ screen: s.screen, bags: s.bags }));

  await tap('#backpack [data-act="back"]');
  check('背包可返回个人界面', (await snapshot(page)).screen === 'personal');
  await tap('#personal [data-act="home"]');
  check('个人界面可返回主页', (await snapshot(page)).screen === 'home');
  await page.close();
}

// ---------- 手机竖屏 / 横屏 ----------
async function mobile(browser, errs) {
  const portrait = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  watchErrors(portrait, errs);
  await ready(portrait, BASE + '?touch&nolock');
  await shoot(portrait, 'mobile-portrait-01-home');
  let ov = await overflow(portrait);
  check('手机竖屏：主页无横向溢出', ov.sw <= ov.iw + 1 && ov.boxes.length === 0, JSON.stringify(ov));
  // 触屏点击主页入口
  await portrait.locator('#home [data-act="personal"]').first().tap();
  await portrait.waitForTimeout(300);
  check('手机竖屏：主页入口可点（触屏）', (await snapshot(portrait)).screen === 'personal');
  await portrait.evaluate(() => window.__game.showHome());
  await portrait.waitForTimeout(200);
  await portrait.evaluate(() => window.__game.showPersonal());
  await portrait.waitForTimeout(250);
  await shoot(portrait, 'mobile-portrait-02-personal');
  ov = await overflow(portrait);
  check('手机竖屏：个人界面无横向溢出', ov.sw <= ov.iw + 1 && ov.boxes.length === 0, JSON.stringify(ov));
  await portrait.evaluate(() => window.__game.screens.openBackpack({ context: 'manage' }));
  await portrait.waitForTimeout(250);
  await shoot(portrait, 'mobile-portrait-03-backpack');
  ov = await overflow(portrait);
  check('手机竖屏：背包无横向溢出', ov.sw <= ov.iw + 1 && ov.boxes.length === 0, JSON.stringify(ov));
  await portrait.evaluate(() => window.__game.screens.openArmory({ bagId: 'bag-1', slot: 'primary' }));
  await portrait.waitForTimeout(250);
  await shoot(portrait, 'mobile-portrait-04-armory');
  ov = await overflow(portrait);
  check('手机竖屏：武器库无横向溢出', ov.sw <= ov.iw + 1 && ov.boxes.length === 0, JSON.stringify(ov));
  await portrait.evaluate(() => window.__game.showTeamSetup());
  await portrait.waitForTimeout(250);
  await shoot(portrait, 'mobile-portrait-05-team');
  ov = await overflow(portrait);
  check('手机竖屏：运输船设置无横向溢出（既有溢出已修）', ov.sw <= ov.iw + 1 && ov.boxes.length === 0, JSON.stringify(ov));
  await portrait.close();

  const landscape = await browser.newPage({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  watchErrors(landscape, errs);
  await ready(landscape, BASE + '?touch&nolock');
  await landscape.evaluate(() => window.__game.startTeamMatch());
  await landscape.waitForFunction(() => window.__game.playing && window.__game.player, null, { timeout: 20000 });
  await landscape.waitForTimeout(700);
  await shoot(landscape, 'mobile-landscape-01-match');
  const hud = await landscape.evaluate(() => {
    const vis = (sel) => { const e = document.querySelector(sel); if (!e) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden'; };
    const cross = document.querySelector('#cross').getBoundingClientRect();
    return { ammo: vis('#ammo'), slots: vis('#slots'), crossIn: cross.left >= 0 && cross.right <= innerWidth && cross.top >= 0 && cross.bottom <= innerHeight, touch: vis('#touch') };
  });
  check('手机横屏对局：弹药/槽位/准星/触屏控件都在视口内', hud.ammo && hud.slots && hud.crossIn && hud.touch, JSON.stringify(hud));
  await landscape.evaluate(() => window.__game.toggleLoadout());
  await landscape.waitForTimeout(300);
  await shoot(landscape, 'mobile-landscape-02-bagpanel');
  const ovl = await overflow(landscape);
  check('手机横屏对局：背包面板无横向溢出', ovl.sw <= ovl.iw + 1, JSON.stringify(ovl));
  await landscape.close();
}

// ---------- 存储：旧配置迁移与损坏档案回退（浏览器端到端） ----------
async function storage(browser, errs) {
  // 1) 只有旧 cf_ship_opts.primary，没有新档案 -> 迁移到 bag-1.primary
  const ctx1 = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx1.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('cf_ship_opts', JSON.stringify({ primary: 'mp5', vol: 0.35, fov: 90, quality: 'low' }));
  });
  const p1 = await ctx1.newPage();
  watchErrors(p1, errs);
  await ready(p1, BASE + '?nolock');
  let s = await snapshot(p1);
  check('端到端：旧主武器迁移到 bag-1', s.bags[0] === 'bag-1:mp5', s.bags.join(','));
  const optsKept = await p1.evaluate(() => JSON.parse(localStorage.getItem('cf_ship_opts') || '{}'));
  check('端到端：旧设置其它字段保留', optsKept.vol === 0.35 && optsKept.fov === 90 && optsKept.quality === 'low', JSON.stringify(optsKept));
  await p1.close(); await ctx1.close();

  // 2) 损坏档案 + 未知/未交付装备 ID -> 逐项回退，不白屏
  const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx2.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('cf_player_profile', '{"schemaVersion":9,"nickname":"","selectedBackpackId":"nope","backpacks":[{"id":"bag-1","primary":"usp","secondary":"ak47","throwable":"flash"},{"id":"bag-1"},null]}');
  });
  const p2 = await ctx2.newPage();
  watchErrors(p2, errs);
  await ready(p2, BASE + '?nolock');
  s = await snapshot(p2);
  check('端到端：损坏档案回退为 3 个唯一背包', s.bags.length === 3 && new Set(s.bags.map((b) => b.split(':')[0])).size === 3, s.bags.join(','));
  check('端到端：未交付 ID usp/flash 被回退', !s.bags.some((b) => /usp|flash/.test(b)), s.bags.join(','));
  check('端到端：类别不符的副武器槽未被主武器顶替', (await p2.evaluate(() => window.__game.profile.data.backpacks[0].secondary)) === 'deagle');
  check('端到端：无效选中项回退到合法背包', ['bag-1', 'bag-2', 'bag-3'].includes(s.selected), String(s.selected));
  check('端到端：坏档案下仍能开局', await p2.evaluate(() => { window.__game.startTeamMatch(); return true; }));
  await p2.waitForFunction(() => window.__game.playing && window.__game.player, null, { timeout: 20000 });
  s = await snapshot(p2);
  check('端到端：回退后的配装可正常进入对局', s.inv.length === 4 && s.inv.every((id) => !!id), s.inv.join(','));
  await p2.close(); await ctx2.close();
}

// ---------- 团队竞技原有规则未被改坏的回归检查 ----------
async function rules(browser, errs) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  watchErrors(page, errs);
  await ready(page, BASE + '?nolock');
  await page.evaluate(() => { window.__game.opts.size = 6; window.__game.opts.goal = 50; window.__game.opts.diff = 'normal'; });
  await page.evaluate(() => window.__game.startTeamMatch());
  await page.waitForFunction(() => window.__game.playing && window.__game.player, null, { timeout: 20000 });
  const r = await page.evaluate(() => {
    const g = window.__game, p = g.player;
    return {
      total: g.actors.length, bots: g.actors.filter((a) => !a.isPlayer).length,
      teams: { BL: g.actors.filter((a) => a.team === 'BL').length, GR: g.actors.filter((a) => a.team === 'GR').length },
      goal: g.goal, timeLeft: g.timeLeft, hp: p.hp, armor: p.armor, alive: p.alive, protect: +p.protectT.toFixed(2),
      akDmg: p.inv[0].def.dmg, mag: p.inv[0].mag,
    };
  });
  check('团队规则：6v6 = 12 名角色 / 11 个机器人', r.total === 12 && r.bots === 11, JSON.stringify(r.teams));
  check('团队规则：目标击杀 50、时限 600 秒', r.goal === 50 && r.timeLeft > 590 && r.timeLeft <= 600, JSON.stringify({ goal: r.goal, time: r.timeLeft }));
  check('团队规则：出生 100 生命 / 100 护甲 / 有出生保护', r.hp === 100 && r.armor === 100 && r.alive && r.protect > 0, JSON.stringify({ hp: r.hp, armor: r.armor, protect: r.protect }));
  check('团队规则：AK-47 伤害数值未改（36）', r.akDmg === 36, String(r.akDmg));

  const p0 = await page.evaluate(() => [window.__game.player.pos.x, window.__game.player.pos.z]);
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(500);
  await page.keyboard.up('KeyW');
  const p1 = await page.evaluate(() => [window.__game.player.pos.x, window.__game.player.pos.z]);
  const moved = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
  check('团队规则：键盘移动可用', moved > 0.4, moved.toFixed(2) + ' m');

  // 开火消耗弹药：走真实的输入链路（?nolock 下 locked 为真，鼠标事件直接生效）
  const magBefore = await page.evaluate(() => window.__game.player.inv[0].mag);
  await page.mouse.move(720, 450);
  await page.mouse.down();
  await page.waitForTimeout(350);
  await page.mouse.up();
  const magAfter = await page.evaluate(() => window.__game.player.inv[0].mag);
  check('团队规则：开火消耗弹药', magAfter < magBefore, `${magBefore} -> ${magAfter}`);

  const dmg = await page.evaluate(() => {
    const g = window.__game, p = g.player;
    const enemy = g.actors.find((a) => a.team !== p.team && a.alive);
    if (!enemy) return null;
    enemy.protectT = 0;                       // 出生保护会免伤，测试时先解除
    const before = enemy.hp;
    g.damage(enemy, p, 36, 'chest', 'ak47', new enemy.pos.constructor(0, 0, 1), false);
    return { before, after: enemy.hp };
  });
  check('团队规则：伤害结算可用', !!dmg && dmg.after < dmg.before, JSON.stringify(dmg));

  const dead = await page.evaluate(() => {
    const g = window.__game, p = g.player;
    const enemy = g.actors.find((a) => a.team !== p.team);
    if (!enemy) return null;
    enemy.protectT = 0;
    g.kill(enemy, p, 'ak47', false, false, new enemy.pos.constructor(0, 0, 1));
    return { alive: enemy.alive, respawnT: +enemy.respawnT.toFixed(1), score: { ...g.score }, myKills: p.stats.k };
  });
  check('团队规则：击杀计分与 4 秒重生', !!dead && dead.alive === false && dead.respawnT === 4 && dead.myKills >= 1, JSON.stringify(dead));
  await page.close();
}

async function main() {
  if (!fs.existsSync(CHROME)) { console.error('找不到 Chrome：' + CHROME); process.exit(2); }
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'] });
  const errs = [];
  const only = (process.env.M1_ONLY || '').split(',').filter(Boolean);
  const mobileOn = process.env.M1_MOBILE === '1' || only.includes('mobile');
  const want = (n) => (!only.length || only.includes(n)) && (n !== 'mobile' || mobileOn);
  try {
    if (want('functional')) await functional(browser, errs);
    if (want('storage')) await storage(browser, errs);
    if (want('rules')) await rules(browser, errs);
    if (want('ui')) await uiFlow(browser, errs);
    if (want('mobile')) await mobile(browser, errs);
  } catch (e) {
    const lines = String(e && e.stack ? e.stack : e).split('\n').slice(0, 4).join(' | ');
    check('验收脚本执行完成', false, lines.slice(0, 400));
  }
  await browser.close();
  const pass = results.filter((r) => r.ok).length, fail = results.filter((r) => !r.ok).length;
  console.log(`\n===== 汇总：${pass} 通过 / ${fail} 失败 =====`);
  if (errs.length) { console.log('控制台错误：'); [...new Set(errs)].forEach((e) => console.log('  ' + e.slice(0, 200))); }
  fs.writeFileSync('tools/shots/results.json', JSON.stringify({ pass, fail, results, errs }, null, 2));
  process.exit(fail || errs.length ? 1 : 0);
}

main();
