import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Bot, DIFF } from '../src/bots.js';
import { WeaponState } from '../src/weapons.js';

// 行为测试不创建渲染器；使用真实武器状态和机器人行为方法，地图碰撞由场景夹具提供。
function fixture() {
  const interactions = new Set();
  const game = {
    mode: 'bomb',
    time: 2,
    actors: [],
    bomb: { carrierId: null },
    world: { blocked: () => false },
    nav: { lineFree: () => true, findPath: (x, z, gx, gz) => [[x, z], [gx, gz]] },
    getBombTask: () => ({ goal: { x: 10, y: 0, z: 0 }, lookAt: { x: -10, y: 1.5, z: 0 } }),
    isInteracting: (actor) => interactions.has(actor.id),
    shouldBotInteract: () => true,
    canFight: () => true,
    updateBotObjective() {},
  };
  const bot = Object.assign(Object.create(Bot.prototype), {
    game,
    id: 2,
    team: 'BL',
    pos: new THREE.Vector3(),
    vel: new THREE.Vector3(),
    radius: 0.36,
    height: 1.8,
    inv: [new WeaponState('ak47'), new WeaponState('deagle'), new WeaponState('knife'), new WeaponState('he')],
    slot: 0,
    readyAt: 0,
    alive: true,
    visible: true,
    target: { alive: true, pos: new THREE.Vector3(4, 0, 0) },
    lastSeenT: 2,
    pendingThrow: 0,
    nadePlan: null,
    c4Selected: false,
    ammoFallback: false,
    ammoSwitchUntil: 0,
    objectiveTask: null,
    objectiveKey: null,
    objectivePathT: -99,
    navFailureSince: -1,
    blockedReportT: -99,
    goal: null,
    path: null,
    pi: 0,
    yieldUntil: 0,
    yieldWish: null,
  });
  game.actors = [bot];
  return { bot, game, interactions };
}

test('近距接敌且主枪空弹时切到有弹副枪，并保留切换冷却', () => {
  const { bot } = fixture();
  bot.inv[0].mag = 0;
  bot.inv[0].reloadUntil = 4.45;
  assert.deepEqual(bot.ammoDecision(2), { sw: 1, reload: false });
  assert.equal(bot.ammoFallback, true);
  assert.ok(bot.ammoSwitchUntil > 3);
  bot.slot = 1;
  bot.inv[0].reloadUntil = 0; // Actor 切枪会中断原枪换弹。
  bot.visible = false;
  bot.lastSeenT = 0;
  assert.equal(bot.ammoDecision(2.5), null);
});

test('脱离接敌后恢复仍可补给的主枪，不在两把枪之间反复切换', () => {
  const { bot } = fixture();
  bot.slot = 1;
  bot.ammoFallback = true;
  bot.inv[0].mag = 0;
  bot.visible = false;
  bot.lastSeenT = 0;
  assert.deepEqual(bot.ammoDecision(3), { sw: 0, reload: false });
  bot.slot = 0;
  assert.deepEqual(bot.ammoDecision(3.1), { sw: null, reload: true });
  assert.equal(bot.ammoFallback, false);
});

test('主枪完全没弹时继续使用副枪，不脱战切回无法补给的主枪', () => {
  const { bot } = fixture();
  bot.inv[0].mag = 0;
  bot.inv[0].reserve = 0;
  assert.equal(bot.ammoDecision(2).sw, 1);
  bot.slot = 1;
  bot.visible = false;
  bot.lastSeenT = 0;
  assert.equal(bot.ammoDecision(4), null);
  bot.inv[1].mag = 0;
  assert.deepEqual(bot.ammoDecision(4), { sw: null, reload: true });
});

test('远距离接敌或即将换弹完成时保持换弹，不徒劳切副枪', () => {
  const { bot } = fixture();
  bot.inv[0].mag = 0;
  bot.target.pos.set(30, 0, 0);
  assert.deepEqual(bot.ammoDecision(2), { sw: null, reload: true });
  bot.target.pos.set(4, 0, 0);
  bot.inv[0].reloadUntil = 2.1;
  assert.deepEqual(bot.ammoDecision(2), { sw: null, reload: false });
});

