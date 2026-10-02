// 爆破规则只使用模拟秒，不读取 Date、帧数、输入或场景。
// 集成方必须在 nextEventTime() 切分模拟步长；同刻先归并伤害、死亡和掉包，
// 再调用 advance()。移动、站立、距离、选中 C4 和视线由集成方校验并取消交互。
// 暂停时同时冻结模拟时钟，不调用 advance()；不能传入暂停期间的墙上时间。

export const BOMB_DEFAULTS = Object.freeze({
  status: 'project_design_defaults_not_original_cs_values',
  teamSize: 5,
  humanPlayers: 1,
  maxRounds: 8,
  roundsBeforeSideSwap: 4,
  roundsToWin: 5,
  drawAtRoundLimit: true,
  overtime: false,
  preparationSeconds: 8,
  roundSeconds: 90,
  bombSeconds: 40,
  plantSeconds: 3,
  defuseSeconds: 5,
  resultSeconds: 4,
  friendlyFire: false,
  selfGrenadeDamage: true,
  economy: false,
  weaponPickups: false,
  respawnWithinRound: false,
  healthAtRoundStart: 100,
  armorAtRoundStart: 100,
  protectionSecondsAfterPreparation: 0,
  interactionKey: 'KeyE',
  bombSlotKey: 'Digit5',
  defuseMaxDistanceMeters: 2,
  pickupMaxDistanceMeters: 1.5,
  damageCancelsInteraction: false,
  deadlineWinsExactTie: true,
});

const TEAMS = ['BL', 'GR'];
const POSITIVE_SECONDS = [
  'preparationSeconds',
  'roundSeconds',
  'bombSeconds',
  'plantSeconds',
  'defuseSeconds',
  'resultSeconds',
];
const REQUIRED_RULES = {
  drawAtRoundLimit: true,
  overtime: false,
  economy: false,
  weaponPickups: false,
  respawnWithinRound: false,
  damageCancelsInteraction: false,
  deadlineWinsExactTie: true,
};

const validId = (id) => (typeof id === 'string' && id.length > 0)
  || (typeof id === 'number' && Number.isFinite(id));
const compareIds = (a, b) => {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a !== typeof b) return typeof a === 'number' ? -1 : 1;
  return a < b ? -1 : a > b ? 1 : 0;
};
const copyPosition = (position) => {
  if (!position || !['x', 'y', 'z'].every((key) => Number.isFinite(position[key]))) return null;
  return { x: position.x, y: position.y, z: position.z };
};
const emptyBomb = () => ({
  state: 'carried',
  position: null,
  siteId: null,
});

function validateConfig(overrides) {
  for (const key of Object.keys(overrides)) {
    if (!Object.hasOwn(BOMB_DEFAULTS, key)) throw new TypeError(`Unknown bomb option: ${key}`);
  }
  const config = { ...BOMB_DEFAULTS, ...overrides };
  for (const [key, value] of Object.entries(config)) {
    if (typeof value !== typeof BOMB_DEFAULTS[key]) throw new TypeError(`Invalid bomb option: ${key}`);
    if (typeof value === 'number' && (!Number.isFinite(value) || value < 0)) {
      throw new RangeError(`Invalid bomb option: ${key}`);
    }
    if (typeof value === 'string' && !value.length) throw new TypeError(`Invalid bomb option: ${key}`);
  }
  for (const key of ['teamSize', 'humanPlayers', 'maxRounds', 'roundsBeforeSideSwap', 'roundsToWin']) {
    if (!Number.isSafeInteger(config[key]) || (key !== 'humanPlayers' && config[key] < 1)) {
      throw new RangeError(`Invalid bomb option: ${key}`);
    }
  }
  for (const key of [...POSITIVE_SECONDS, 'defuseMaxDistanceMeters', 'pickupMaxDistanceMeters', 'healthAtRoundStart']) {
    if (config[key] <= 0) throw new RangeError(`Invalid bomb option: ${key}`);
  }
  if (config.humanPlayers > config.teamSize * 2
    || config.roundsBeforeSideSwap > config.maxRounds
    || config.roundsToWin > config.maxRounds) throw new RangeError('Inconsistent bomb configuration');
  for (const [key, value] of Object.entries(REQUIRED_RULES)) {
    if (config[key] !== value) throw new RangeError(`Unsupported bomb rule: ${key}`);
  }
  return Object.freeze(config);
}

// 在每次 advance 中固定整批存活信息，不能逐条死亡回调结算。
function aliveSnapshot(actors) {
  if (!Array.isArray(actors)) throw new TypeError('Bomb actors must be an array');
  const snapshot = new Map();
  for (const actor of actors) {
    if (!actor || !validId(actor.id) || !TEAMS.includes(actor.team) || snapshot.has(actor.id)) {
      throw new TypeError('Bomb actors require unique IDs and BL/GR teams');
    }
    snapshot.set(actor.id, {
      id: actor.id,
      team: actor.team,
      alive: actor.alive === true,
      isPlayer: actor.isPlayer === true,
    });
  }
  return snapshot;
}

