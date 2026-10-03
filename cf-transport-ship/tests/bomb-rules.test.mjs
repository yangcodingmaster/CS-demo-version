// 纯规则验证，无 DOM、Three.js、墙上时钟或随机数依赖。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BombRules, BOMB_DEFAULTS } from '../src/bomb-rules.js';

const position = { x: 1, y: 0, z: 2 };
const roster = () => [
  { id: 0, team: 'BL', alive: true, isPlayer: true },
  { id: 1, team: 'BL', alive: true, isPlayer: false },
  { id: 2, team: 'GR', alive: true, isPlayer: false },
  { id: 3, team: 'GR', alive: true, isPlayer: false },
];
const killTeam = (actors, team) => {
  for (const actor of actors) if (actor.team === team) actor.alive = false;
};
const revive = (actors) => { for (const actor of actors) actor.alive = true; };
const roundResults = (events) => events.filter((event) => event.type === 'round-result');

function live(options = {}) {
  const actors = roster();
  const rules = new BombRules(options);
  rules.beginRound(rules.now, actors);
  rules.drainEvents();
  rules.advance(rules.deadline, actors);
  rules.drainEvents();
  return { rules, actors };
}

function planted(options = {}) {
  const ctx = live(options);
  const startAt = ctx.rules.now + 2;
  assert.equal(ctx.rules.beginInteraction(0, 'plant', startAt, { siteId: 'A', position }), true);
  ctx.rules.advance(startAt + ctx.rules.config.plantSeconds, ctx.actors);
  assert.equal(ctx.rules.phase, 'planted');
  ctx.rules.drainEvents();
  return ctx;
}

function finishRound(rules, actors, winner) {
  killTeam(actors, winner === 'BL' ? 'GR' : 'BL');
  rules.advance(rules.now + 0.25, actors);
  assert.equal(rules.phase, 'result');
  const result = roundResults(rules.drainEvents());
  assert.equal(result.length, 1);
  assert.equal(result[0].winner, winner);
  rules.advance(rules.deadline, actors);
  const events = rules.drainEvents();
  if (rules.phase === 'preparation') {
    revive(actors);
    assert.equal(rules.beginRound(rules.now, actors), true);
    assert.deepEqual(rules.drainEvents(), [], '下一回合 beginRound 不重复发 round-start');
    rules.advance(rules.deadline, actors);
    rules.drainEvents();
  }
  return events;
}

test('默认配置逐字段与设计参数一致，传入覆盖值保留在 config', () => {
  const data = JSON.parse(readFileSync(new URL('../docs/design-data.json', import.meta.url), 'utf8'));
  assert.deepEqual(BOMB_DEFAULTS, data.bombDefaults);
  assert.equal(Object.isFrozen(BOMB_DEFAULTS), true);
  const rules = new BombRules({ now: 12, preparationSeconds: 6, bombSeconds: 25 });
  assert.equal(rules.config.preparationSeconds, 6);
  assert.equal(rules.config.bombSeconds, 25);
  assert.equal(rules.config.roundSeconds, 90);
  assert.equal(Object.isFrozen(rules.config), true);
  assert.equal(rules.deadline, 18);
});

test('构造为准备状态，beginRound 优先存活人类，再按 ID 选携包者', () => {
  const rules = new BombRules();
  assert.equal(rules.phase, 'preparation');
  assert.equal(rules.round, 1);
  assert.equal(rules.attackTeam, 'BL');
  assert.equal(rules.defendTeam, 'GR');
  assert.equal(rules.carrierId, null);
  assert.deepEqual(rules.score, { BL: 0, GR: 0 });
  const actors = [
    { id: 1, team: 'BL', alive: false, isPlayer: true },
    { id: 10, team: 'BL', alive: true, isPlayer: true },
    { id: 5, team: 'BL', alive: true, isPlayer: true },
    { id: 2, team: 'BL', alive: true },
    { id: 0, team: 'GR', alive: true, isPlayer: true },
  ];
  assert.equal(rules.beginRound(0, actors), true);
  assert.equal(rules.carrierId, 5);
  assert.deepEqual(rules.bomb, { state: 'carried', position: null, siteId: null });
  const events = rules.drainEvents();
  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'round-start');
  assert.equal(rules.beginRound(1, actors), false, '重复开始不能刷新准备时间');
  assert.equal(rules.deadline, 8);
  assert.equal(rules.carrierId, 5);
  assert.deepEqual(rules.drainEvents(), []);

  actors[1].alive = actors[2].alive = false;
  const botsOnly = new BombRules();
  botsOnly.beginRound(0, actors);
  assert.equal(botsOnly.carrierId, 2);
});

