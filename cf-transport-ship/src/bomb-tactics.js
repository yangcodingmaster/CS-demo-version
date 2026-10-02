// 爆破小队任务只依赖己方状态、公开目标和静态导航；不读取隐藏敌人的位置。
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

export function routeLength(nav, from, to) {
  const path = nav.findPath(from.x, from.z, to.x, to.z);
  if (!path?.length) return Infinity;
  let length = 0;
  let previous = from;
  for (const [x, z] of path) {
    const point = { x, z };
    length += distance(previous, point);
    previous = point;
  }
  return length + distance(previous, to);
}

export class BombTactics {
  constructor(game) {
    this.game = game;
    this.roundKey = null;
    this.reset();
  }
  reset() {
    this.owners = new Map();
    this.blockedUntil = new Map();
    this.posts = new Map();
    this.postAttempts = new Map();
    this.approaches = new Map();
  }
  sync() {
    const b = this.game.bomb;
    if (this.bomb !== b || this.roundKey !== b.round) {
      this.bomb = b;
      this.roundKey = b.round;
      this.reset();
    }
  }
  taskKey(kind, goal) { return `${kind}:${goal.x.toFixed(2)}:${goal.z.toFixed(2)}`; }
  owner(kind, goal, team) {
    const g = this.game;
    const key = this.taskKey(kind, goal);
    // 玩家正在安拆时，其余机器人负责掩护；玩家仅仅站得近不会占用任务。
    const human = g.actors.find((a) => a.isPlayer && a.alive && a.team === team
      && g.bomb.interactions.get(a.id)?.kind === kind);
    if (human) return human.id;
    const eligible = (a) => a.alive && !a.isPlayer && a.team === team
      && (this.blockedUntil.get(`${key}:${a.id}`) || 0) <= g.time;
    const existing = g.actors.find((a) => a.id === this.owners.get(key) && eligible(a));
    if (existing) return existing.id;
    let best = null;
    let bestLength = Infinity;
    for (const actor of g.actors) {
      if (!eligible(actor)) continue;
      const length = routeLength(g.nav, actor.pos, goal);
      if (length < bestLength || (length === bestLength && best && actor.id < best.id)) {
        best = actor;
        bestLength = length;
      }
    }
    if (best) this.owners.set(key, best.id);
    else this.owners.delete(key);
    return best?.id ?? null;
  }
  approach(position, kind) {
    const g = this.game;
    const key = this.taskKey(kind, position);
    if (this.approaches.has(key)) return this.approaches.get(key);
    // C4 可能位于网格边缘。选取邻近可站立、看得到 C4 的点，避免导航把终点留在墙里。
    for (const radius of [0, 0.35, 0.65]) {
      for (let i = 0; i < (radius ? 12 : 1); i++) {
        const angle = i * Math.PI / 6;
        const point = {
          x: position.x + Math.cos(angle) * radius,
          y: position.y,
          z: position.z + Math.sin(angle) * radius,
        };
        if (!g.nav.walkable(g.nav.idx(point.x, point.z))) continue;
        if (g.world.blocked(point.x, point.y + 0.05, point.z, 0.4, 1.75)) continue;
        const dx = position.x - point.x, dy = -1.45, dz = position.z - point.z;
        const length = Math.hypot(dx, dy, dz);
        if (g.world.raycast(point.x, point.y + 1.6, point.z, dx / length, dy / length, dz / length, length - 0.08, 'sight')) continue;
        this.approaches.set(key, point);
        return point;
      }
    }
    return null;
  }
  post(actor, site, enemySide) {
    const g = this.game;
    const prefix = `${g.bomb.phase}:${actor.team}:`;
    const key = `${prefix}${actor.id}:${site.id}`;
    if (this.posts.has(key)) return this.posts.get(key);
    const members = g.actors.filter((a) => a.team === actor.team).sort((a, b) => a.id - b.id);
    const rank = members.findIndex((a) => a.id === actor.id);
    const attempt = this.postAttempts.get(key) || 0;
    const reserved = [...this.posts].filter(([key]) => key.startsWith(prefix)).map(([, task]) => task.goal);
    const source = g.map.spawns[enemySide][rank % g.map.spawns[enemySide].length];
    for (const radius of [3.8, 5.2, 6.6]) {
      for (let i = 0; i < 12; i++) {
        const angle = ((rank * 5 + attempt * 3 + i) % 12) * Math.PI / 6;
        const point = {
          x: site.x + Math.cos(angle) * radius,
          y: site.y,
          z: site.z + Math.sin(angle) * radius,
        };
        if (!g.nav.walkable(g.nav.idx(point.x, point.z))) continue;
        if (g.world.blocked(point.x, point.y + 0.05, point.z, 0.45, 1.75)) continue;
        if (reserved.some((p) => distance(p, point) < 1.6)) continue;
        if (!Number.isFinite(routeLength(g.nav, actor.pos, point))) continue;
        // 朝敌方出生区的可通行入口观察，不把朝向穿过整面墙。
        const route = g.nav.findPath(point.x, point.z, source.x, source.z);
        const next = route?.find(([x, z]) => Math.hypot(x - point.x, z - point.z) > 2);
        const task = {
          goal: point,
          lookAt: next ? { x: next[0], y: point.y, z: next[1] } : { ...source },
          siteId: site.id,
        };
        this.posts.set(key, task);
        return task;
      }
    }
    // 没有可用站位时先原地观察，不能使用穿墙坐标。
    return { goal: { ...actor.pos }, lookAt: { ...source }, siteId: site.id };
  }
  getTask(actor) {
    const g = this.game, b = g.bomb;
    if (!b?.active || !actor.alive) return null;
    this.sync();
    const sites = g.map.sites;
    const chosen = sites[(b.round + 1) % sites.length];
    let task;
    if (actor.team === b.attackTeam) {
      if (b.bomb.state === 'dropped') {
        const goal = this.approach(b.bomb.position, 'pickup');
        if (goal && this.owner('pickup', goal, actor.team) === actor.id) task = { goal, interact: 'pickup' };
      }
      if (b.carrierId === actor.id) task = { goal: chosen, interact: 'plant', siteId: chosen.id };
      if (!task) {
        const site = b.bomb.state === 'planted' ? sites.find((s) => s.id === b.bomb.siteId) : chosen;
        task = this.post(actor, site || chosen, 'defend');
      }
    } else if (b.phase === 'planted') {
      const goal = this.approach(b.bomb.position, 'defuse');
      if (goal && this.owner('defuse', goal, actor.team) === actor.id) task = { goal, interact: 'defuse' };
      else {
        const site = { ...b.bomb.position, id: b.bomb.siteId };
        task = this.post(actor, site, 'attack');
      }
    } else {
      const roster = g.actors.filter((a) => a.team === actor.team).sort((a, c) => a.id - c.id);
      task = this.post(actor, sites[roster.indexOf(actor) % sites.length], 'attack');
    }
    // 用当前剩余路段估计赶路时间。远处优先赶路，到点后给完整安拆时间留余量。
    const seconds = task.interact === 'defuse' ? b.config.defuseSeconds : b.config.plantSeconds;
    let travel = distance(actor.pos, task.goal);
    if (actor.path?.length && actor.goal && Math.hypot(actor.goal[0] - task.goal.x, actor.goal[1] - task.goal.z) < 1) {
      let previous = actor.pos;
      travel = 0;
      for (let i = actor.pi; i < actor.path.length; i++) {
        const point = { x: actor.path[i][0], z: actor.path[i][1] };
        travel += distance(previous, point);
        previous = point;
      }
      travel += distance(previous, task.goal);
    }
    return { ...task, urgent: !!task.interact && b.deadline - g.time <= travel / 4 + seconds + 2 };
  }
  reportBlocked(actor, task) {
    if (!this.game.bomb?.active || !task) return;
    this.sync();
    if (task.interact) {
      const key = this.taskKey(task.interact, task.goal);
      if (this.owners.get(key) === actor.id) this.owners.delete(key);
      this.blockedUntil.set(`${key}:${actor.id}`, this.game.time + 4);
      // 持包者不能凭空交包，保留其任务，由移动层重算路径。
    } else {
      const key = `${this.game.bomb.phase}:${actor.team}:${actor.id}:${task.siteId}`;
      this.posts.delete(key);
      this.postAttempts.set(key, (this.postAttempts.get(key) || 0) + 1);
    }
  }
}

export function shouldCommitObjective(game, actor, task) {
  if (!game.bomb?.active || !actor.alive || !['plant', 'defuse'].includes(task?.interact)) return false;
  const interaction = game.bomb.interactions.get(actor.id);
  if (task.urgent || (interaction && interaction.completeAt - game.time < 1.25)) return true;
  // 只针对当前真实可见的近处敌人作出反应。藏到墙后的敌人不会改变此判断。
  const threat = actor.visible && actor.target?.alive && actor.canSee(actor.target)
    && distance(actor.pos, actor.target.pos) < 14;
  if (threat) {
    actor.objectiveSafeAfter = game.time + 0.8;
    return false;
  }
  return game.time >= (actor.objectiveSafeAfter || 0);
}