export class BombRules {
  constructor({ now = 0, ...overrides } = {}) {
    this.config = validateConfig(overrides);
    this._checkTime(now, 0);
    this.now = now;
    this.phase = 'preparation';
    this.round = 1;
    this.attackTeam = 'BL';
    this.score = { BL: 0, GR: 0 };
    this.deadline = now + this.config.preparationSeconds;
    this.carrierId = null;
    this.bomb = emptyBomb();
    this.interactions = new Map();
    this.events = [];
    this._actors = new Map();
    this._roundBegun = false;
    this._roundStartEmitted = false;
  }

  get defendTeam() { return this.attackTeam === 'BL' ? 'GR' : 'BL'; }
  get active() { return this.phase === 'live' || this.phase === 'planted'; }

  _checkTime(now, minimum = this.now) {
    if (!Number.isFinite(now) || now < minimum) throw new RangeError('Bomb time must be finite and monotonic');
  }

  beginRound(now, actors) {
    this._checkTime(now);
    if (this.phase !== 'preparation' || this._roundBegun) return false;
    const snapshot = aliveSnapshot(actors);
    const candidates = [...snapshot.values()]
      .filter((actor) => actor.alive && actor.team === this.attackTeam)
      .sort((a, b) => Number(b.isPlayer) - Number(a.isPlayer) || compareIds(a.id, b.id));
    this.now = now;
    this._actors = snapshot;
    this.carrierId = candidates[0]?.id ?? null;
    this.bomb = emptyBomb();
    this.interactions.clear();
    this.deadline = now + this.config.preparationSeconds;
    this._roundBegun = true;
    if (!this._roundStartEmitted) {
      this.events.push({
        type: 'round-start',
        round: this.round,
        attackTeam: this.attackTeam,
        at: now,
        deadline: this.deadline,
      });
      this._roundStartEmitted = true;
    }
    return true;
  }

  nextEventTime() {
    if (this.phase === 'finished') return Infinity;
    let next = this.deadline;
    for (const interaction of this.interactions.values()) next = Math.min(next, interaction.completeAt);
    return next;
  }

  beginInteraction(actorId, kind, now, { siteId = null, position = null } = {}) {
    this._checkTime(now);
    if (!this.active || now >= this.deadline || !validId(actorId)) return false;
    const actor = this._actors.get(actorId);
    if (!actor?.alive) return false;
    if (kind === 'plant') {
      if (this.phase !== 'live' || this.bomb.state !== 'carried'
        || actor.team !== this.attackTeam || this.carrierId !== actorId
        || !validId(siteId) || !copyPosition(position)) return false;
    } else if (kind === 'defuse') {
      if (this.phase !== 'planted' || this.bomb.state !== 'planted' || actor.team !== this.defendTeam) return false;
    } else return false;
    const existing = this.interactions.get(actorId);
    if (existing?.kind === kind) return true;
    this.interactions.set(actorId, {
      kind,
      startAt: now,
      completeAt: now + this.config[kind === 'plant' ? 'plantSeconds' : 'defuseSeconds'],
      siteId: kind === 'plant' ? siteId : this.bomb.siteId,
      position: copyPosition(kind === 'plant' ? position : this.bomb.position),
    });
    return true;
  }

  cancelInteraction(actorId) { return this.interactions.delete(actorId); }

  interactionProgress(actorId, now) {
    if (!Number.isFinite(now)) return 0;
    const interaction = this.interactions.get(actorId);
    if (!interaction) return 0;
    return Math.max(0, Math.min(1, (now - interaction.startAt) / (interaction.completeAt - interaction.startAt)));
  }

  dropCarrier(actorId, position) {
    const droppedPosition = copyPosition(position);
    if (this.phase !== 'live' || this.bomb.state !== 'carried'
      || this.carrierId !== actorId || !droppedPosition) return false;
    this.bomb = {
      state: 'dropped',
      position: droppedPosition,
      siteId: null,
    };
    this.carrierId = null;
    this.cancelInteraction(actorId);
    return true;
  }

  pickup(actorId, actors) {
    if (this.phase !== 'live' || this.bomb.state !== 'dropped') return false;
    const snapshot = aliveSnapshot(actors);
    const actor = snapshot.get(actorId);
    if (!actor?.alive || actor.team !== this.attackTeam) return false;
    this._actors = snapshot;
    this.carrierId = actorId;
    this.bomb = emptyBomb();
    return true;
  }

  _validInteraction(actorId, interaction, snapshot) {
    const actor = snapshot.get(actorId);
    if (!actor?.alive) return false;
    if (interaction.kind === 'plant') {
      return this.phase === 'live' && this.bomb.state === 'carried'
        && actor.team === this.attackTeam && this.carrierId === actorId;
    }
    return this.phase === 'planted' && this.bomb.state === 'planted' && actor.team === this.defendTeam;
  }