test('准备期不判全灭、不接受安拆和拾取，准确在 8 秒转入 live', () => {
  const actors = roster();
  const rules = new BombRules();
  rules.beginRound(0, actors);
  rules.drainEvents();
  killTeam(actors, 'BL');
  killTeam(actors, 'GR');
  assert.equal(rules.beginInteraction(0, 'plant', 0, { siteId: 'A', position }), false);
  assert.equal(rules.dropCarrier(0, position), false);
  assert.equal(rules.pickup(1, actors), false);
  rules.advance(7.999, actors);
  assert.equal(rules.phase, 'preparation');
  assert.deepEqual(rules.score, { BL: 0, GR: 0 });
  revive(actors);
  rules.advance(8, actors);
  assert.equal(rules.phase, 'live');
  assert.equal(rules.active, true);
  assert.equal(rules.deadline, 98);
  assert.equal(rules.nextEventTime(), 98);
  assert.deepEqual(rules.drainEvents().map((event) => event.type), ['round-live']);
});

for (const [label, killed, winner, reason] of [
  ['未安包攻方全灭', ['BL'], 'GR', 'attackers-eliminated'],
  ['未安包守方全灭', ['GR'], 'BL', 'defenders-eliminated'],
  ['未安包双方全灭', ['BL', 'GR'], 'GR', 'both-eliminated'],
]) {
  test(`${label}：用整批快照判胜，重复 advance 只计分一次`, () => {
    const { rules, actors } = live();
    for (const team of killed) killTeam(actors, team);
    rules.advance(9, actors);
    assert.equal(rules.phase, 'result');
    assert.equal(rules.deadline, 13);
    assert.deepEqual(roundResults(rules.drainEvents()), [{ type: 'round-result', winner, reason, round: 1, at: 9 }]);
    rules.advance(9, actors);
    rules.advance(12.999, actors);
    assert.equal(rules.score[winner], 1);
    assert.equal(rules.score[winner === 'BL' ? 'GR' : 'BL'], 0);
    assert.deepEqual(rules.drainEvents(), []);
    assert.equal(rules.beginInteraction(0, 'plant', rules.now, { siteId: 'A', position }), false);
    assert.equal(rules.dropCarrier(0, position), false);
    assert.equal(rules.pickup(1, actors), false);
  });
}

test('未安包 90 秒截止：截止前继续，精确截止优先于同刻守方全灭', () => {
  const { rules, actors } = live();
  rules.advance(97.999, actors);
  assert.equal(rules.phase, 'live');
  killTeam(actors, 'GR');
  rules.advance(98, actors);
  assert.equal(rules.phase, 'result');
  assert.equal(roundResults(rules.drainEvents())[0].reason, 'round-timeout');
  assert.equal(rules.score.GR, 1);
});

test('同种交互连续调用不重置，取消后从零开始，进度限制在 0..1', () => {
  const { rules } = live();
  assert.equal(rules.beginInteraction(0, 'plant', 10, { siteId: 'A', position }), true);
  assert.equal(rules.nextEventTime(), 13);
  assert.equal(rules.beginInteraction(0, 'plant', 11, { siteId: 'A', position }), true);
  assert.deepEqual(rules.interactions.get(0), { kind: 'plant', startAt: 10, completeAt: 13, siteId: 'A', position });
  assert.equal(rules.interactionProgress(0, 9), 0);
  assert.equal(rules.interactionProgress(0, 11.5), 0.5);
  assert.equal(rules.interactionProgress(0, 20), 1);
  assert.equal(rules.interactionProgress(0, NaN), 0);
  assert.equal(rules.cancelInteraction(0), true);
  assert.equal(rules.cancelInteraction(0), false);
  assert.equal(rules.interactionProgress(0, 11.5), 0);
  assert.equal(rules.nextEventTime(), 98);
  assert.equal(rules.beginInteraction(0, 'plant', 12, { siteId: 'B', position }), true);
  assert.equal(rules.interactions.get(0).completeAt, 15);
});

