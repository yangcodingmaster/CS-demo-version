import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { BombTactics, routeLength, shouldCommitObjective } from '../src/bomb-tactics.js';
import { Game } from '../src/game.js';
import { buildBombMap } from '../src/bomb-map.js';
import { NavGrid, World } from '../src/physics.js';

const actor = (id, team, x, z, isPlayer = false) => ({
  id,
  team,
  pos: new THREE.Vector3(x, 0, z),
  alive: true,
  isPlayer,
});

function fixture() {
  const world = new World();
  world.add({ x: 0, y: -0.3, z: 0, sx: 40, sy: 0.6, sz: 40 });
  world.add({ x: 2.5, y: 2, z: 0, sx: 0.8, sy: 4, sz: 8 });
  world.build();
  const game = {
    time: 10,
    world,
    nav: new NavGrid(world, -10, -10, 10, 10, 0.5, 0.42),
    actors: [actor(0, 'GR', 0.1, 0, true), actor(1, 'GR', 4, 0), actor(2, 'GR', 0, 5), actor(3, 'BL', -8, 0)],
    bomb: {
      active: true,
      round: 1,
      phase: 'planted',
      attackTeam: 'BL',
      deadline: 50,
      carrierId: null,
      bomb: { state: 'planted', position: { x: 0, y: 0, z: 0 }, siteId: 'A' },
      interactions: new Map(),
      config: { plantSeconds: 3, defuseSeconds: 5 },
    },
    map: {
      sites: [{ id: 'A', x: 0, y: 0, z: 0, radius: 3 }],
      spawns: { attack: [{ x: -8, y: 0, z: 0 }], defend: [{ x: 8, y: 0, z: 0 }] },
    },
  };
  game.tactics = new BombTactics(game);
  return game;
}

const worker = (game) => game.actors.find((a) => game.tactics.getTask(a)?.interact === 'defuse');

test('拆包按实际绕墙路程选人；距离最近但未操作的玩家不占用任务', () => {
  const g = fixture();
  const [human, near, far] = g.actors;
  assert.ok(near.pos.length() < far.pos.length());
  assert.ok(routeLength(g.nav, near.pos, g.bomb.bomb.position) > routeLength(g.nav, far.pos, g.bomb.bomb.position));
  assert.equal(worker(g), far);
  assert.notEqual(worker(g), human);
});

test('负责人保持到死亡；队友后来走近不抢任务', () => {
  const g = fixture();
  const owner = worker(g);
  g.actors[1].pos.set(0.2, 0, 0);
  g.time += 1;
  assert.equal(worker(g), owner);
  owner.alive = false;
  assert.equal(worker(g), g.actors[1]);
});

test('不可达机器人不领取拆包，负责人阻塞后交给下一位且不会立即抢回', () => {
  const g = fixture();
  const owner = worker(g);
  const task = g.tactics.getTask(owner);
  g.tactics.reportBlocked(owner, task);
  assert.equal(worker(g), g.actors[1]);
  g.time += 1;
  assert.equal(worker(g), g.actors[1]);
  g.actors[1].alive = false;
  assert.equal(worker(g), undefined);
  g.time += 4;
  assert.equal(worker(g), owner);

  const isolated = fixture();
  isolated.actors[2].pos.set(100, 0, 0);
  assert.equal(worker(isolated), isolated.actors[1]);
});

test('玩家正在拆包时机器人留出任务，玩家松开后原负责人恢复', () => {
  const g = fixture();
  const owner = worker(g);
  g.bomb.interactions.set(0, { kind: 'defuse', completeAt: 15 });
  assert.ok(g.actors.filter((a) => !a.isPlayer).every((a) => g.tactics.getTask(a)?.interact !== 'defuse'));
  g.bomb.interactions.clear();
  assert.equal(worker(g), owner);
});

test('换回合清理旧负责人和阻塞冷却', () => {
  const g = fixture();
  const owner = worker(g);
  g.tactics.reportBlocked(owner, g.tactics.getTask(owner));
  assert.notEqual(worker(g), owner);
  g.bomb.round++;
  assert.equal(worker(g), owner);
});

test('测试场双方守点与掩护位置可达、彼此分开、避开安包中心并有观察方向', () => {
  const g = fixture();
  g.world = new World();
  g.map = buildBombMap(new THREE.Group(), null, g.world);
  g.nav = new NavGrid(g.world, ...g.map.navBounds, 0.5, 0.42);
  g.bomb.phase = 'live';
  g.bomb.bomb.state = 'carried';
  g.bomb.carrierId = 0;
  g.actors = ['BL', 'GR'].flatMap((team, t) => Array.from({ length: 5 }, (_, i) => actor(t * 5 + i, team, t ? 22 : -22, (i - 2) * 2, !t && !i)));
  const tasks = g.actors.map((a) => [a, g.tactics.getTask(a)]).filter(([, task]) => !task.interact);
  for (const [a, task] of tasks) {
    assert.ok(Number.isFinite(routeLength(g.nav, a.pos, task.goal)));
    assert.equal(g.world.blocked(task.goal.x, 0.05, task.goal.z, 0.4, 1.75), false);
    assert.ok(Math.hypot(task.goal.x - task.lookAt.x, task.goal.z - task.lookAt.z) > 2);
    assert.ok(g.map.sites.every((site) => Math.hypot(site.x - task.goal.x, site.z - task.goal.z) > 2));
  }
  for (let i = 0; i < tasks.length; i++) for (let j = i + 1; j < tasks.length; j++) {
    if (tasks[i][0].team !== tasks[j][0].team) continue;
    assert.ok(Math.hypot(tasks[i][1].goal.x - tasks[j][1].goal.x, tasks[i][1].goal.z - tasks[j][1].goal.z) >= 1.6);
  }
  g.map.dispose();
});

