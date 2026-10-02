// 真实 Game 事件切段、引信更新和 damage 队列；只替换场景、UI 和角色运动。
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Game } from '../src/game.js';
import { Actor } from '../src/actor.js';
import { audio } from '../src/audio.js';
import { BombRules } from '../src/bomb-rules.js';
import { WEAPONS, WeaponState } from '../src/weapons.js';

function makeGame(now = 8) {
  const actors = [
    { id: 0, team: 'BL', alive: true, hp: 100, armor: 0, pos: new THREE.Vector3(), stats: { hits: 0 } },
    { id: 1, team: 'GR', alive: true, hp: 100, armor: 0, pos: new THREE.Vector3(), stats: { hits: 0 } },
  ];
  const bomb = new BombRules();
  bomb.beginRound(0, actors);
  bomb.advance(8, actors);
  if (now > 8) bomb.advance(now, actors);
  bomb.drainEvents();
  const game = Object.create(Game.prototype);
  Object.assign(game, {
    time: now,
    timeLeft: bomb.deadline - now,
    playing: true,
    paused: false,
    ended: false,
    bomb,
    actors,
    timers: [],
    nades: [],
    recordedEvents: [],
    explosions: [],
    removed: [],
    world: { raycast() { return null; } },
    renderer: { scene: { remove(mesh) { game.removed.push(mesh); } } },
    validateBombInteractions() {},
    processBombEvents() { this.recordedEvents.push(...this.bomb.drainEvents()); },
    explode(pos, owner) {
      this.explosions.push({ at: this.time, pos, owner });
      if (this.explosionVictim) this.damage(this.explosionVictim, owner, 1000, 'chest', 'he', new THREE.Vector3(1, 0, 0), false);
    },
    kill(victim) {
      victim.alive = false;
      victim.hp = 0;
      this.bomb.cancelInteraction(victim.id);
      this.bomb.dropCarrier(victim.id, victim.pos);
    },
    simulateStep(dt) {
      this.time += dt;
      for (let i = this.timers.length - 1; i >= 0; i--) {
        if (this.time >= this.timers[i].t) {
          const fn = this.timers[i].fn;
          this.timers.splice(i, 1);
          fn();
        }
      }
      this.updateNades(dt);
    },
  });
  // 测试内设限，回归时同步死循环能明确失败；正式 Game 不依赖这个检测器。
  const advance = bomb.advance.bind(bomb);
  let lastTime = -1, repeated = 0;
  bomb.advance = (at, snapshot) => {
    repeated = at === lastTime ? repeated + 1 : 0;
    lastTime = at;
    assert.ok(repeated < 10, `模拟反复停在同一时刻 ${at}`);
    return advance(at, snapshot);
  };
  return game;
}

function addGrenade(game, { explodeAt = game.time + WEAPONS.he.fuse, legacy = false } = {}) {
  const mesh = { position: new THREE.Vector3(), rotation: { x: 0, y: 0 } };
  const grenade = {
    fuse: explodeAt - game.time,
    pos: new THREE.Vector3(0, 5, 0),
    vel: new THREE.Vector3(),
    spin: new THREE.Vector3(),
    owner: game.actors[1],
    mesh,
  };
  if (!legacy) grenade.explodeAt = explodeAt;
  game.nades.push(grenade);
  return grenade;
}

for (const [name, step, count] of [['60 FPS', 1 / 60, 180], ['低 FPS', 0.5, 6], ['3 秒大步', 3, 1]]) {
  test(`默认 HE 引信 2.6 秒在${name}下只爆炸一次，模拟继续前进`, () => {
    const game = makeGame();
    const grenade = addGrenade(game);
    assert.equal(grenade.explodeAt, 10.6);
    for (let frame = 0; frame < count; frame++) game.simulate(step);
    assert.ok(Math.abs(game.time - 11) < 1e-9);
    assert.equal(game.nades.length, 0);
    assert.equal(game.explosions.length, 1);
    assert.equal(game.explosions[0].at, 10.6);
    assert.deepEqual(game.removed, [grenade.mesh]);
    assert.equal(game.bomb.phase, 'live');
  });
}