test('只有活的携包攻方能安包，只有活守方能拆包，坏位置不进入交互', () => {
  const { rules, actors } = live();
  assert.equal(rules.beginInteraction(1, 'plant', 9, { siteId: 'A', position }), false);
  assert.equal(rules.beginInteraction(2, 'plant', 9, { siteId: 'A', position }), false);
  assert.equal(rules.beginInteraction(0, 'plant', 9, { position }), false);
  assert.equal(rules.beginInteraction(0, 'plant', 9, { siteId: 'A', position: { ...position, x: Infinity } }), false);
  assert.equal(rules.beginInteraction(0, 'other', 9), false);
  assert.equal(rules.beginInteraction(2, 'defuse', 9), false);
  rules.beginInteraction(0, 'plant', 9, { siteId: 'B', position });
  rules.advance(12, actors);
  assert.equal(rules.beginInteraction(0, 'defuse', 12), false);
  assert.equal(rules.beginInteraction(99, 'defuse', 12), false);
  assert.equal(rules.beginInteraction(2, 'defuse', 12), true);
  actors[3].alive = false;
  rules.advance(12, actors);
  assert.equal(rules.beginInteraction(3, 'defuse', 12), false);
});

test('安包完成转换为 40 秒炸弹计时，任务位置不引用调用方对象', () => {
  const { rules, actors } = live();
  const inputPosition = { ...position };
  assert.equal(rules.beginInteraction(0, 'plant', 10, { siteId: 'A', position: inputPosition }), true);
  inputPosition.x = 999;
  rules.advance(13, actors);
  assert.equal(rules.phase, 'planted');
  assert.equal(rules.carrierId, null);
  assert.equal(rules.bomb.state, 'planted');
  assert.equal(rules.bomb.siteId, 'A');
  assert.deepEqual(rules.bomb.position, position);
  assert.equal(rules.deadline, 53);
  assert.equal(rules.interactions.size, 0);
  const events = rules.drainEvents();
  assert.deepEqual(events.map((event) => event.type), ['bomb-planted']);
  assert.equal(events[0].at, 13);
  events[0].position.x = -100;
  assert.equal(rules.bomb.position.x, 1, '事件对象也不能改动任务位置');
});

test('安包严格早于截止有效；跨过原截止也按完成时间先提交', () => {
  const { rules, actors } = live();
  rules.beginInteraction(0, 'plant', 94.5, { siteId: 'A', position });
  rules.advance(98, actors);
  assert.equal(rules.phase, 'planted');
  assert.equal(rules.deadline, 137.5);
  assert.equal(rules.drainEvents()[0].at, 97.5);
  assert.deepEqual(rules.score, { BL: 0, GR: 0 });
});

test('安包完成恰好等于回合截止无效，不能从截止时新开交互', () => {
  const { rules, actors } = live();
  rules.beginInteraction(0, 'plant', 95, { siteId: 'A', position });
  assert.equal(rules.nextEventTime(), 98);
  assert.equal(rules.beginInteraction(0, 'plant', 98, { siteId: 'A', position }), false);
  rules.advance(98, actors);
  assert.equal(rules.bomb.state, 'carried');
  assert.deepEqual(rules.drainEvents().map((event) => event.type), ['round-result']);
  assert.equal(rules.score.GR, 1);
});

test('携包者完成同刻死亡不能安包；掉包同时清掉交互', () => {
  const { rules, actors } = live();
  rules.beginInteraction(0, 'plant', 10, { siteId: 'A', position });
  actors[0].alive = false;
  rules.advance(13, actors);
  assert.equal(rules.phase, 'live', '另一名攻方还活着');
  assert.equal(rules.bomb.state, 'carried');
  assert.equal(rules.interactions.size, 0);
  assert.deepEqual(rules.drainEvents(), []);

  const other = live();
  other.rules.beginInteraction(0, 'plant', 10, { siteId: 'A', position });
  other.actors[0].alive = false;
  assert.equal(other.rules.dropCarrier(0, position), true);
  other.rules.advance(13, other.actors);
  assert.equal(other.rules.bomb.state, 'dropped');
  assert.equal(other.rules.carrierId, null);
  assert.equal(other.rules.interactions.size, 0);
});