test('公共任务不读取隐藏敌人的坐标', () => {
  const g = fixture();
  Object.defineProperty(g.actors[3], 'pos', { get() { throw new Error('读取了隐藏敌人位置'); } });
  assert.equal(g.tactics.getTask(g.actors[2]).interact, 'defuse');
  assert.ok(g.tactics.getTask(g.actors[1]).lookAt);
});

test('己方守点不会根据敌方尚未执行的站位计划改变', () => {
  const first = fixture(), second = fixture();
  first.actors[0].isPlayer = false;
  second.actors[0].isPlayer = false;
  first.actors[0].pos.set(-8, 0, 0);
  second.actors[0].pos.set(-8, 0, 0);
  // 让远处的2号先领拆包任务，其余队友分配守点。
  first.tactics.getTask(first.actors[2]);
  second.tactics.getTask(second.actors[2]);
  second.tactics.getTask(second.actors[3]);
  assert.deepEqual(first.tactics.getTask(first.actors[0]), second.tactics.getTask(second.actors[0]));
});

test('C4贴近障碍时，选择附近可站立且未穿墙的交互点', () => {
  const g = fixture();
  g.bomb.bomb.position.x = 1.7;
  const task = g.tactics.getTask(worker(g));
  assert.equal(task.interact, 'defuse');
  assert.ok(g.nav.walkable(g.nav.idx(task.goal.x, task.goal.z)));
  assert.equal(g.world.blocked(task.goal.x, 0.05, task.goal.z, 0.4, 1.75), false);
  assert.ok(Math.hypot(task.goal.x - 1.7, task.goal.z) <= 0.65 + 1e-9);
});

test('有近距离可见威胁时先交火，失去视野后短暂确认安全再安拆', () => {
  const g = fixture(), bot = g.actors[2];
  bot.visible = true;
  bot.target = g.actors[3];
  bot.canSee = () => true;
  const task = { interact: 'defuse', urgent: false };
  assert.equal(shouldCommitObjective(g, bot, task), false);
  bot.canSee = () => false;
  g.time += 0.4;
  assert.equal(shouldCommitObjective(g, bot, task), false);
  g.time += 0.5;
  assert.equal(shouldCommitObjective(g, bot, task), true);
});

test('真实 Game 在机器人离开交互中心时仍刷新安全观察期', () => {
  const g = fixture(), bot = g.actors[2];
  bot.visible = true;
  bot.target = g.actors[3];
  bot.canSee = () => true;
  g.getBombTask = (a) => g.tactics.getTask(a);
  g.shouldBotInteract = (a, task) => shouldCommitObjective(g, a, task);
  g.updateObjective = () => {};
  Game.prototype.updateBotObjective.call(g, bot);
  assert.equal(bot.objectiveHeld, false);
  assert.equal(bot.objectiveSafeAfter, g.time + 0.8);
  bot.pos.set(0, 0, 0);
  bot.canSee = () => false;
  g.time += 0.4;
  Game.prototype.updateBotObjective.call(g, bot);
  assert.equal(bot.objectiveHeld, false);
  g.time += 0.5;
  Game.prototype.updateBotObjective.call(g, bot);
  assert.equal(bot.objectiveHeld, true);
});

test('紧迫截止和即将完成的安拆不会被持续目击反复取消', () => {
  const g = fixture(), bot = g.actors[2];
  bot.visible = true;
  bot.target = g.actors[3];
  bot.canSee = () => true;
  assert.equal(shouldCommitObjective(g, bot, { interact: 'defuse', urgent: true }), true);
  g.bomb.interactions.set(bot.id, { kind: 'defuse', completeAt: g.time + 1 });
  assert.equal(shouldCommitObjective(g, bot, { interact: 'defuse', urgent: false }), true);
});

test('时间压力考虑剩余路径和安拆用时；不依赖渲染帧数', () => {
  const g = fixture(), bot = worker(g);
  const task = g.tactics.getTask(bot);
  bot.goal = [task.goal.x, task.goal.z];
  bot.path = [[0, 5], [-6, 5], [-6, 0], [task.goal.x, task.goal.z]];
  bot.pi = 1;
  g.bomb.deadline = g.time + 10;
  assert.equal(g.tactics.getTask(bot).urgent, true);
  g.bomb.deadline = g.time + 20;
  assert.equal(g.tactics.getTask(bot).urgent, false);
  bot.alive = false;
  assert.equal(shouldCommitObjective(g, bot, { interact: 'defuse', urgent: true }), false);
});