test('安拆期间禁止应急切枪，也禁止副枪空弹时改变交互姿态', () => {
  const { bot, interactions } = fixture();
  bot.inv[0].mag = 0;
  interactions.add(bot.id);
  assert.equal(bot.ammoDecision(2), null);
  let command;
  bot.weaponUpdate = (dt, input) => { command = input; };
  bot.pendingThrow = 0.4;
  bot.reScope = 1;
  bot.clearObjectiveActions(0.025);
  assert.deepEqual(command, { fire: false, firePressed: false, alt: false, altPressed: false, reload: false, sw: null });
  assert.equal(bot.pendingThrow, 0);
  assert.equal(bot.reScope, 0);
});

test('守点看任务入口并有限巡视，行进视角不偏离路径超过约定角度', () => {
  const { bot } = fixture();
  bot.objectiveTask = { lookAt: { x: -10, z: 0 } };
  for (const now of [0, 1, 4, 9]) assert.ok(Math.abs(bot.bombLookYaw(now) - Math.PI / 2) <= 0.28);
  assert.equal(bot.bombLookYaw(0, 0), 0.65);
  bot.objectiveTask = { interact: 'defuse', lookAt: { x: -10, z: 0 } };
  assert.equal(bot.bombLookYaw(4), Math.PI / 2);
});

test('普通队友相遇只由低优先级一方让行，避免双方同时左右摆动', () => {
  const { bot, game } = fixture();
  const friend = { id: 1, team: 'BL', alive: true, pos: new THREE.Vector3(0.9, 0, 0) };
  game.actors.push(friend);
  const wish = bot.avoidTeammates(1, 0);
  assert.ok(Math.abs(wish[1]) > 0.4);
  assert.ok(wish[0] < 0.5);
  const repeated = bot.avoidTeammates(1, 0);
  assert.deepEqual(repeated, wish);
  bot.id = 0;
  bot.yieldUntil = 0;
  assert.deepEqual(bot.avoidTeammates(1, 0), [1, 0]);
});

test('提前离开队友安拆空间，遇到墙时不发出穿墙侧移', () => {
  const { bot, game, interactions } = fixture();
  const friend = { id: 1, team: 'BL', alive: true, pos: new THREE.Vector3(0.9, 0, 0) };
  game.actors.push(friend);
  interactions.add(friend.id);
  assert.deepEqual(bot.avoidTeammates(1, 0), [-1, 0]);
  game.world.blocked = () => true;
  assert.deepEqual(bot.avoidTeammates(1, 0), [0, 0]);
});

test('局部让行不查询或追踪敌人位置', () => {
  const { bot, game } = fixture();
  game.actors.push({ id: 1, team: 'GR', alive: true, get pos() { throw new Error('不应读取敌人位置'); } });
  assert.deepEqual(bot.avoidTeammates(1, 0), [1, 0]);
});

test('无有效路径持续阻塞时报告任务层，报告有冷却', () => {
  const { bot, game } = fixture();
  let reports = 0;
  game.nav.findPath = () => null;
  game.reportBombTaskBlocked = () => reports++;
  bot.pickBombGoal();
  game.time = 3.1;
  bot.pickBombGoal();
  assert.equal(reports, 1);
  game.time = 3.2;
  bot.pickBombGoal();
  assert.equal(reports, 1);
  game.time = 5.2;
  bot.pickBombGoal();
  assert.equal(reports, 2);
});

test('安拆判断先使用当前思考周期的可见性，冷却更新不触发战斗', () => {
  const { bot, game, interactions } = fixture();
  const order = [];
  bot.thinkT = 0;
  bot.visible = false;
  bot.think = () => { order.push('think'); bot.visible = true; };
  game.updateBotObjective = (actor) => {
    order.push('objective');
    assert.equal(actor.visible, true);
    interactions.add(actor.id);
  };
  bot.move = () => order.push('move');
  bot.weaponUpdate = (dt, input) => { order.push('weapon'); assert.equal(input.fire, false); assert.equal(input.sw, null); };
  bot.update(0.025);
  assert.deepEqual(order, ['think', 'objective', 'weapon', 'move']);
});