  _roundResult(winner, reason, at) {
    if (!this.active) return;
    this.score[winner]++;
    this.phase = 'result';
    this.deadline = at + this.config.resultSeconds;
    this.interactions.clear();
    this.events.push({
      type: 'round-result',
      winner,
      reason,
      round: this.round,
      at,
    });
  }

  _elimination(snapshot, at) {
    if (!this.active) return;
    let attackers = 0, defenders = 0;
    for (const actor of snapshot.values()) {
      if (actor.alive) {
        if (actor.team === this.attackTeam) attackers++;
        else defenders++;
      }
    }
    if (attackers === 0 && defenders === 0) {
      this._roundResult(this.phase === 'planted' ? this.attackTeam : this.defendTeam, 'both-eliminated', at);
    } else if (defenders === 0) {
      this._roundResult(this.attackTeam, 'defenders-eliminated', at);
    } else if (attackers === 0 && this.phase === 'live') {
      this._roundResult(this.defendTeam, 'attackers-eliminated', at);
    }
  }

  _afterResult(at) {
    const reachedScore = TEAMS.find((team) => this.score[team] >= this.config.roundsToWin);
    if (reachedScore || this.round >= this.config.maxRounds) {
      const winner = reachedScore ?? (this.score.BL === this.score.GR ? null : this.score.BL > this.score.GR ? 'BL' : 'GR');
      this.phase = 'finished';
      this.deadline = Infinity;
      this.carrierId = null;
      this.events.push({
        type: 'match-result',
        winner,
        reason: reachedScore ? 'score-limit' : winner === null ? 'draw' : 'round-limit',
        score: { ...this.score },
        round: this.round,
        at,
      });
      return;
    }
    this.round++;
    this.attackTeam = this.round > this.config.roundsBeforeSideSwap ? 'GR' : 'BL';
    this.phase = 'preparation';
    this.deadline = at + this.config.preparationSeconds;
    this.carrierId = null;
    this.bomb = emptyBomb();
    this.interactions.clear();
    this._roundBegun = false;
    this._roundStartEmitted = true;
    this.events.push({
      type: 'round-start',
      round: this.round,
      attackTeam: this.attackTeam,
      at,
      deadline: this.deadline,
    });
    // 集成方收到 round-start 后重置角色，再用同一模拟时间 beginRound。
  }

  advance(now, actors) {
    this._checkTime(now);
    const snapshot = aliveSnapshot(actors);
    this.now = now;
    this._actors = snapshot;
    if (this.phase === 'finished') return this.phase;
    if (this.phase === 'result') {
      if (now >= this.deadline) this._afterResult(this.deadline);
      return this.phase;
    }
    if (this.phase === 'preparation') {
      if (!this._roundBegun || now < this.deadline) return this.phase;
      const at = this.deadline;
      this.phase = 'live';
      this.deadline = at + this.config.roundSeconds;
      this.events.push({ type: 'round-live', round: this.round, at, deadline: this.deadline });
    }
    for (const [actorId, interaction] of this.interactions) {
      if (!this._validInteraction(actorId, interaction, snapshot)) this.interactions.delete(actorId);
    }
    while (this.active) {
      const eventAt = this.nextEventTime();
      if (eventAt > now) break;
      // 完成必须严格早于截止；同刻先截止，即使也发生了全灭。
      if (this.deadline <= eventAt) {
        if (this.phase === 'planted') {
          this.bomb.state = 'exploded';
          this.events.push({ type: 'bomb-exploded', round: this.round, at: eventAt });
          this._roundResult(this.attackTeam, 'bomb-exploded', eventAt);
        } else this._roundResult(this.defendTeam, 'round-timeout', eventAt);
        break;
      }
      const completed = [...this.interactions.entries()]
        .filter(([, interaction]) => interaction.completeAt === eventAt)
        .sort(([a], [b]) => compareIds(a, b));
      for (const [actorId, interaction] of completed) {
        this.interactions.delete(actorId);
        if (!this._validInteraction(actorId, interaction, snapshot)) continue;
        if (interaction.kind === 'plant') {
          this.phase = 'planted';
          this.carrierId = null;
          this.bomb = {
            state: 'planted',
            position: copyPosition(interaction.position),
            siteId: interaction.siteId,
          };
          this.deadline = eventAt + this.config.bombSeconds;
          this.interactions.clear();
          this.events.push({
            type: 'bomb-planted',
            actorId,
            siteId: this.bomb.siteId,
            position: copyPosition(this.bomb.position),
            round: this.round,
            at: eventAt,
            deadline: this.deadline,
          });
        } else {
          this.bomb.state = 'defused';
          this.events.push({ type: 'bomb-defused', actorId, round: this.round, at: eventAt });
          this._roundResult(this.defendTeam, 'bomb-defused', eventAt);
        }
      }
      // 非截止的同刻：先提交有效安拆，再依整批存活快照结算。
      this._elimination(snapshot, eventAt);
    }
    this._elimination(snapshot, now);
    return this.phase;
  }

  drainEvents() {
    const events = this.events;
    this.events = [];
    return events;
  }
}