test('兼容仅有剩余引信的手雷，以及当前时刻已经到期的外部事件', () => {
  const legacy = makeGame();
  addGrenade(legacy, { legacy: true });
  legacy.simulate(3);
  assert.equal(legacy.time, 11);
  assert.equal(legacy.explosions.length, 1);
  assert.equal(legacy.explosions[0].at, 10.6);

  const due = makeGame(10.6);
  addGrenade(due, { explodeAt: 10.6 });
  due.simulate(1 / 60);
  assert.ok(due.time > 10.6);
  assert.equal(due.explosions.length, 1);
  assert.equal(due.explosions[0].at, 10.6);
  assert.equal(due.nades.length, 0);
});

test('手雷杀死携包者与安包完成同刻：实际伤害队列先死亡，安包不提交', () => {
  const game = makeGame();
  game.bomb.beginInteraction(0, 'plant', 10, { siteId: 'A', position: { x: 0, y: 0, z: 0 } });
  game.bomb.advance(10.4, game.actors);
  game.time = 10.4;
  const grenade = addGrenade(game);
  assert.equal(grenade.explodeAt, 13);
  game.explosionVictim = game.actors[0];
  game.simulate(3);
  assert.equal(game.actors[0].alive, false);
  assert.equal(game.bomb.phase, 'result');
  assert.equal(game.bomb.bomb.state, 'dropped');
  assert.equal(game.bomb.score.GR, 1);
  assert.deepEqual(game.recordedEvents.map((event) => event.type), ['round-result']);
  assert.equal(game.recordedEvents[0].at, 13);
  assert.equal(game.recordedEvents[0].reason, 'attackers-eliminated');
});

test('一次低 FPS 更新跨过安包和后续死亡，早完成的安包仍然有效', () => {
  const game = makeGame();
  game.bomb.beginInteraction(0, 'plant', 10, { siteId: 'A', position: { x: 0, y: 0, z: 0 } });
  game.bomb.advance(12.9, game.actors);
  game.time = 12.9;
  game.timers.push({
    t: 13.05,
    fn: () => game.damage(game.actors[0], game.actors[1], 1000, 'chest', 'he', new THREE.Vector3(1, 0, 0), false),
  });
  game.simulate(0.3);
  assert.equal(game.actors[0].alive, false);
  assert.equal(game.bomb.phase, 'planted');
  assert.equal(game.bomb.bomb.state, 'planted');
  assert.equal(game.bomb.deadline, 53);
  assert.deepEqual(game.bomb.score, { BL: 0, GR: 0 });
  assert.deepEqual(game.recordedEvents.map((event) => event.type), ['bomb-planted']);
  assert.equal(game.recordedEvents[0].at, 13);
});

test('同刻双方致命伤害都入队，统一快照判未安包双方全灭', () => {
  const game = makeGame();
  const at = game.time + 0.025;
  game.timers.push({
    t: at,
    fn: () => {
      game.damage(game.actors[0], game.actors[1], 1000, 'chest', 'ak47', new THREE.Vector3(1, 0, 0), false);
      game.damage(game.actors[1], game.actors[0], 1000, 'chest', 'ak47', new THREE.Vector3(-1, 0, 0), false);
      assert.ok(game.actors.every((actor) => actor.alive), '收集伤害时不能先结算第一条击杀');
    },
  });
  game.simulate(0.05);
  assert.ok(game.actors.every((actor) => !actor.alive));
  assert.equal(game.bomb.score.GR, 1);
  assert.equal(game.recordedEvents[0].reason, 'both-eliminated');
  assert.equal(game.recordedEvents[0].at, at);
  assert.equal(game.recordedEvents.length, 1);
});

test('Game 暂停冻结引信、规则截止和交互，恢复沿用模拟时刻', () => {
  const game = makeGame();
  game.bomb.beginInteraction(0, 'plant', 10, { siteId: 'A', position: { x: 0, y: 0, z: 0 } });
  game.bomb.advance(10, game.actors);
  game.time = 10;
  const grenade = addGrenade(game);
  const before = { now: game.time, deadline: game.bomb.deadline, fuse: grenade.fuse, explodeAt: grenade.explodeAt };
  game.paused = true;
  game.simulate(60);
  assert.deepEqual({ now: game.time, deadline: game.bomb.deadline, fuse: grenade.fuse, explodeAt: grenade.explodeAt }, before);
  assert.equal(game.bomb.interactionProgress(0, game.time), 0);
  assert.equal(game.explosions.length, 0);
  game.paused = false;
  game.simulate(1);
  assert.equal(game.time, 11);
  assert.equal(game.bomb.interactionProgress(0, game.time), 1 / 3);
  assert.ok(Math.abs(grenade.fuse - 1.6) < 1e-9);
});