test('安包完成同刻双方全灭先判交互者死亡，按未安包双方全灭归守方', () => {
  const { rules, actors } = live();
  rules.beginInteraction(0, 'plant', 10, { siteId: 'A', position });
  killTeam(actors, 'BL');
  killTeam(actors, 'GR');
  rules.advance(13, actors);
  const events = rules.drainEvents();
  assert.deepEqual(events.map((event) => event.type), ['round-result']);
  assert.equal(events[0].winner, 'GR');
  assert.equal(events[0].reason, 'both-eliminated');
});

test('按 nextEventTime 分段：先完成安包，随后攻方全灭仍继续炸弹计时', () => {
  const { rules, actors } = live();
  rules.beginInteraction(0, 'plant', 10, { siteId: 'A', position });
  assert.equal(rules.nextEventTime(), 13);
  rules.advance(rules.nextEventTime(), actors);
  assert.equal(rules.phase, 'planted');
  killTeam(actors, 'BL');
  rules.advance(13.25, actors);
  assert.equal(rules.phase, 'planted');
  assert.equal(rules.deadline, 53);
  assert.deepEqual(rules.score, { BL: 0, GR: 0 });
  rules.advance(53, actors);
  const events = rules.drainEvents();
  assert.deepEqual(events.map((event) => event.type), ['bomb-planted', 'bomb-exploded', 'round-result']);
  assert.equal(events[2].winner, 'BL');
});

for (const [label, killed, winner] of [
  ['已安包守方全灭', ['GR'], 'BL'],
  ['已安包双方全灭', ['GR', 'BL'], 'BL'],
]) {
  test(`${label}由攻方获胜，不要求炸弹先爆炸`, () => {
    const { rules, actors } = planted();
    for (const team of killed) killTeam(actors, team);
    rules.advance(14, actors);
    assert.equal(rules.phase, 'result');
    assert.equal(roundResults(rules.drainEvents())[0].winner, winner);
    assert.equal(rules.bomb.state, 'planted');
  });
}

test('40 秒精确爆炸，爆炸和回合结算事件仅一次', () => {
  const { rules, actors } = planted();
  rules.advance(52.999, actors);
  assert.equal(rules.phase, 'planted');
  rules.advance(53, actors);
  assert.equal(rules.phase, 'result');
  assert.equal(rules.bomb.state, 'exploded');
  const events = rules.drainEvents();
  assert.deepEqual(events.map((event) => event.type), ['bomb-exploded', 'round-result']);
  assert.equal(events[0].at, 53);
  assert.equal(events[1].reason, 'bomb-exploded');
  rules.advance(53, actors);
  assert.deepEqual(rules.drainEvents(), []);
  assert.equal(rules.score.BL, 1);
});

test('5 秒拆除严格早于爆炸有效，跨截止更新也按完成时间结算', () => {
  const { rules, actors } = planted();
  rules.beginInteraction(2, 'defuse', 47.5);
  assert.equal(rules.nextEventTime(), 52.5);
  rules.advance(53, actors);
  assert.equal(rules.phase, 'result');
  assert.equal(rules.bomb.state, 'defused');
  assert.equal(rules.deadline, 56.5);
  const events = rules.drainEvents();
  assert.deepEqual(events.map((event) => event.type), ['bomb-defused', 'round-result']);
  assert.equal(events[0].at, 52.5);
  assert.equal(events[1].winner, 'GR');
});

test('拆包与炸弹截止同刻，爆炸优先，不能从炸弹截止时开始拆包', () => {
  const { rules, actors } = planted();
  rules.beginInteraction(2, 'defuse', 48);
  assert.equal(rules.beginInteraction(3, 'defuse', 53), false);
  rules.advance(53, actors);
  assert.equal(rules.bomb.state, 'exploded');
  assert.deepEqual(rules.drainEvents().map((event) => event.type), ['bomb-exploded', 'round-result']);
  assert.equal(rules.score.BL, 1);
});

test('拆包者完成同刻死亡无效，其余守方仍可继续拆包', () => {
  const { rules, actors } = planted();
  rules.beginInteraction(2, 'defuse', 14);
  actors[2].alive = false;
  rules.advance(19, actors);
  assert.equal(rules.phase, 'planted');
  assert.equal(rules.bomb.state, 'planted');
  assert.equal(rules.interactions.size, 0);
  assert.deepEqual(rules.drainEvents(), []);
  rules.beginInteraction(3, 'defuse', 19);
  rules.advance(24, actors);
  assert.equal(rules.score.GR, 1);
  assert.equal(rules.bomb.state, 'defused');
});