function updatingFixture(interact = 'plant', urgent = true) {
  const state = fixture();
  const { bot, game } = state;
  const task = { goal: { x: 10, y: 0, z: 0 }, interact, urgent };
  game.getBombTask = () => task;
  Object.assign(bot, {
    diff: DIFF.normal,
    yaw: 0,
    pitch: 0,
    punchP: 0,
    errY: 0,
    errP: 0,
    aimHead: false,
    reactUntil: 0,
    burst: 0,
    burstPauseUntil: 0,
    strafeT: 5,
    strafeDir: 1,
    thinkT: 1,
    role: 'bomb',
    stage: 0,
    crouchUntil: 20,
    wantJump: true,
    wantScope: false,
    scoped: 0,
    scopeReady: false,
    reScope: 0,
    autoSwitchAt: 0,
    onGround: true,
    fireHeld: false,
    heardT: -99,
    lastHurt: -99,
    objectiveTask: task,
    goal: [10, 0],
    // 下一路点先向北绕路，故意不等于目标和当前目击敌人的方向。
    path: [[0, 0], [0, 4], [10, 4], [10, 0]],
    pi: 1,
  });
  bot.target = {
    alive: true,
    pos: new THREE.Vector3(0, 0, -8),
    vel: new THREE.Vector3(),
    speed: 0,
    soldier: {
      headWorld: (v) => v.set(0, 1.5, -8),
      chestWorld: (v) => v.set(0, 1.5, -8),
    },
  };
  bot.eye = (v) => v.set(bot.pos.x, 1.5, bot.pos.z);
  bot.move = (dt, x, z, jump, crouch, walk) => { state.movement = { x, z, jump, crouch, walk }; };
  bot.weaponUpdate = (dt, input) => { state.command = input; };
  return state;
}

test('紧迫安包和拆包遇敌时仍沿下一路点赶路，可继续射击目击目标', () => {
  for (const interact of ['plant', 'defuse']) {
    const state = updatingFixture(interact);
    state.bot.nadePlan = new THREE.Vector3(0, 0, -8);
    state.bot.update(0.025);
    assert.deepEqual(state.movement, { x: 0, z: 1, jump: false, crouch: false, walk: false });
    assert.equal(state.bot.nadePlan, null);
    assert.equal(state.command.fire, true);
    assert.equal(state.bot.pi, 1);
  }
});

test('紧迫任务下狙击手收镜前进，取消计划投雷后不重新拉雷', () => {
  const sniper = updatingFixture('defuse');
  sniper.bot.inv[0] = new WeaponState('awm');
  sniper.bot.scoped = 1;
  sniper.bot.scopeReady = true;
  sniper.bot.wantScope = true;
  sniper.bot.reScope = 1;
  sniper.bot.update(0.025);
  assert.deepEqual(sniper.movement, { x: 0, z: 1, jump: false, crouch: false, walk: false });
  assert.equal(sniper.bot.scoped, 0);
  assert.equal(sniper.bot.reScope, 0);
  assert.equal(sniper.command.alt, false);

  const grenade = updatingFixture();
  grenade.bot.slot = 3;
  grenade.bot.nadePlan = new THREE.Vector3(0, 0, -8);
  grenade.bot.update(0.025);
  assert.deepEqual(grenade.movement, { x: 0, z: 1, jump: false, crouch: false, walk: false });
  assert.equal(grenade.command.sw, 0);
  assert.equal(grenade.command.firePressed, false);
  assert.equal(grenade.bot.nadePlan, null);
  assert.equal(grenade.bot.pendingThrow, 0);
});

test('紧迫任务抵达后使用统一安拆判断，并保持站定不射击', () => {
  const state = updatingFixture('defuse');
  state.bot.pos.set(10, 0, 0);
  let decisions = 0;
  state.game.shouldBotInteract = (actor, task) => {
    decisions++;
    assert.equal(actor, state.bot);
    assert.equal(task.interact, 'defuse');
    return true;
  };
  state.bot.update(0.025);
  assert.equal(decisions, 1);
  assert.deepEqual(state.movement, { x: 0, z: 0, jump: false, crouch: false, walk: false });
  assert.equal(state.command.fire, false);
  assert.equal(state.command.sw, null);
});

test('非紧迫任务及运输船接敌保留战斗横移，不受任务字段影响', () => {
  for (const mode of ['bomb', 'team']) {
    const state = updatingFixture('plant', mode === 'team');
    state.game.mode = mode;
    state.bot.update(0.025);
    assert.equal(state.movement.x, DIFF.normal.strafe);
    assert.equal(Math.abs(state.movement.z), 0);
    assert.equal(state.movement.crouch, true);
  }
});

test('目击尚未运动或无效速度的角色时，真实瞄准更新不产生 NaN', () => {
  for (const speed of [undefined, NaN]) {
    const state = updatingFixture('plant', false);
    state.bot.target.speed = speed;
    state.bot.update(0.025);
    assert.ok(Number.isFinite(state.bot.yaw));
    assert.ok(Number.isFinite(state.bot.pitch));
    assert.ok(Number.isFinite(state.movement.x));
    assert.ok(Number.isFinite(state.movement.z));
  }
});