test('实体碰撞推开安包者，即使 speed 为零也取消；连续按 E 不刷新开始站位', () => {
  const game = Object.create(Game.prototype);
  const actor = Object.create(Actor.prototype);
  Object.assign(actor, {
    id: 0,
    team: 'BL',
    alive: true,
    isPlayer: true,
    game,
    pos: new THREE.Vector3(0, 0.02, 0),
    vel: new THREE.Vector3(),
    radius: 0.36,
    height: 1.8,
    stepHeight: 0.42,
    onGround: true,
    crouch: false,
    eyeH: 1.62,
    yaw: 0,
    inv: [new WeaponState('ak47')],
    slot: 0,
    keys: new Set(['KeyE']),
    c4Selected: true,
    walk: false,
  });
  const neighbor = { id: 1, team: 'BL', alive: true, radius: 0.36, pos: new THREE.Vector3(0.2, 0.02, 0) };
  const defender = { id: 2, team: 'GR', alive: true, radius: 0.36, pos: new THREE.Vector3(10, 0.02, 0) };
  Object.assign(game, {
    time: 8,
    playing: true,
    ended: false,
    paused: false,
    inLoadout: false,
    actors: [actor, neighbor, defender],
    map: { sites: [{ id: 'A', x: 0, y: 0, z: 0, radius: 3 }] },
    world: {
      blocked() { return false; },
      move(movingActor) { movingActor.vel.y = 0; },
    },
  });
  game.bomb = new BombRules();
  game.bomb.beginRound(0, game.actors);
  game.bomb.advance(8, game.actors);
  game.bomb.drainEvents();
  assert.equal(game.updateObjective(actor, true), true);
  const before = actor.pos.clone();
  const anchor = { ...game.bomb.interactions.get(actor.id).actorPosition };
  actor.move(0.025, 0, 0, false, false, false);
  assert.ok(actor.pos.distanceTo(before) > 0.23, '真实 Actor.move 的角色分离产生位置变化');
  assert.equal(actor.speed, 0, '位移来自角色碰撞，水平速度检查不足以发现');
  assert.equal(game.updateObjective(actor, true), true);
  assert.deepEqual(game.bomb.interactions.get(actor.id).actorPosition, anchor, '持续按 E 不覆盖起始位置');
  game.validateBombInteractions();
  assert.equal(game.bomb.interactions.has(actor.id), false);
  assert.equal(game.bomb.interactionProgress(actor.id, 9), 0);
  game.bomb.advance(11, game.actors);
  assert.equal(game.bomb.phase, 'live');
  assert.deepEqual(game.bomb.drainEvents(), []);
});

for (const [label, headshot, priorMulti] of [['爆头', true, 0], ['多杀', false, 1]]) {
  test(`最后敌人被${label}击杀后，回合结算清除尚未播放的延迟播报`, () => {
    const game = makeGame();
    const player = game.actors[0], victim = game.actors[1];
    Object.assign(player, {
      isPlayer: true,
      name: 'Player',
      stats: { k: priorMulti, d: 0, hs: 0, hits: 0 },
      lastKillT: priorMulti ? game.time - 1 : -99,
      multi: priorMulti,
      streak: 0,
    });
    Object.assign(victim, {
      name: 'Enemy',
      stats: { k: 0, d: 0, hs: 0, hits: 0 },
      soldier: { die() {}, chestWorld(out) { return out.set(0, 1, 0); } },
    });
    Object.assign(game, {
      player,
      score: game.bomb.score,
      hud: { killFeed() {}, badge() {}, toast() {} },
      fx: { bloodSplat() {} },
      clearInput() {},
      processBombEvents: Game.prototype.processBombEvents,
    });
    const announcements = [];
    const originalAnnounce = audio.announce;
    audio.announce = (text) => announcements.push(text);
    try {
      Game.prototype.kill.call(game, victim, player, 'ak47', headshot, false, new THREE.Vector3(1, 0, 0));
      assert.equal(game.timers.length, 1, '延迟播报登记在可清理的模拟队列');
      assert.equal(game.timers[0].t, 8.15);
      game.simulate(0.1);
      assert.equal(game.bomb.phase, 'result');
      assert.equal(game.timers.length, 0, '真实 processBombEvents 清掉回合末待播报事件');
      game.simulate(0.2);
      assert.deepEqual(announcements, []);
    } finally {
      audio.announce = originalAnnounce;
    }
  });
}
