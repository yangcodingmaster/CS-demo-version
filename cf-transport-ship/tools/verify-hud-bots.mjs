// HUD 与基础 AI 的浏览器验收。前置：构建 dist 并启动 README 的本地静态服务。
// node tools/verify-hud-bots.mjs
// VERIFY_HUD_BOTS_ONLY=bomb,team,layout,ai 可选择分段；真实战斗整场另用 verify-bomb 的 bots 分段。
// VERIFY_HUD_BOTS_AI=finite,posts,handoff,weapons,safety,urgent,travel,yield 可选择定向 AI 场景。
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const BASE = process.env.HUD_BOTS_URL || process.env.BOMB_URL || 'http://127.0.0.1:8000/';
const CHROME = process.env.HUD_BOTS_CHROME || process.env.BOMB_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const SHOTS = 'tools/shots';
const results = [];
const errors = [];
const evidence = {};
const sections = (process.env.VERIFY_HUD_BOTS_ONLY || '').split(',').filter(Boolean);
const check = (name, ok, detail = '') => {
  results.push({ name, ok: !!ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` · ${detail}` : ''}`);
};
const assertFixture = (ok, message) => { if (!ok) throw new Error(`测试场景未建立：${message}`); };
const shot = (page, name) => page.screenshot({ path: `${SHOTS}/hud-bots-${name}.png` });
const sync = (page) => page.evaluate(() => window.__game.updateHUD(0));
const drive = async (page, seconds) => {
  const state = await page.evaluate((seconds) => window.__hudBotsDrive(seconds), seconds);
  await sync(page);
  return state;
};

async function ready(browser, viewport = { width: 1440, height: 900 }) {
  const page = await browser.newPage({ viewport });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const url = new URL(BASE); url.searchParams.set('nolock', ''); url.searchParams.set('q', 'low');
  await page.goto(url.href, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__game?.screens.visible === 'home', null, { timeout: 90000 });
  await page.evaluate(() => {
    const g = window.__game, simulate = g.simulate.bind(g);
    // 保留真实渲染、输入、规则与伤害，只把模拟时钟交给验收脚本。
    g.simulate = (dt) => { if (window.__hudBotsDriving) simulate(dt); };
    window.__hudBotsDrive = (seconds) => {
      const target = g.time + seconds;
      window.__hudBotsDriving = true;
      try {
        while (g.playing && !g.paused && g.time < target - 1e-9) {
          g.simulate(Math.min(0.025, target - g.time));
          window.__hudBotsSample?.();
        }
      } finally { window.__hudBotsDriving = false; }
      return { time: g.time, playing: g.playing, phase: g.bomb?.phase, round: g.bomb?.round };
    };
    window.__hudBotsFreeze = () => {
      for (const actor of g.actors) if (!actor.isPlayer) actor.update = () => {};
    };
    window.__hudBotsPlace = (actor, x, z, yaw = actor.yaw) => {
      actor.pos.set(x, 0.001, z); actor.vel.set(0, 0, 0); actor.speed = 0;
      actor.onGround = true; actor.crouch = false; actor.yaw = yaw;
      actor.height = 1.8; actor.eyeH = 1.62;
      actor.soldier.root.position.copy(actor.pos); actor.soldier.root.rotation.y = yaw;
      actor.soldier.root.updateMatrixWorld(true);
    };
    window.__hudBotsKill = (victim, attacker) => {
      g.damage(victim, attacker, 10000, 'chest', 'ak47', victim.pos.clone().set(1, 0, 0), false);
    };
  });
  return page;
}

async function start(page, mode = 'bomb', size = 6, freeze = true, primary = 'ak47', team = 'BL') {
  await page.evaluate(({ mode, size, freeze, primary, team }) => {
    const g = window.__game;
    window.__hudBotsSample = null;
    g.quitToMenu(); g.opts.team = team; g.opts.size = size; g.opts.diff = 'normal';
    g.profile.selectBackpack('bag-1'); g.profile.equip('bag-1', 'primary', primary);
    if (mode === 'bomb') g.startBombMatch(); else g.startTeamMatch();
    if (freeze) window.__hudBotsFreeze();
    g.updateHUD(0);
  }, { mode, size, freeze, primary, team });
}

const snapshot = (page) => page.evaluate(() => {
  const g = window.__game, p = g.player;
  const dots = [...document.querySelectorAll('#aliveBL .aliveDot, #aliveGR .aliveDot')].map((dot) => {
    const css = getComputedStyle(dot);
    return {
      id: String(dot.dataset.actorId),
      team: dot.closest('#aliveBL') ? 'BL' : 'GR',
      alive: dot.dataset.alive === 'true',
      classes: dot.className,
      background: css.backgroundColor,
      opacity: Number(css.opacity),
    };
  });
  return {
    mode: g.mode,
    phase: g.bomb?.phase,
    round: g.bomb?.round,
    attackTeam: g.bomb?.attackTeam,
    score: { ...g.score },
    myId: String(p.id),
    myTeam: p.team,
    alive: p.alive,
    spectatorId: g.spectatorId == null ? null : String(g.spectatorId),
    actors: g.actors.map((a) => ({ id: String(a.id), team: a.team, alive: a.alive, k: a.stats.k, d: a.stats.d })),
    stats: { k: p.stats.k, d: p.stats.d },
    uiStats: {
      k: document.querySelector('#statKills')?.textContent.trim(),
      d: document.querySelector('#statDeaths')?.textContent.trim(),
      kd: document.querySelector('#statKD')?.textContent.trim(),
    },
    dots,
    aria: ['BL', 'GR'].map((t) => document.querySelector('#alive' + t)?.getAttribute('aria-label')),
  };
});
const rosterMatches = (s, size) => s.dots.length === size * 2 && ['BL', 'GR'].every((team) => {
  const actors = s.actors.filter((a) => a.team === team), dots = s.dots.filter((d) => d.team === team);
  return actors.length === size && dots.length === size && actors.every((a) => dots.some((d) => d.id === a.id && d.alive === a.alive));
}) && s.dots.filter((d) => d.classes.split(' ').includes('self')).length === 1
  && s.dots.find((d) => d.classes.split(' ').includes('self'))?.id === s.myId;
const statsMatch = (s) => s.uiStats.k === String(s.stats.k) && s.uiStats.d === String(s.stats.d)
  && s.uiStats.kd === (s.stats.d === 0 ? '—' : (s.stats.k / s.stats.d).toFixed(2));
const visiblyGrey = (dot) => {
  const rgb = dot?.background.match(/[\d.]+/g)?.slice(0, 3).map(Number);
  return !!dot && !dot.alive && dot.classes.split(' ').includes('dead') && rgb?.length === 3
    && Math.max(...rgb) - Math.min(...rgb) <= 32 && dot.opacity > 0;
};

async function live(page) {
  const s = await page.evaluate(() => ({ phase: window.__game.bomb.phase, left: window.__game.bomb.deadline - window.__game.time }));
  if (s.phase === 'preparation') await drive(page, s.left + 0.005);
  assertFixture((await snapshot(page)).phase === 'live', '需要进行中的爆破回合');
}
async function winRound(page, team) {
  await live(page);
  await page.evaluate((winner) => {
    const g = window.__game, attacker = g.actors.find((a) => a.alive && a.team === winner && !a.isPlayer) || g.actors.find((a) => a.alive && a.team === winner);
    if (!attacker) throw new Error('胜方必须有存活成员');
    for (const a of g.actors) if (a.alive && a.team !== winner) window.__hudBotsKill(a, attacker);
  }, team);
  await drive(page, 0.025);
  assertFixture((await snapshot(page)).phase === 'result', '真实全灭必须产生回合结算');
  const left = await page.evaluate(() => window.__game.bomb.deadline - window.__game.time);
  await drive(page, left + 0.005);
}

async function bomb(browser) {
  const page = await ready(browser);
  try {
    await start(page);
    let s = await snapshot(page);
    check('爆破开局双方各5点，灯按真实演员ID和阵营排列', rosterMatches(s, 5) && s.dots.every((d) => d.alive), JSON.stringify(s));
    check('开局本人K/D清零，零死亡KD显示 —', statsMatch(s) && s.stats.k === 0 && s.stats.d === 0, JSON.stringify(s.uiStats));
    const identities = Object.fromEntries(s.actors.map((a) => [a.id, a.team]));
    await live(page);
    const victimId = await page.evaluate(() => {
      const g = window.__game, enemy = g.actors.find((a) => a.team !== g.player.team);
      window.__hudBotsKill(enemy, g.player); return String(enemy.id);
    });
    await drive(page, 0.025); s = await snapshot(page);
    check('真实击杀后该敌人灯变灰且本人K=1', rosterMatches(s, 5) && visiblyGrey(s.dots.find((d) => d.id === victimId)) && s.stats.k === 1 && statsMatch(s), JSON.stringify(s));
    check('有击杀但零死亡仍显示 —', s.uiStats.kd === '—');
    await shot(page, 'bomb-kill-kd');
    await page.evaluate(() => {
      const g = window.__game, foe = g.actors.find((a) => a.alive && a.team !== g.player.team);
      window.__hudBotsKill(g.player, foe);
    });
    await drive(page, 0.025); s = await snapshot(page);
    check('本人阵亡灯变灰，整场K/D同步为1/1', !s.alive && visiblyGrey(s.dots.find((d) => d.id === s.myId)) && s.stats.k === 1 && s.stats.d === 1 && statsMatch(s), JSON.stringify(s));
    await page.keyboard.press('KeyQ'); await drive(page, 0.025); s = await snapshot(page);
    const viewed = s.actors.find((a) => a.id === s.spectatorId);
    check('观战统计仍是本人，且实际观战者是不同统计的活队友', viewed?.alive && viewed.team === s.myTeam && viewed.id !== s.myId && (viewed.k !== s.stats.k || viewed.d !== s.stats.d) && statsMatch(s), JSON.stringify({ viewed, stats: s.stats, ui: s.uiStats }));
    await winRound(page, 'BL'); s = await snapshot(page);
    check('下一回合全部灯重亮，但个人统计继续累积', s.round === 2 && s.dots.every((d) => d.alive) && rosterMatches(s, 5) && s.stats.k === 1 && s.stats.d === 1 && statsMatch(s), JSON.stringify(s));
    while (s.round < 5) { await winRound(page, s.round % 2 === 0 ? 'GR' : 'BL'); s = await snapshot(page); }
    check('第4回合后换边，不改变点的队伍归属与本人统计', s.round === 5 && s.attackTeam === 'GR' && s.actors.every((a) => identities[a.id] === a.team) && rosterMatches(s, 5) && statsMatch(s), JSON.stringify(s));
    await page.evaluate(() => { const g = window.__game; g.restartMatch(); window.__hudBotsFreeze(); g.updateHUD(0); });
    s = await snapshot(page);
    check('爆破重开全部灯重亮并清零个人统计', s.round === 1 && s.dots.every((d) => d.alive) && rosterMatches(s, 5) && s.stats.k === 0 && s.stats.d === 0 && statsMatch(s), JSON.stringify(s));
    evidence.bomb = s;
  } finally { await page.close(); }
}

async function team(browser) {
  const page = await ready(browser);
  try {
    for (const size of [4, 6, 8]) {
      await start(page, 'team', size); await drive(page, 3.1);
      assertFixture(await page.evaluate(() => window.__game.player.protectT === 0), '团队出生保护必须已经结束');
      let s = await snapshot(page);
      check(`团队${size}v${size}：点数跟随真实人数，无上场残留`, rosterMatches(s, size) && s.dots.every((d) => d.alive) && statsMatch(s), JSON.stringify(s));
      await page.evaluate(() => { const g = window.__game; window.__hudBotsKill(g.player, g.actors.find((a) => a.team !== g.player.team)); });
      await drive(page, 0.025); s = await snapshot(page);
      check(`团队${size}v${size}：真实阵亡立即灰灯与D=1`, !s.alive && visiblyGrey(s.dots.find((d) => d.id === s.myId)) && s.stats.d === 1 && statsMatch(s), JSON.stringify(s));
      await drive(page, 3.8); s = await snapshot(page);
      check(`团队${size}v${size}：4秒前不会提前重亮`, !s.alive && !s.dots.find((d) => d.id === s.myId).alive);
      await drive(page, 0.25); s = await snapshot(page);
      check(`团队${size}v${size}：4秒后复活灯重亮，统计不重置`, s.alive && s.dots.find((d) => d.id === s.myId).alive && rosterMatches(s, size) && s.stats.d === 1 && statsMatch(s), JSON.stringify(s));
    }
    evidence.team = await snapshot(page);
  } finally { await page.close(); }
}

const geometry = (page) => page.evaluate(() => {
  const box = (id) => {
    const el = document.getElementById(id); if (!el) return null;
    const r = el.getBoundingClientRect(), css = getComputedStyle(el);
    return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom, visible: css.display !== 'none' && css.visibility !== 'hidden' && r.width > 0 && r.height > 0 };
  };
  return Object.fromEntries(['matchHeader', 'score', 'bombHud', 'radarWrap', 'feed', 'vitals', 'personalStats', 'ammo', 'slots', 'cDot', 'cross', 'scope'].map((id) => [id, box(id)]));
});
const overlaps = (a, b) => !!a?.visible && !!b?.visible && a.x < b.right - 0.5 && a.right > b.x + 0.5 && a.y < b.bottom - 0.5 && a.bottom > b.y + 0.5;
const fits = (r, viewport) => !!r?.visible && r.x >= -0.5 && r.y >= -0.5 && r.right <= viewport.width + 0.5 && r.bottom <= viewport.height + 0.5;
async function layout(browser) {
  const page = await ready(browser);
  try {
    for (const viewport of [{ width: 1440, height: 900 }, { width: 1280, height: 720 }]) {
      await page.setViewportSize(viewport);
      for (const mode of ['team', 'bomb']) {
        await start(page, mode); if (mode === 'bomb') await live(page); else await drive(page, 0.05);
        await page.waitForTimeout(100);
        const rects = await geometry(page), tag = `${mode}-${viewport.width}x${viewport.height}`;
        const topFits = ['matchHeader', 'score', 'radarWrap'].every((id) => fits(rects[id], viewport)) && (mode !== 'bomb' || fits(rects.bombHud, viewport));
        check(`${tag}：顶部信息在视口内并与雷达及C4栏错开`, topFits && !overlaps(rects.score, rects.bombHud) && !overlaps(rects.matchHeader, rects.radarWrap), JSON.stringify(rects));
        check(`${tag}：左下个人统计不遮挡生命护甲或右下弹药`, fits(rects.personalStats, viewport) && fits(rects.vitals, viewport) && rects.personalStats.bottom <= rects.vitals.y + 0.5 && !overlaps(rects.personalStats, rects.ammo), JSON.stringify({ stats: rects.personalStats, vitals: rects.vitals, ammo: rects.ammo }));
        check(`${tag}：普通中心点固定2px且位于视口中心`, rects.cDot?.visible && Math.abs(rects.cDot.width - 2) < 0.1 && Math.abs(rects.cDot.height - 2) < 0.1 && Math.abs(rects.cDot.x + 1 - viewport.width / 2) < 0.1 && Math.abs(rects.cDot.y + 1 - viewport.height / 2) < 0.1, JSON.stringify(rects.cDot));
        await shot(page, tag); evidence[tag] = rects;
      }
    }
    await start(page, 'team', 6, true, 'awm'); await drive(page, 1);
    await page.mouse.down({ button: 'right' }); await drive(page, 0.3); await page.mouse.up({ button: 'right' });
    const scope = await page.evaluate(() => ({ scoped: window.__game.player.scoped, on: document.getElementById('scope').classList.contains('on'), crossVisible: getComputedStyle(document.getElementById('cross')).display !== 'none' }));
    check('真实右键狙击开镜仍显示原scope，并隐藏普通准星', scope.scoped > 0 && scope.on && !scope.crossVisible, JSON.stringify(scope));
    await shot(page, 'scope');
  } finally { await page.close(); }
}

const botState = (page, id) => page.evaluate((id) => {
  const g = window.__game, a = g.actors.find((actor) => String(actor.id) === String(id));
  const task = g.getBombTask(a), interaction = g.bomb.interactions.get(a.id);
  return {
    id: a.id, alive: a.alive, time: g.time, pos: a.pos.toArray(), yaw: a.yaw,
    slot: a.slot, mags: a.inv.map((w) => w.mag), reserve: a.inv.map((w) => w.reserve),
    visible: a.visible, targetId: a.target?.id, canSeeTarget: a.target?.alive && a.canSee(a.target),
    shots: a.stats.shots, task, phase: g.bomb.phase, bomb: { ...g.bomb.bomb },
    left: g.bomb.deadline - g.time,
    interaction: interaction ? { ...interaction, progress: g.bomb.interactionProgress(a.id, g.time) } : null,
  };
}, id);
const activate = (page, ids) => page.evaluate((ids) => {
  const g = window.__game;
  for (const id of ids) {
    const a = g.actors.find((actor) => String(actor.id) === String(id));
    if (!a || a.isPlayer) throw new Error('仅可启用真实 Bot');
    delete a.update; a.thinkT = 0;
  }
}, ids);

async function finiteActors(page) {
  // 不冻结 Bot，不替换伤害或感知，检查爆破准备期转进行中的首个真实更新。
  await start(page, 'bomb', 6, false); await live(page);
  const read = () => page.evaluate(() => window.__game.actors.map((a) => ({
    id: a.id, alive: a.alive, yaw: a.yaw, pitch: a.pitch, speed: a.speed, pos: a.pos.toArray(), vel: a.vel.toArray(),
    finite: [a.yaw, a.pitch, ...a.pos.toArray(), ...a.vel.toArray()].every(Number.isFinite),
  })));
  const first = await read(); await drive(page, 0.3); const next = await read();
  check('未经干预的真实 Bot：准备期转进行中后全员坐标与朝向均有限', [...first, ...next].every((a) => a.finite), JSON.stringify({ first, next }));
  evidence.aiFinite = { first, next };
}

async function posts(page) {
  await start(page); await live(page);
  const fixture = await page.evaluate(() => {
    const g = window.__game, guards = g.actors.filter((a) => a.team === g.bomb.defendTeam);
    // 单独验收守点：攻方留在墙后，守方真实走完站位前的最后一段。
    // 全局路线由模式层单测覆盖；这里不假设双方中路出生点互不可见。
    const attackers = g.actors.filter((a) => a.team === g.bomb.attackTeam);
    for (const [i, a] of attackers.entries()) window.__hudBotsPlace(a, -24 + i, 0);
    return guards.map((a) => {
      const task = g.getBombTask(a), site = g.map.sites.find((s) => s.id === task.siteId);
      const dx = site.x - task.goal.x, dz = site.z - task.goal.z, length = Math.hypot(dx, dz);
      const x = task.goal.x + dx / length * 1.25, z = task.goal.z + dz / length * 1.25;
      const yaw = Math.atan2(-(task.lookAt.x - x), -(task.lookAt.z - z)) + Math.PI;
      window.__hudBotsPlace(a, x, z, yaw);
      return { id: a.id, task, start: a.pos.toArray(), noVisibleEnemy: !attackers.some((enemy) => a.canSee(enemy)),
        clearRoute: g.nav.lineFree(x, z, task.goal.x, task.goal.z) && !g.world.blocked(x, 0.05, z, a.radius, 1.75) };
    });
  });
  assertFixture(fixture.length === 5 && fixture.every((a) => a.task?.goal && a.task?.lookAt && !a.task.interact), '五名守方必须有公开守点任务');
  assertFixture(fixture.every((a) => a.noVisibleEnemy && a.clearRoute), '守点前的短路径可走且实体墙确实遮挡敌人');
  const goals = fixture.map((a) => a.task.goal);
  check('守点任务给同队分配可达且互不重叠的站位', goals.every((a, i) => goals.slice(i + 1).every((b) => Math.hypot(a.x - b.x, a.z - b.z) >= 1.5)), JSON.stringify(fixture));
  await activate(page, fixture.map((a) => a.id));
  await drive(page, 2);
  const states = await Promise.all(fixture.map((a) => botState(page, a.id)));
  const reached = states.every((a) => a.alive && !a.visible && Math.hypot(a.pos[0] - a.task.goal.x, a.pos[2] - a.task.goal.z) < 0.9);
  const separated = states.every((a, i) => states.slice(i + 1).every((b) => Math.hypot(a.pos[0] - b.pos[0], a.pos[2] - b.pos[2]) > 0.8));
  check('真实守方 Bot 从站位附近抵达各自位置，同队保持分散', reached && separated, JSON.stringify(states));
  const watchesEntry = states.every((a) => {
    const dx = a.task.lookAt.x - a.pos[0], dz = a.task.lookAt.z - a.pos[2], length = Math.hypot(dx, dz);
    return length > 0.5 && (-Math.sin(a.yaw) * dx - Math.cos(a.yaw) * dz) / length > 0.9;
  });
  check('真实守点朝向公开入口，保持有限巡视', reached && watchesEntry, JSON.stringify(states.map((a) => ({ id: a.id, yaw: a.yaw, pos: a.pos, lookAt: a.task.lookAt }))));
  evidence.aiPosts = { fixture, states };
}

async function handoff(page) {
  await start(page); await live(page);
  const fixture = await page.evaluate(() => {
    const g = window.__game, site = g.map.sites[0];
    g.clearInput(); window.__hudBotsPlace(g.player, site.x, site.z);
    window.__hudBotsKill(g.player, g.actors.find((a) => a.team === g.bomb.defendTeam));
    const owners = g.actors.filter((a) => a.alive && !a.isPlayer && g.getBombTask(a)?.interact === 'pickup');
    const owner = owners[0], closer = g.actors.find((a) => a.alive && a.team === g.bomb.attackTeam && a !== owner);
    if (!owner || !closer) throw new Error('真实掉包后必须存在拾取负责人和队友');
    window.__hudBotsPlace(owner, site.x - 5, site.z);
    window.__hudBotsPlace(closer, site.x + 2, site.z);
    return { firstIds: owners.map((a) => a.id), ownerId: owner.id, closerId: closer.id, dropped: { ...g.bomb.bomb } };
  });
  assertFixture(fixture.dropped.state === 'dropped', '携包者死亡必须产生真实掉包');
  const stable = await page.evaluate(() => window.__game.actors.filter((a) => a.alive && !a.isPlayer && window.__game.getBombTask(a)?.interact === 'pickup').map((a) => a.id));
  check('掉包任务仅一名负责人，队友走得更近不会抢走任务', fixture.firstIds.length === 1 && stable.length === 1 && stable[0] === fixture.ownerId, JSON.stringify({ fixture, stable }));
  const nextIds = await page.evaluate((id) => {
    const g = window.__game, owner = g.actors.find((a) => a.id === id);
    window.__hudBotsKill(owner, g.actors.find((a) => a.alive && a.team === g.bomb.defendTeam));
    return g.actors.filter((a) => a.alive && !a.isPlayer && g.getBombTask(a)?.interact === 'pickup').map((a) => a.id);
  }, fixture.ownerId);
  check('真实负责人阵亡后，由存活队友接替单一任务', nextIds.length === 1 && nextIds[0] === fixture.closerId, JSON.stringify({ nextIds, fixture }));
  assertFixture(nextIds.length === 1, '接替者必须存在才能执行后续拾取');
  await activate(page, nextIds); await drive(page, 2);
  const executed = await botState(page, nextIds[0]);
  const carrier = await page.evaluate(() => window.__game.bomb.carrierId);
  check('接替的真实 Bot 自行到点拾起 C4', carrier === nextIds[0] && executed.bomb.state === 'carried' && executed.task?.interact === 'plant', JSON.stringify({ carrier, executed }));
  evidence.aiHandoff = { fixture, stable, nextIds, executed };
}

async function weapons(page) {
  await start(page); await live(page);
  const fixture = await page.evaluate(() => {
    const g = window.__game, a = g.actors.find((a) => a.team === g.bomb.defendTeam && a.inv[0].def.type === 'rifle'), site = g.map.sites[0];
    if (!a) throw new Error('需要真实步枪 Bot');
    g.clearInput(); window.__hudBotsPlace(a, site.x, site.z, Math.PI / 2);
    window.__hudBotsPlace(g.player, site.x - 4, site.z);
    a.inv[0].mag = 0; a.inv[0].reserve = a.inv[0].def.mag * 2;
    window.__ammoTrace = [];
    window.__hudBotsSample = () => window.__ammoTrace.push({ time: g.time, slot: a.slot, mag: a.weapon.mag, visible: a.visible, shots: a.stats.shots });
    return { id: a.id, playerId: g.player.id, canSee: a.canSee(g.player), secondaryMag: a.inv[1].mag, primaryReserve: a.inv[0].reserve };
  });
  assertFixture(fixture.canSee && fixture.secondaryMag > 0 && fixture.primaryReserve > 0, '空主弹匣、有备弹、副武器有弹且真实近敌可见');
  await activate(page, [fixture.id]); await drive(page, 0.2);
  const close = await botState(page, fixture.id);
  check('真实近敌感知下，空主弹匣 Bot 执行切副武器', close.visible && close.canSeeTarget && close.targetId === fixture.playerId && close.slot === 1 && close.mags[0] === 0, JSON.stringify({ fixture, close }));
  const hidden = await page.evaluate((id) => {
    const g = window.__game, a = g.actors.find((a) => a.id === id);
    window.__hudBotsPlace(g.player, -22, 0);
    return !a.canSee(g.player);
  }, fixture.id);
  assertFixture(hidden, '敌人必须真正藏到实体墙后');
  await drive(page, 4.5);
  const restored = await botState(page, fixture.id);
  const transitions = await page.evaluate(() => window.__ammoTrace.filter((s, i, rows) => i === 0 || s.slot !== rows[i - 1].slot));
  check('敌人藏到墙后并脱战，真实 Bot 恢复主武器且完成换弹', !restored.visible && restored.slot === 0 && restored.mags[0] > 0, JSON.stringify(restored));
  check('空弹切副与脱战恢复没有反复切枪', transitions.map((s) => s.slot).join(',') === '1,0', JSON.stringify(transitions));
  evidence.aiWeapons = { fixture, close, restored, transitions };
  await page.evaluate(() => { window.__hudBotsSample = null; });
}

async function plantByPlayer(page) {
  await start(page); await live(page);
  await page.evaluate(() => {
    const g = window.__game, site = g.map.sites[0];
    g.clearInput(); window.__hudBotsPlace(g.player, site.x, site.z);
  });
  await page.keyboard.press('Digit5'); await drive(page, 0.025);
  await page.keyboard.down('KeyE'); await drive(page, 3.1); await page.keyboard.up('KeyE'); await drive(page, 0.025);
  assertFixture((await snapshot(page)).phase === 'planted', '真实玩家输入必须成功安包');
}
async function defuserFixture(page, reveal = true) {
  return page.evaluate((reveal) => {
    const g = window.__game, point = g.bomb.bomb.position;
    const a = g.actors.find((a) => a.team === g.bomb.defendTeam && a.inv[0].def.type === 'rifle');
    window.__hudBotsPlace(a, point.x, point.z, Math.PI / 2);
    window.__hudBotsPlace(g.player, reveal ? point.x - 4 : -22, reveal ? point.z : 0);
    const task = g.getBombTask(a);
    return { id: a.id, task, canSee: a.canSee(g.player), playerId: g.player.id };
  }, reveal);
}

async function safety(page) {
  await plantByPlayer(page);
  const fixture = await defuserFixture(page);
  assertFixture(fixture.canSee && fixture.task?.interact === 'defuse' && !fixture.task.urgent, '非紧急拆包负责人站到包旁并真实看见近敌');
  await activate(page, [fixture.id]); await drive(page, 0.2);
  const danger = await botState(page, fixture.id);
  check('非紧急拆包 Bot 看见近敌先取消安拆', danger.visible && danger.canSeeTarget && !danger.interaction && !danger.task.urgent, JSON.stringify(danger));
  await drive(page, 0.55);
  const fighting = await botState(page, fixture.id);
  check('近敌仍在时，真实 Bot 发出实际射击且没有启动拆包', fighting.visible && fighting.shots > 0 && !fighting.interaction, JSON.stringify(fighting));
  const hidden = await page.evaluate((id) => {
    const g = window.__game, a = g.actors.find((a) => a.id === id), point = g.bomb.bomb.position;
    window.__hudBotsPlace(g.player, -22, 0); window.__hudBotsPlace(a, point.x, point.z);
    return !a.canSee(g.player);
  }, fixture.id);
  assertFixture(hidden, '需要实体墙遮挡敌人以验证安全滞后');
  await drive(page, 0.4);
  const delayed = await botState(page, fixture.id);
  check('敌人刚藏到墙后，Bot 保留安全滞后并未立即安拆', !delayed.visible && !delayed.interaction, JSON.stringify(delayed));
  await drive(page, 2.2);
  let started = await botState(page, fixture.id);
  check('安全滞后结束后，真实 Bot 自行站定开始连续拆包', started.interaction?.kind === 'defuse' && started.interaction.progress > 0, JSON.stringify(started));
  assertFixture(started.interaction?.kind === 'defuse', '后续坚持拆包场景需要真实交互已经开始');
  await drive(page, started.interaction.completeAt - started.time - 1);
  started = await botState(page, fixture.id);
  await page.evaluate(() => {
    const g = window.__game, point = g.bomb.bomb.position;
    window.__hudBotsPlace(g.player, point.x - 4, point.z);
  });
  await drive(page, 0.3);
  const committed = await botState(page, fixture.id);
  check('拆包剩余不足1.25秒时，实际看见新近敌仍保留原连续进度', committed.visible && committed.canSeeTarget && committed.interaction?.startAt === started.interaction.startAt && committed.interaction.progress > started.interaction.progress, JSON.stringify({ started, committed }));
  await drive(page, 0.8);
  const completed = await botState(page, fixture.id);
  check('连续拆包实际完成并产生守方回合胜利', completed.phase === 'result' && completed.bomb.state === 'defused', JSON.stringify(completed));
  evidence.aiSafety = { fixture, danger, fighting, delayed, started, committed, completed };
}

async function urgent(page) {
  await plantByPlayer(page);
  const left = await page.evaluate(() => window.__game.bomb.deadline - window.__game.time);
  await drive(page, left - 6);
  const fixture = await defuserFixture(page);
  assertFixture(fixture.canSee && fixture.task?.interact === 'defuse' && fixture.task.urgent, '仅推进真实时钟到C4剩6秒，近敌可见且任务紧急');
  await activate(page, [fixture.id]); await drive(page, 0.25);
  const committed = await botState(page, fixture.id);
  check('C4将到截止时，真实 Bot 面对近敌仍优先开始拆包并停火', committed.visible && committed.canSeeTarget && committed.interaction?.kind === 'defuse' && committed.shots === 0, JSON.stringify({ fixture, committed }));
  await drive(page, 5);
  const completed = await botState(page, fixture.id);
  check('紧急拆包实际赶在C4截止前完成', completed.phase === 'result' && completed.bomb.state === 'defused', JSON.stringify(completed));
  evidence.aiUrgent = { fixture, committed, completed };
}

async function urgentTravel(page) {
  await start(page, 'bomb', 6, true, 'ak47', 'GR'); await live(page);
  const left = await page.evaluate(() => window.__game.bomb.deadline - window.__game.time);
  await drive(page, left - 6);
  const fixture = await page.evaluate(() => {
    const g = window.__game, a = g.actors.find((actor) => actor.id === g.bomb.carrierId), site = g.map.sites[0];
    for (const [i, enemy] of g.actors.filter((actor) => actor.team === g.bomb.defendTeam && !actor.isPlayer).entries()) window.__hudBotsPlace(enemy, -24 + i, -2);
    window.__hudBotsPlace(a, site.x - 7, site.z, Math.PI);
    window.__hudBotsPlace(g.player, site.x - 7, site.z + 4);
    const task = g.getBombTask(a), distance = Math.hypot(a.pos.x - task.goal.x, a.pos.z - task.goal.z);
    window.__travelTrace = [];
    window.__hudBotsSample = () => window.__travelTrace.push({ time: g.time, visible: a.visible, targetId: a.target?.id, distance: Math.hypot(a.pos.x - task.goal.x, a.pos.z - task.goal.z), pos: a.pos.toArray() });
    return { id: a.id, playerId: g.player.id, canSee: a.canSee(g.player), task, distance, clearRoute: g.nav.lineFree(a.pos.x, a.pos.z, task.goal.x, task.goal.z) };
  });
  assertFixture(fixture.task?.interact === 'plant' && fixture.task.urgent && fixture.canSee && fixture.clearRoute && fixture.distance > 5, '紧急持包 Bot 距离安包点尚有真实可走路段，同时目击近敌');
  await activate(page, [fixture.id]); await drive(page, 0.8);
  const moved = await botState(page, fixture.id), trace = await page.evaluate(() => window.__travelTrace);
  const distance = Math.hypot(moved.pos[0] - fixture.task.goal.x, moved.pos[2] - fixture.task.goal.z);
  check('目击近敌但回合将截止，真实持包 Bot 沿任务路线赶路', trace.some((s) => s.visible && s.targetId === fixture.playerId) && distance < fixture.distance - 1, JSON.stringify({ fixture, moved, distance }));
  evidence.aiUrgentTravel = { fixture, moved, trace };
  await page.evaluate(() => { window.__hudBotsSample = null; });
}

async function yieldFriend(page) {
  await start(page, 'bomb', 6, true, 'ak47', 'GR'); await live(page);
  const fixture = await page.evaluate(() => {
    const g = window.__game, carrier = g.actors.find((a) => a.id === g.bomb.carrierId), site = g.map.sites[0];
    // 所有敌人真实留在墙后；不替换 canSee、任务判断或 Actor.move。
    for (const [i, a] of g.actors.filter((a) => a.team === g.bomb.defendTeam).entries()) window.__hudBotsPlace(a, -22, -4 + i * 2);
    window.__hudBotsPlace(carrier, site.x, site.z);
    let escort, startPoint, task;
    for (const a of g.actors.filter((a) => a.team === carrier.team && a !== carrier)) {
      const t = g.getBombTask(a), x = 2 * site.x - t.goal.x, z = 2 * site.z - t.goal.z;
      if (!g.nav.walkable(g.nav.idx(x, z)) || g.world.blocked(x, 0.05, z, 0.4, 1.75) || !g.nav.lineFree(x, z, t.goal.x, t.goal.z)) continue;
      escort = a; startPoint = { x, z }; task = t; break;
    }
    if (!escort) throw new Error('需要一条真实导航路径穿过安包者附近');
    window.__hudBotsPlace(escort, startPoint.x, startPoint.z);
    window.__yieldTrace = [];
    const ux = (task.goal.x - site.x) / Math.hypot(task.goal.x - site.x, task.goal.z - site.z);
    const uz = (task.goal.z - site.z) / Math.hypot(task.goal.x - site.x, task.goal.z - site.z);
    window.__hudBotsSample = () => {
      const dx = escort.pos.x - site.x, dz = escort.pos.z - site.z;
      const interaction = g.bomb.interactions.get(carrier.id);
      window.__yieldTrace.push({ time: g.time, separation: Math.hypot(escort.pos.x - carrier.pos.x, escort.pos.z - carrier.pos.z), lateral: Math.abs(-uz * dx + ux * dz), carrierMoved: Math.hypot(carrier.pos.x - site.x, carrier.pos.z - site.z), startAt: interaction?.startAt, progress: g.bomb.interactionProgress(carrier.id, g.time), escortPos: escort.pos.toArray() });
    };
    return { carrierId: carrier.id, escortId: escort.id, startPoint, task, noVisibleEnemy: !g.actors.filter((a) => a.team !== carrier.team).some((a) => carrier.canSee(a) || escort.canSee(a)) };
  });
  assertFixture(fixture.noVisibleEnemy, '安包者和护卫必须都没有实际可见敌人');
  await activate(page, [fixture.carrierId, fixture.escortId]); await drive(page, 2.2);
  const carrier = await botState(page, fixture.carrierId), escort = await botState(page, fixture.escortId);
  const trace = await page.evaluate(() => window.__yieldTrace);
  const working = trace.filter((s) => s.startAt != null), starts = [...new Set(working.map((s) => s.startAt))];
  const moved = Math.hypot(escort.pos[0] - fixture.startPoint.x, escort.pos[2] - fixture.startPoint.z);
  check('真实携包 Bot 自行到点安包，护卫接近时原连续进度不被推挤打断', carrier.interaction?.kind === 'plant' && starts.length === 1 && working.every((s) => s.carrierMoved < 0.03) && carrier.interaction.progress > 0.65, JSON.stringify({ carrier, fixture, starts }));
  check('真实护卫沿跨包点路径行动时主动绕开安包队友', moved > 2 && working.length > 0 && Math.min(...working.map((s) => s.separation)) > 0.8 && Math.max(...working.map((s) => s.lateral)) > 0.3, JSON.stringify({ escort, moved, minimumSeparation: Math.min(...working.map((s) => s.separation)), maximumLateral: Math.max(...working.map((s) => s.lateral)) }));
  evidence.aiYield = { fixture, carrier, escort, trace };
  await page.evaluate(() => { window.__hudBotsSample = null; });
}

async function ai(browser) {
  const page = await ready(browser);
  try {
    const cases = { finite: finiteActors, posts, handoff, weapons, safety, urgent, travel: urgentTravel, yield: yieldFriend };
    const only = (process.env.VERIFY_HUD_BOTS_AI || '').split(',').filter(Boolean);
    for (const name of only) if (!Object.hasOwn(cases, name)) throw new Error(`未知AI场景：${name}`);
    for (const [name, run] of Object.entries(cases)) {
      if (only.length && !only.includes(name)) continue;
      try { await run(page); }
      catch (error) { check(`AI ${name}场景完成`, false, String(error.stack || error).split('\n').slice(0, 4).join(' | ')); }
    }
  } finally { await page.close(); }
}

async function main() {
  fs.mkdirSync(SHOTS, { recursive: true });
  const runners = { bomb, team, layout, ai };
  for (const section of sections) if (!Object.hasOwn(runners, section)) throw new Error(`未知验收分段：${section}`);
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'] });
  try {
    for (const [name, run] of Object.entries(runners)) {
      if (sections.length && !sections.includes(name)) continue;
      try { await run(browser); }
      catch (error) { check(`${name}分段完成`, false, String(error.stack || error).split('\n').slice(0, 4).join(' | ')); }
    }
  } finally { await browser.close(); }
  check('浏览器无运行或控制台错误', errors.length === 0, [...new Set(errors)].join(' | '));
  const pass = results.filter((r) => r.ok).length, fail = results.length - pass;
  fs.writeFileSync(`${SHOTS}/hud-bots-results.json`, JSON.stringify({ pass, fail, results, errors, evidence }, null, 2));
  console.log(`\nHUD / AI 验收：${pass} 通过 / ${fail} 失败`);
  process.exitCode = fail ? 1 : 0;
}
await main();