test('非截止同刻先提交有效拆除，再判攻方全灭，保留拆除原因', () => {
  const { rules, actors } = planted();
  rules.beginInteraction(2, 'defuse', 14);
  killTeam(actors, 'BL');
  rules.advance(19, actors);
  const events = rules.drainEvents();
  assert.deepEqual(events.map((event) => event.type), ['bomb-defused', 'round-result']);
  assert.equal(events[1].reason, 'bomb-defused');
  assert.equal(rules.score.GR, 1);
});

test('多个守方同刻完成只拆除和计分一次，按 ID 保证事件确定', () => {
  const { rules, actors } = planted();
  rules.beginInteraction(3, 'defuse', 14);
  rules.beginInteraction(2, 'defuse', 14);
  rules.advance(19, actors);
  const events = rules.drainEvents();
  assert.deepEqual(events.map((event) => event.type), ['bomb-defused', 'round-result']);
  assert.equal(events[0].actorId, 2);
  assert.equal(rules.score.GR, 1);
  assert.equal(rules.interactions.size, 0);
});

test('掉落/拾取只允许活进攻者，取消旧交互，新携包者可以安包', () => {
  const { rules, actors } = live();
  rules.beginInteraction(0, 'plant', 10, { siteId: 'A', position });
  assert.equal(rules.dropCarrier(1, position), false);
  assert.equal(rules.dropCarrier(0, { x: NaN, y: 0, z: 0 }), false);
  const dropped = { ...position };
  assert.equal(rules.dropCarrier(0, dropped), true);
  dropped.z = 999;
  assert.deepEqual(rules.bomb.position, position);
  assert.equal(rules.dropCarrier(0, position), false);
  assert.equal(rules.interactions.size, 0);
  assert.equal(rules.pickup(2, actors), false);
  actors[0].alive = false;
  assert.equal(rules.pickup(0, actors), false);
  assert.equal(rules.pickup(99, actors), false);
  assert.equal(rules.pickup(1, actors), true);
  assert.equal(rules.carrierId, 1);
  assert.deepEqual(rules.bomb, { state: 'carried', position: null, siteId: null });
  assert.equal(rules.pickup(0, actors), false);
  assert.equal(rules.beginInteraction(0, 'plant', 11, { siteId: 'B', position }), false);
  assert.equal(rules.beginInteraction(1, 'plant', 11, { siteId: 'B', position }), true);
  rules.advance(14, actors);
  assert.equal(rules.phase, 'planted');
  assert.equal(rules.bomb.siteId, 'B');
});

test('完成第 4 回合后换边，队伍身份与累计比分保留，新回合重新选活携包者', () => {
  const { rules, actors } = live();
  for (let i = 1; i <= 4; i++) {
    assert.equal(rules.attackTeam, 'BL');
    const events = finishRound(rules, actors, i % 2 ? 'BL' : 'GR');
    assert.deepEqual(events.map((event) => event.type), ['round-start']);
    assert.equal(events[0].round, i + 1);
  }
  assert.equal(rules.round, 5);
  assert.equal(rules.attackTeam, 'GR');
  assert.equal(rules.defendTeam, 'BL');
  assert.equal(rules.carrierId, 2, '人类仍属于 BL，GR 存活机器人按 ID 获得 C4');
  assert.deepEqual(rules.score, { BL: 2, GR: 2 });
  assert.equal(actors[0].team, 'BL');

  killTeam(actors, 'BL');
  rules.advance(rules.now + 0.25, actors);
  assert.equal(roundResults(rules.drainEvents())[0].winner, 'GR', '换边后 GR 是攻方');
  rules.advance(rules.deadline, actors);
  rules.drainEvents();
  revive(actors);
  actors[2].alive = false;
  rules.beginRound(rules.now, actors);
  assert.equal(rules.carrierId, 3, '新回合不能选择已经死亡的旧携包者');
});

