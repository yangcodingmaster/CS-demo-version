// 爆破验收：真实界面输入 + 可控模拟时间；另跑不干预 AI/伤害的整场比赛。
// 前置：npm run build，8000 端口启动 dist 静态服务。
// node tools/verify-bomb.mjs
// VERIFY_BOMB_ONLY=flow,objectives,rounds,resources,bots 可选择分段。
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const BASE = process.env.BOMB_URL || 'http://127.0.0.1:8000/';
const CHROME = process.env.BOMB_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const SHOTS = 'tools/shots';
const results = [];
const errors = [];
const only = (process.env.VERIFY_BOMB_ONLY || '').split(',').filter(Boolean);
const want = (name) => !only.length || only.includes(name);
const check = (name, ok, detail = '') => {
  results.push({ name, ok: !!ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` · ${detail}` : ''}`);
};
const drive = (page, seconds) => page.evaluate((s) => window.__bombDrive(s), seconds);
const shot = (page, name) => page.screenshot({ path: `${SHOTS}/bomb-${name}.png` });
const state = (page) => page.evaluate(() => {
  const g = window.__game, p = g.player, b = g.bomb;
  return {
    mode: g.mode,
    screen: g.screens.visible,
    playing: g.playing,
    paused: g.paused,
    ended: g.ended,
    map: g.map.id,
    actors: g.actors.length,
    phase: b?.phase,
    round: b?.round,
    attackTeam: b?.attackTeam,
    score: { ...g.score },
    bomb: b ? { ...b.bomb } : null,
    carrier: b?.carrierId,
    remaining: b ? b.deadline - g.time : null,
    alive: p?.alive,
    team: p?.team,
    bag: p?.activeBagId,
    nextBag: p?.pendingBagId,
    inv: p?.inv.map((w) => w.id),
    mags: p?.inv.map((w) => w.mag),
    slot: p?.slot,
    c4: p?.c4Selected,
    interaction: b?.interactions.get(p?.id) ? { ...b.interactions.get(p.id), progress: b.interactionProgress(p.id, g.time) } : null,
    spectator: g.spectatorId,
    ocean: g.env.ocean.visible,
    shipSpeed: g.env.shipSpeed,
    birds: g.fx.birds.filter((bird) => bird.g.visible).length,
    playerPos: p?.pos.toArray(),
    playerKills: p?.stats.k,
    time: g.time,
  };
});

async function pageReady(browser, deterministic = true) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`${BASE}?nolock&q=low`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__game?.screens.visible === 'home', null, { timeout: 90000 });
  await page.evaluate((controlled) => {
    const g = window.__game;
    const simulate = g.simulate.bind(g);
    // 渲染与实际键盘监听继续工作。只由本脚本推进规则时钟，消除截图速度的干扰。
    if (controlled) g.simulate = (dt) => { if (window.__bombDriving) simulate(dt); };
    window.__bombDrive = (seconds) => {
      window.__bombDriving = true;
      try { return g.fastForward(seconds, 0.025); }
      finally { window.__bombDriving = false; }
    };
    window.__freezeBots = () => {
      for (const a of g.actors) if (!a.isPlayer) a.update = () => {};
    };
    window.__place = (actor, x, z) => {
      actor.pos.set(x, 0.001, z);
      actor.vel.set(0, 0, 0);
      actor.speed = 0;
      actor.onGround = true;
      actor.crouch = false;
    };
    window.__kill = (victim, attacker) => g.damage(victim, attacker, 10000, 'chest', 'ak47', victim.pos.clone().set(1, 0, 0), false);
    window.__trackEvents = () => {
      window.__bombEvents = [];
      const original = g.bomb.drainEvents.bind(g.bomb);
      g.bomb.drainEvents = () => {
        const events = original();
        window.__bombEvents.push(...events.map((e) => ({ ...e })));
        return events;
      };
    };
  }, deterministic);
  return page;
}

async function start(page, team = 'BL', freeze = true) {
  await page.evaluate(({ team, freeze }) => {
    const g = window.__game;
    g.opts.team = team;
    g.startBombMatch();
    if (freeze) window.__freezeBots();
  }, { team, freeze });
}
async function live(page) {
  const remaining = await page.evaluate(() => window.__game.bomb.deadline - window.__game.time);
  await drive(page, remaining + 0.05);
}

async function flow(browser) {
  const page = await pageReady(browser);
  await shot(page, '01-home');
  await page.locator('#home [data-act="bomb"]').click();
  check('主页爆破入口进入正确设置', await page.locator('#setupTitle').textContent() === '爆破测试场' && await page.locator('#bombRules').isVisible());
  check('设置明确标注测试场与待提供沙漠灰参考', (await page.locator('#setupDesc').textContent()).includes('CF 沙漠灰参考尚未提供'));
  await shot(page, '02-setup');
  await page.locator('#menu [data-k="team"] [data-v="BL"]').click();
  await page.locator('#btnStart').click();
  check('设置下一步进入初始背包', (await state(page)).screen === 'bagSelect');
  await page.locator('#bagSelect .m1Bag[data-bag="bag-2"]').click();
  await page.locator('#bagSelect [data-act="start"]').click();
  await page.evaluate(() => window.__freezeBots());
  let s = await state(page);
  check('爆破开局为10人、准备8秒、初始bag-2', s.mode === 'bomb' && s.actors === 10 && s.phase === 'preparation' && s.remaining === 8 && s.bag === 'bag-2', JSON.stringify(s));
  check('陆地没有海面、船速、烟囱烟雾或海鸥', !s.ocean && s.shipSpeed === 0 && s.birds === 0 && await page.evaluate(() => window.__game.fx.funnelTop === null));
  const before = await page.evaluate(() => window.__game.actors.map((a) => ({ id: a.id, pos: a.pos.toArray(), hp: a.hp, mags: a.inv.map((w) => w.mag) })));
  await page.keyboard.down('KeyW');
  await page.evaluate(() => { window.__game.player.mouse.l = true; window.__game.player.mouse.lp = true; });
  await drive(page, 0.5);
  await page.keyboard.up('KeyW');
  const after = await page.evaluate(() => window.__game.actors.map((a) => ({ id: a.id, pos: a.pos.toArray(), hp: a.hp, mags: a.inv.map((w) => w.mag) })));
  check('准备阶段冻结移动与开火', before.every((a, i) => Math.hypot(a.pos[0] - after[i].pos[0], a.pos[2] - after[i].pos[2]) < 1e-6 && a.mags.join() === after[i].mags.join()));
  await page.evaluate(() => window.__kill(window.__game.player, window.__game.actors.find((a) => a.team !== window.__game.player.team)));
  check('准备阶段不能受伤', (await state(page)).alive && await page.evaluate(() => window.__game.player.hp === 100));
  check('准备阶段HUD显示准备及换包提示', (await page.locator('#center').textContent()).includes('准备') && (await page.locator('#center').textContent()).includes('按 B'));
  await page.keyboard.press('KeyB');
  await drive(page, 0.025);
  check('准备阶段按B打开背包', (await state(page)).screen === 'backpack');
  await page.locator('#backpack .m1Bag[data-bag="bag-3"]').click();
  s = await state(page);
  check('准备阶段界面换包立即生效', s.bag === 'bag-3' && s.inv[0] === 'awm', JSON.stringify({ bag: s.bag, inv: s.inv }));
  await page.locator('#backpack [data-act="closeBag"]').click();
  await live(page);
  s = await state(page);
  check('准备结束进入90秒回合且无出生保护', s.phase === 'live' && Math.abs(s.remaining - 90) < 0.1 && await page.evaluate(() => window.__game.actors.every((a) => a.protectT === 0)), JSON.stringify({ phase: s.phase, remaining: s.remaining }));
  check('当前回合存活者不能换包', !(await page.evaluate(() => window.__game.requestBagChange('bag-1'))) && (await state(page)).bag === 'bag-3');
  check('攻方HUD标注本回合进攻', (await page.locator('#bombRole').textContent()).includes('本回合进攻'));
  await page.evaluate(() => {
    const g = window.__game, site = g.map.sites[0];
    g.clearInput(); window.__place(g.player, site.x, site.z);
  });
  await page.keyboard.press('Digit5');
  await drive(page, 0.05);
  check('5选择独立C4，背包仍为四槽', (await state(page)).c4 && (await state(page)).inv.length === 4);
  await page.keyboard.down('KeyE');
  await drive(page, 1.05);
  s = await state(page);
  check('按住E开始3秒安包进度', s.interaction?.kind === 'plant' && s.interaction.progress > 0.3 && s.interaction.progress < 0.4, JSON.stringify(s.interaction));
  await shot(page, '03-plant-progress');
  await page.keyboard.up('KeyE');
  await drive(page, 0.05);
  check('松开E安包进度清零', !(await state(page)).interaction);
  await page.keyboard.down('KeyE');
  await drive(page, 0.55);
  await page.keyboard.down('KeyW');
  await drive(page, 0.05);
  await page.keyboard.up('KeyW');
  await page.keyboard.up('KeyE');
  check('移动取消安包且清零', !(await state(page)).interaction);
  await page.evaluate(() => { const g = window.__game; g.clearInput(); window.__place(g.player, g.map.sites[0].x, g.map.sites[0].z); });
  await page.keyboard.down('KeyE');
  await drive(page, 0.25);
  const gun = await state(page);
  await page.keyboard.press('Digit2');
  await page.evaluate(() => { const p = window.__game.player; p.mouse.l = p.mouse.lp = true; });
  await drive(page, 0.3);
  s = await state(page);
  check('安包期间不能切枪或开火', s.slot === gun.slot && s.mags.join() === gun.mags.join() && s.interaction?.kind === 'plant');
  await drive(page, 2.6);
  await page.keyboard.up('KeyE');
  s = await state(page);
  check('完成安包后进入40秒炸弹倒计时', s.phase === 'planted' && s.bomb.state === 'planted' && s.bomb.siteId === 'A' && s.remaining > 39.5 && s.remaining <= 40, JSON.stringify({ phase: s.phase, bomb: s.bomb, remaining: s.remaining }));
  check('安包完成返回普通武器，未增加回合分', !s.c4 && s.slot === gun.slot && s.score.BL === 0 && s.score.GR === 0);
  await shot(page, '04-planted');
  await page.evaluate(() => window.__game.pause());
  const paused = await state(page);
  await drive(page, 6);
  check('暂停冻结炸弹及模拟时钟', (await state(page)).time === paused.time && (await state(page)).remaining === paused.remaining);
  await page.evaluate(() => window.__game.resume(true));
  await drive(page, 0.1);
  check('恢复后炸弹继续倒计时', (await state(page)).remaining < paused.remaining);
  await page.close();
}

async function objectives(browser) {
  const page = await pageReady(browser);
  await start(page); await live(page);
  // 保留独立 C4 手持/进度截图，便于调整模型后只复验目标分段。
  await page.evaluate(() => {
    const g = window.__game, site = g.map.sites[0];
    window.__place(g.player, site.x, site.z);
    g.setC4Selected(g.player, true);
  });
  await page.keyboard.down('KeyE'); await drive(page, 0.9);
  await page.waitForTimeout(200);
  await shot(page, '03-plant-progress');
  await page.keyboard.up('KeyE'); await drive(page, 0.025);
  await page.evaluate(() => window.__game.setC4Selected(window.__game.player, false));
  let setup = await page.evaluate(() => {
    const g = window.__game, p = g.player;
    const friend = g.actors.find((a) => a !== p && a.team === p.team);
    const enemy = g.actors.find((a) => a.team !== p.team);
    g.bomb.dropCarrier(p.id, { x: -20, y: 0, z: 0 });
    window.__place(friend, -20, 0); window.__place(p, -21, 0);
    const pickup = g.pickupC4(friend);
    window.__kill(friend, enemy);
    return { pickup, dropped: g.bomb.bomb.state, position: g.bomb.bomb.position };
  });
  check('携包者死亡后C4掉落', setup.pickup && setup.dropped === 'dropped', JSON.stringify(setup));
  check('防守方不能拾取C4', await page.evaluate(() => {
    const g = window.__game, enemy = g.actors.find((a) => a.team !== g.player.team);
    window.__place(enemy, -20, 1);
    return g.pickupC4(enemy) === false && g.bomb.bomb.state === 'dropped';
  }));
  await page.keyboard.press('KeyE');
  await drive(page, 0.025);
  check('攻方单按E拾取掉落C4且不占背包槽', await page.evaluate(() => window.__game.bomb.carrierId === window.__game.player.id && window.__game.player.inv.length === 4));
  await page.evaluate(() => window.__kill(window.__game.player, window.__game.actors.find((a) => a.team !== window.__game.player.team)));
  await drive(page, 5);
  let s = await state(page);
  check('爆破死亡5秒后仍未复活', !s.alive && s.phase === 'live', JSON.stringify({ alive: s.alive, phase: s.phase }));
  check('击杀只增加个人记录、不增加回合分', s.score.BL === 0 && s.score.GR === 0);
  await page.keyboard.press('KeyQ'); await drive(page, 0.025);
  const first = (await state(page)).spectator;
  await page.keyboard.press('KeyQ'); await drive(page, 0.025);
  s = await state(page);
  check('阵亡按Q仅切换存活队友', first !== s.spectator && await page.evaluate(() => { const g = window.__game, a = g.actors.find((a) => a.id === g.spectatorId); return a.alive && a.team === g.player.team; }));
  await shot(page, '05-spectator');
  check('阵亡后可登记下一回合背包', await page.evaluate(() => window.__game.requestBagChange('bag-2')) && (await state(page)).nextBag === 'bag-2');
  await page.evaluate(() => {
    const g = window.__game, enemy = g.actors.find((a) => a.team !== g.player.team);
    for (const a of g.actors.filter((a) => a.alive && a.team === g.player.team)) window.__kill(a, enemy);
  });
  await drive(page, 0.025);
  await page.keyboard.press('KeyQ'); await drive(page, 0.025);
  check('没有存活队友时使用固定镜头且无敌方跟随', await page.evaluate(() => { const g = window.__game; return g.spectatorId === null && g.renderer.camera.position.x === g.map.spectator.x && g.renderer.camera.position.y === g.map.spectator.y; }));
  await drive(page, 4.1);
  check('下一回合出生应用阵亡后登记背包', (await state(page)).bag === 'bag-2' && (await state(page)).alive && (await state(page)).phase === 'preparation');

  await start(page, 'GR'); await live(page);
  const planted = await page.evaluate(() => {
    const g = window.__game, site = g.map.sites[0];
    const carrier = g.actors.find((a) => a.id === g.bomb.carrierId);
    window.__place(carrier, site.x, site.z);
    g.setC4Selected(carrier, true);
    carrier.objectiveHeld = true;
    g.updateObjective(carrier, true);
    return g.isInteracting(carrier);
  });
  await drive(page, 3.1);
  check('防守方对局能接收攻方安包状态', planted && (await state(page)).phase === 'planted');
  await page.evaluate(() => {
    const g = window.__game, p = g.bomb.bomb.position;
    window.__place(g.player, p.x, p.z + 1.2);
  });
  await page.keyboard.down('KeyE'); await drive(page, 0.5);
  check('防守方靠近按E开始拆包', (await state(page)).interaction?.kind === 'defuse');
  await page.evaluate(() => {
    const g = window.__game, p = g.bomb.bomb.position;
    window.__losWall = g.world.add({ x: p.x, y: 0.9, z: p.z + 0.6, sx: 2, sy: 1.8, sz: 0.2, mat: 'stone' });
    g.world.build();
  });
  await drive(page, 0.05);
  check('距离内有墙遮挡时取消拆包', !(await state(page)).interaction);
  await page.keyboard.up('KeyE');
  await page.evaluate(() => {
    const g = window.__game;
    g.world.colliders = g.world.colliders.filter((c) => c !== window.__losWall); g.world.build();
    const pos = g.bomb.bomb.position;
    window.__place(g.player, pos.x, pos.z + 1.2); g.clearInput();
  });
  await page.keyboard.down('KeyE'); await drive(page, 1);
  await page.keyboard.up('KeyE'); await drive(page, 0.025);
  check('松开E拆包进度清零', !(await state(page)).interaction);
  await page.keyboard.down('KeyE'); await drive(page, 5.1);
  await page.keyboard.up('KeyE');
  s = await state(page);
  check('连续5秒拆包仅增加一个防守回合分', s.phase === 'result' && s.bomb.state === 'defused' && s.score.GR === 1 && s.score.BL === 0, JSON.stringify({ phase: s.phase, score: s.score, bomb: s.bomb }));
  await shot(page, '06-defused');
  await page.close();
}

async function rounds(browser) {
  const page = await pageReady(browser);
  await start(page); await page.evaluate(() => window.__trackEvents());
  let swapped;
  for (let round = 1; round <= 8; round++) {
    await live(page);
    const winner = round % 2 ? 'BL' : 'GR';
    await page.evaluate((winner) => {
      const g = window.__game, attacker = g.actors.find((a) => a.team === winner);
      for (const victim of g.actors.filter((a) => a.team !== winner && a.alive)) window.__kill(victim, attacker);
    }, winner);
    await drive(page, 0.025);
    const s = await state(page);
    check(`第${round}回合只结算一次且伤害后停止战斗`, s.phase === 'result' && s.score.BL + s.score.GR === round && await page.evaluate(() => !window.__game.canFight()), JSON.stringify(s.score));
    await drive(page, 4.1);
    if (round === 4) swapped = await state(page);
  }
  check('第4回合后换边，队伍身份及比分保留', swapped.round === 5 && swapped.attackTeam === 'GR' && swapped.team === 'BL' && swapped.score.BL === 2 && swapped.score.GR === 2, JSON.stringify(swapped));
  let s = await state(page);
  check('8回合4:4平局，无加时', s.ended && s.phase === 'finished' && s.round === 8 && s.score.BL === 4 && s.score.GR === 4 && (await page.locator('#endSc').textContent()).includes('无加时'), JSON.stringify({ phase: s.phase, ended: s.ended, score: s.score }));
  await shot(page, '07-draw');
  await page.locator('#btnAgain').click();
  s = await state(page);
  check('再来一局保留爆破模式且重置回合比分', s.mode === 'bomb' && s.round === 1 && s.phase === 'preparation' && s.actors === 10 && s.score.BL === 0 && s.score.GR === 0);
  await page.evaluate(() => window.__game.quitToMenu());
  check('退出返回主页', (await state(page)).screen === 'home' && !(await state(page)).playing);
  await page.locator('#home [data-act="team"]').click();
  await page.locator('#btnStart').click();
  await page.locator('#bagSelect [data-act="start"]').click();
  s = await state(page);
  check('主页可切回运输船团队模式', s.mode === 'team' && s.map === 'transport-ship' && s.ocean && s.shipSpeed === 6.5 && s.birds === 6 && s.actors === 12, JSON.stringify({ mode: s.mode, map: s.map, ocean: s.ocean, actors: s.actors }));
  await shot(page, '08-team-return');
  await page.close();
}

async function resources(browser) {
  const page = await pageReady(browser);
  const growth = await page.evaluate(async () => {
    const g = window.__game;
    const settle = () => new Promise((resolve) => setTimeout(resolve, 250));
    const snapshot = () => {
      // GPU 计数只包含实际渲染注册的几何。菜单视角和海鸥位置会变化，
      // 所以每次量测先注册整个当前场景，不能靠随机等待或放宽增长阈值。
      const saved = [];
      for (const scene of [g.renderer.scene, g.renderer.vmScene]) scene.traverse((object) => {
        if (!object.geometry) return;
        saved.push([object, object.frustumCulled]);
        object.frustumCulled = false;
      });
      try { g.renderer.render(); }
      finally { for (const [object, value] of saved) object.frustumCulled = value; }
      return { geometry: g.renderer.renderer.info.memory.geometries, texture: g.renderer.renderer.info.memory.textures, sceneChildren: g.renderer.scene.children.length };
    };
    const cycle = async () => {
      g.startBombMatch(); window.__freezeBots(); await settle();
      g.quitToMenu(); await settle();
      g.startTeamMatch(); window.__freezeBots(); await settle();
      g.quitToMenu(); await settle();
      return snapshot();
    };
    // 首次渲染会创建枪械/士兵缓存，并因视锥变化上传此前未可见的地图批次。
    await cycle();
    const first = await cycle();
    const later = [];
    for (let i = 0; i < 3; i++) later.push(await cycle());
    return { first, later };
  });
  check('连续3轮爆破/团队切换资源不增长', growth.later.every((s) => s.geometry <= growth.first.geometry + 1 && s.texture <= growth.first.texture + 1 && s.sceneChildren === growth.first.sceneChildren), JSON.stringify(growth));
  await page.close();
}

async function bots(browser) {
  const page = await pageReady(browser);
  await start(page, 'GR', false);
  await page.evaluate(() => { window.__game.opts.diff = 'normal'; window.__trackEvents(); });
  const match = await page.evaluate(() => {
    const g = window.__game;
    const carrier = g.actors.find((a) => a.id === g.bomb.carrierId);
    // AI、感知、伤害和地图碰撞均保持原实现。
    window.__bombDrive(1000);
    return {
      initialCarrierWasBot: carrier && !carrier.isPlayer,
      ended: g.ended,
      round: g.bomb.round,
      score: { ...g.score },
      events: window.__bombEvents,
      kills: g.actors.map((a) => ({ team: a.team, isPlayer: a.isPlayer, k: a.stats.k, d: a.stats.d })),
    };
  });
  const reasonCounts = {};
  for (const e of match.events.filter((e) => e.type === 'round-result')) reasonCounts[e.reason] = (reasonCounts[e.reason] || 0) + 1;
  check('真实机器人整场：防守方玩家、机器人初始携包', match.initialCarrierWasBot);
  check('真实机器人整场正常结束', match.ended && match.score.BL + match.score.GR === match.round, JSON.stringify({ round: match.round, score: match.score, reasonCounts }));
  check('真实机器人使用战斗结算，未由测试强制击杀', match.kills.some((a) => !a.isPlayer && a.k > 0), JSON.stringify(match.kills));
  await shot(page, '09-bot-match-end');
  fs.writeFileSync(`${SHOTS}/bomb-bot-match.json`, JSON.stringify({ ...match, reasonCounts }, null, 2));

  // 单独屏蔽视觉感知，隔离检查机器人独立导航和安拆任务；不强制杀人、不改时长。
  await start(page, 'GR', false);
  await page.evaluate(() => {
    const g = window.__game;
    for (const a of g.actors) if (!a.isPlayer) a.canSee = () => false;
    window.__trackEvents();
  });
  const objective = await page.evaluate(() => {
    const g = window.__game;
    window.__bombDrive(60);
    return { events: window.__bombEvents, phase: g.bomb.phase, round: g.bomb.round, alive: g.actors.filter((a) => a.alive).length };
  });
  const plant = objective.events.find((e) => e.type === 'bomb-planted');
  const defuse = objective.events.find((e) => e.type === 'bomb-defused');
  check('隔离任务：攻方机器人自行抵达包点并安包', !!plant && plant.actorId !== 0, JSON.stringify({ phase: objective.phase, round: objective.round, plant }));
  check('隔离任务：守方机器人转点并完成拆包', !!defuse && defuse.actorId !== 0, JSON.stringify({ alive: objective.alive, defuse }));
  fs.writeFileSync(`${SHOTS}/bomb-bot-objectives.json`, JSON.stringify(objective, null, 2));
  await page.close();
}

async function main() {
  fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'] });
  try {
    for (const [name, run] of Object.entries({ flow, objectives, rounds, resources, bots })) {
      if (!want(name)) continue;
      try { await run(browser); }
      catch (e) { check(`${name}分段完成`, false, String(e.stack || e).split('\n').slice(0, 4).join(' | ')); }
    }
  } finally { await browser.close(); }
  check('浏览器无控制台或运行错误', errors.length === 0, [...new Set(errors)].join(' | '));
  const pass = results.filter((r) => r.ok).length;
  const fail = results.length - pass;
  fs.writeFileSync(`${SHOTS}/bomb-results.json`, JSON.stringify({ pass, fail, results, errors }, null, 2));
  console.log(`\n爆破验收：${pass} 通过 / ${fail} 失败`);
  process.exitCode = fail ? 1 : 0;
}
await main();