test('先 5 胜：结算 4 秒完成后比赛结束，match-result 可 drain 且不重复', () => {
  const { rules, actors } = live();
  for (let round = 1; round < 5; round++) finishRound(rules, actors, 'BL');
  killTeam(actors, 'GR');
  rules.advance(rules.now + 0.25, actors);
  assert.deepEqual(rules.score, { BL: 5, GR: 0 });
  assert.equal(rules.phase, 'result');
  const resultDeadline = rules.deadline;
  rules.drainEvents();
  rules.advance(resultDeadline - 0.001, actors);
  assert.equal(rules.phase, 'result');
  rules.advance(resultDeadline, actors);
  assert.equal(rules.phase, 'finished');
  assert.equal(rules.round, 5);
  assert.equal(rules.active, false);
  assert.equal(rules.nextEventTime(), Infinity);
  const events = rules.drainEvents();
  assert.deepEqual(events.map((event) => event.type), ['match-result']);
  assert.equal(events[0].winner, 'BL');
  assert.equal(events[0].reason, 'score-limit');
  assert.deepEqual(events[0].score, { BL: 5, GR: 0 });
  events[0].score.BL = 0;
  assert.equal(rules.score.BL, 5);
  rules.advance(resultDeadline + 100, actors);
  assert.deepEqual(rules.drainEvents(), []);
  assert.equal(rules.beginRound(rules.now, actors), false);
});

test('最多 8 回合，4:4 为平局，无第 9 回合或加时', () => {
  const { rules, actors } = live();
  let finalEvents;
  for (let round = 1; round <= 8; round++) finalEvents = finishRound(rules, actors, round % 2 ? 'BL' : 'GR');
  assert.equal(rules.phase, 'finished');
  assert.equal(rules.round, 8);
  assert.deepEqual(rules.score, { BL: 4, GR: 4 });
  assert.deepEqual(finalEvents.map((event) => event.type), ['match-result']);
  assert.equal(finalEvents[0].winner, null);
  assert.equal(finalEvents[0].reason, 'draw');
});

test('暂停不 advance：准备、炸弹、结算和交互仅随模拟秒变化', () => {
  const actors = roster();
  const prep = new BombRules();
  prep.beginRound(0, actors);
  const pausedPreparation = { phase: prep.phase, now: prep.now, deadline: prep.deadline };
  // 外部过了任意墙上时间，规则没有计时器；恢复时仍用原模拟时间。
  assert.deepEqual({ phase: prep.phase, now: prep.now, deadline: prep.deadline }, pausedPreparation);
  prep.advance(0, actors);
  assert.equal(prep.phase, 'preparation');

  const { rules } = planted();
  rules.beginInteraction(2, 'defuse', 13);
  const paused = { now: rules.now, deadline: rules.deadline, progress: rules.interactionProgress(2, rules.now) };
  assert.equal(paused.progress, 0);
  rules.advance(paused.now, actors);
  assert.equal(rules.phase, 'planted');
  assert.equal(rules.deadline, paused.deadline);
  assert.equal(rules.interactionProgress(2, rules.now), 0);
  rules.advance(18, actors);
  assert.equal(rules.phase, 'result');
  const resultDeadline = rules.deadline;
  rules.advance(18, actors);
  assert.equal(rules.deadline, resultDeadline);
  assert.equal(rules.phase, 'result');
});

test('配置和输入错误明确失败，不接受倒退时钟或未知选项', () => {
  for (const options of [
    { now: -1 },
    { now: NaN },
    { now: Infinity },
    { roundSeconds: 0 },
    { plantSeconds: -1 },
    { bombSeconds: Infinity },
    { maxRounds: 1.5 },
    { roundsToWin: 9 },
    { roundsBeforeSideSwap: 9 },
    { teamSize: 0 },
    { humanPlayers: 11 },
    { armorAtRoundStart: -1 },
    { overtime: true },
    { deadlineWinsExactTie: false },
    { roundSeconds: '90' },
    { unknown: true },
  ]) assert.throws(() => new BombRules(options), undefined, JSON.stringify(options));
  const { rules, actors } = live();
  assert.throws(() => rules.advance(7, actors), RangeError);
  assert.throws(() => rules.beginInteraction(0, 'plant', 7, { siteId: 'A', position }), RangeError);
  assert.throws(() => rules.advance(9, undefined), TypeError);
  assert.throws(() => rules.advance(9, [actors[0], actors[0]]), TypeError);
  assert.throws(() => rules.advance(9, [{ id: null, team: 'BL', alive: true }]), TypeError);
  assert.throws(() => rules.advance(9, [{ id: 0, team: 'BAD', alive: true }]), TypeError);
  assert.equal(rules.now, 8, '失败调用不改变时钟');
});
