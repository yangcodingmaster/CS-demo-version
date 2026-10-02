// 机器人 AI
import * as THREE from 'three';
import { Actor } from './actor.js';

export const DIFF = {
  easy: { react: [0.55, 0.9], aimErr: 0.075, turn: 3.2, track: 2.2, headP: 0.07, ctrl: 1.0, comp: 0.55, strafe: 0.35, see: 50, fov: 1.6, bunny: 0 },
  normal: { react: [0.38, 0.62], aimErr: 0.058, turn: 5.2, track: 3.2, headP: 0.12, ctrl: 0.85, comp: 0.8, strafe: 0.65, see: 62, fov: 1.85, bunny: 0.05 },
  hard: { react: [0.2, 0.34], aimErr: 0.032, turn: 8.5, track: 5.5, headP: 0.3, ctrl: 0.6, comp: 0.9, strafe: 0.85, see: 75, fov: 2.05, bunny: 0.12 },
  hell: { react: [0.12, 0.2], aimErr: 0.02, turn: 13, track: 8.5, headP: 0.5, ctrl: 0.42, comp: 0.95, strafe: 1, see: 95, fov: 2.3, bunny: 0.2 },
};

export const BOT_NAMES = [
  '丶夜猫子', 'CF灬战神', '狙神小白', '枪王之王', '火麒麟丶', '无敌小旋风', '天使の翼', '爆头专业户', '穿越者丨龙', '雷神M4',
  '灬冷血杀手', '沙鹰一哥', '老六本六', '我是菜鸟', '运输船之王', 'Sniper丶K', '二楼架枪', '管道守门员', '一枪一个', '闪电侠丶',
  '黑名单丶影', '保卫者老王', '夜袭者', '零度丶', '狂暴战神', '别打我头', '满血复活', '疾风步',
];

// 各阵营的架点（潜伏者坐标，保卫者取反）
const HOLDS = [[-20.5, -7.2, 0.2], [-24.6, 5.8, -0.15], [-16.4, 1.3, 0.1], [-9.8, -6.8, 0.25], [-26.2, -6.5, 0.05]];
const LANES = [-6.8, -0.4, 6.8];

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
const wrapPi = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };

export class Bot extends Actor {
  constructor(game, o) {
    super(game, o);
    this.diff = DIFF[o.diff] || DIFF.normal;
    this.recoilControl = this.diff.ctrl;
    this.path = null; this.pi = 0; this.goal = null;
    this.target = null; this.visible = false; this.lastSeen = null; this.lastSeenT = -99; this.reactUntil = 0;
    this.errY = 0; this.errP = 0; this.aimHead = false;
    this.strafeDir = 1; this.strafeT = 0; this.burst = 0; this.burstPauseUntil = 0;
    this.thinkT = Math.random() * 0.2; this.stuckT = 0; this.stuckN = 0; this.lastCheck = new THREE.Vector3();
    this.role = 'rush'; this.holdT = 0; this.crouchUntil = 0; this.nadeT = 20 + Math.random() * 20;
    this.heard = null; this.heardT = -99;
    this.fireHeld = false;
    this.wantJump = false;
    this.ammoFallback = false; this.ammoSwitchUntil = 0;
    this.navFailureSince = -1; this.blockedReportT = -99;
    this.yieldUntil = 0; this.yieldWish = null;
    this.side = this.team === 'BL' ? 1 : -1; // 潜伏者坐标系转换
  }
  onSpawn() {
    this.path = null; this.goal = null; this.target = null; this.visible = false; this.lastSeen = null;
    this.lastSeenT = -99; this.heard = null; this.heardT = -99;
    this.nadePlan = null; this.wantScope = false; this.wantJump = false; this.fireHeld = false;
    this.lookYaw = undefined; this.lookPitch = undefined;
    this.burst = 0; this.burstPauseUntil = 0; this.crouchUntil = 0;
    this.stuckT = 0; this.stuckN = 0; this.lastCheck.copy(this.pos);
    this.objectiveTask = null; this.objectiveKey = null; this.objectivePathT = -99;
    this.holdYaw = undefined;
    this.ammoFallback = false; this.ammoSwitchUntil = 0;
    this.navFailureSince = -1; this.blockedReportT = -99;
    this.yieldUntil = 0; this.yieldWish = null;
    if (this.game.mode === 'bomb') {
      this.role = 'bomb';
      this.stage = 0;
      this.pickGoal();
      return;
    }
    const r = Math.random();
    this.role = this.primary === 'awm' ? 'hold' : r < 0.25 ? 'flank' : 'rush';
    this.lane = LANES[(Math.random() * 3) | 0];
    this.stage = 0;
    this.pickGoal();
  }
  L(x, z) { return [x * this.side, z * this.side]; } // 己方坐标 -> 世界
  pickGoal() {
    const g = this.game, nav = g.nav, rnd = Math.random;
    if (g.mode === 'bomb') {
      this.pickBombGoal(true);
      return;
    }
    let gx, gz;
    if (this.role === 'hold') {
      const h = HOLDS[(rnd() * HOLDS.length) | 0];
      [gx, gz] = this.L(h[0], h[1]);
      this.holdYaw = this.side > 0 ? -Math.PI / 2 + h[2] : Math.PI / 2 + h[2];
    } else if (this.role === 'flank' && this.stage < 3) {
      const pts = [[-31.5, 10.5], [-8, 10.6], [8.0, 7.8]];
      [gx, gz] = this.L(...pts[this.stage]);
    } else if (this.stage < 1) {
      [gx, gz] = this.L(4 + rnd() * 18, this.lane + (rnd() - 0.5) * 2);
    } else {
      const p = nav.randomFree(rnd, -26, -8.8, 26, 8.8);
      [gx, gz] = p || this.L(10, 0);
    }
    this.goal = [gx, gz];
    this.path = nav.findPath(this.pos.x, this.pos.z, gx, gz);
    this.pi = 1;
  }
  pickBombGoal(force = false) {
    const g = this.game;
    const task = g.getBombTask?.(this) || null;
    this.objectiveTask = task;
    if (!task?.goal) {
      this.goal = null;
      this.path = null;
      this.objectiveKey = null;
      return;
    }
    const { x, z } = task.goal;
    const key = `${task.interact || 'guard'}:${task.siteId || ''}`;
    const changed = !this.goal || Math.hypot(this.goal[0] - x, this.goal[1] - z) > 1;
    const needsPath = (!this.path || this.pi >= this.path.length) && Math.hypot(this.pos.x - x, this.pos.z - z) > 0.65;
    // 移动护送目标更新时重算路径；站在守点位置时不会不断请求同一路径。
    if (force || key !== this.objectiveKey || changed || needsPath || (g.time - this.objectivePathT > 3 && this.stuckN > 0)) {
      this.goal = [x, z];
      this.path = g.nav.findPath(this.pos.x, this.pos.z, x, z);
      this.pi = 1;
      this.objectivePathT = g.time;
    }
    this.objectiveKey = key;
    if (!this.path && Math.hypot(this.pos.x - x, this.pos.z - z) > 0.75) {
      if (this.navFailureSince < 0) this.navFailureSince = g.time;
      if (g.time - this.navFailureSince > 1) this.reportBlockedTask();
    } else this.navFailureSince = -1;
  }
  reportBlockedTask() {
    if (this.game.time - this.blockedReportT < 2) return;
    this.blockedReportT = this.game.time;
    this.game.reportBombTaskBlocked?.(this, this.objectiveTask);
  }
  bombLookYaw(now, pathYaw = null) {
    const point = this.objectiveTask?.lookAt;
    if (!point) return null;
    const dx = point.x - this.pos.x, dz = point.z - this.pos.z;
    if (Math.hypot(dx, dz) < 0.1) return null;
    const yaw = Math.atan2(-dx, -dz);
    // 行进时看前方入口，到守点后在入口附近有限巡视。
    if (pathYaw !== null) return pathYaw + THREE.MathUtils.clamp(wrapPi(yaw - pathYaw), -0.65, 0.65);
    return yaw + (this.objectiveTask.interact ? 0 : Math.sin(now * 0.45 + this.id * 0.9) * 0.28);
  }
  ammoDecision(now) {
    const current = this.weapon, primary = this.inv[0], secondary = this.inv[1];
    if (!current || this.pendingThrow || this.nadePlan || this.c4Selected || this.game.isInteracting?.(this)) return null;
    if (!['rifle', 'smg', 'sniper', 'pistol'].includes(current.def.type)) return null;
    const ready = now >= this.readyAt && now >= this.ammoSwitchUntil;
    const closeThreat = this.visible && this.target?.alive && this.pos.distanceTo(this.target.pos) < 12;
    if (this.slot === 0 && primary.mag === 0) {
      const reloadLeft = primary.reloading ? primary.reloadUntil - now : primary.def.reload;
      const canBackup = secondary?.mag > 0 && !secondary.reloading;
      if (ready && canBackup && (primary.reserve <= 0 || (closeThreat && reloadLeft > secondary.def.draw + 0.25))) {
        this.ammoFallback = true;
        this.ammoSwitchUntil = now + 1.2;
        return { sw: 1, reload: false };
      }
      return { sw: null, reload: primary.canReload() };
    }
    if (this.slot === 1 && this.ammoFallback) {
      const canRestore = primary && (primary.mag > 0 || primary.canReload());
      const disengaged = !this.visible && now - this.lastSeenT > 1.2;
      if (ready && canRestore && (disengaged || (secondary.mag === 0 && primary.mag > 0))) {
        this.ammoFallback = false;
        this.ammoSwitchUntil = now + 1.2;
        return { sw: 0, reload: false };
      }
    }
    if (current.mag === 0) return { sw: null, reload: current.canReload() };
    return null;
  }
  clearObjectiveActions(dt) {
    this.fireHeld = false; this.nadePlan = null; this.wantJump = false; this.wantScope = false;
    this.scoped = 0; this.pendingThrow = this.autoSwitchAt = this.reScope = 0;
    // 已开始的换弹及武器恢复照常推进，交互不发出任何开火/切枪命令。
    this.weaponUpdate(dt, { fire: false, firePressed: false, alt: false, altPressed: false, reload: false, sw: null });
  }
  localClear(x, z) {
    const g = this.game;
    return !g.world.blocked(x, this.pos.y + 0.05, z, this.radius, this.height - 0.1)
      && (!g.nav?.lineFree || g.nav.lineFree(this.pos.x, this.pos.z, x, z));
  }
  avoidTeammates(wishX, wishZ) {
    const g = this.game, now = g.time;
    let nearest = null, nearD = Infinity;
    for (const a of g.actors) {
      if (a === this || !a.alive || a.team !== this.team || Math.abs(a.pos.y - this.pos.y) > 1) continue;
      const d = Math.hypot(a.pos.x - this.pos.x, a.pos.z - this.pos.z);
      if (d < 1.6 && d < nearD) { nearest = a; nearD = d; }
      if (g.isInteracting(a) && d < 1.55) {
        // 先在实体接触前离开安拆区，避免 Actor.move 推人后清零队友进度。
        const dx = this.pos.x - a.pos.x, dz = this.pos.z - a.pos.z;
        const length = Math.hypot(dx, dz) || 1;
        const away = [dx / length, dz / length];
        for (const [x, z] of [away, [-away[1], away[0]], [away[1], -away[0]]]) {
          if (this.localClear(this.pos.x + x * 0.65, this.pos.z + z * 0.65)) return [x, z];
        }
        return [0, 0];
      }
    }
    if (now < this.yieldUntil && this.yieldWish) return this.yieldWish;
    const length = Math.hypot(wishX, wishZ);
    if (!nearest || length < 0.1) return [wishX, wishZ];
    const dx = nearest.pos.x - this.pos.x, dz = nearest.pos.z - this.pos.z;
    const forwardX = wishX / length, forwardZ = wishZ / length;
    const ahead = dx * forwardX + dz * forwardZ;
    const across = dx * -forwardZ + dz * forwardX;
    const priority = nearest.isPlayer || g.isInteracting(nearest) || nearest.id === g.bomb?.carrierId
      || (this.id !== g.bomb?.carrierId && nearest.id < this.id);
    if (!priority || ahead < 0 || Math.abs(across) > 0.85) return [wishX, wishZ];
    const side = across >= 0 ? -1 : 1;
    for (const sign of [side, -side]) {
      const x = -forwardZ * sign, z = forwardX * sign;
      if (!this.localClear(this.pos.x + x * 0.8, this.pos.z + z * 0.8)) continue;
      this.yieldWish = [x * 0.65 - forwardX * 0.15, z * 0.65 - forwardZ * 0.15];
      this.yieldUntil = now + 0.35;
      return this.yieldWish;
    }
    // 窄口无侧向空间时短暂停步，让固定优先级的一方先过。
    this.yieldWish = [0, 0]; this.yieldUntil = now + 0.25;
    return this.yieldWish;
  }
  detour() {
    if (!this.path || !this.goal || this.pi >= this.path.length) return false;
    const wp = this.path[this.pi], dx = wp[0] - this.pos.x, dz = wp[1] - this.pos.z;
    const length = Math.hypot(dx, dz);
    if (length < 0.1) return false;
    for (const sign of [this.id % 2 ? 1 : -1, this.id % 2 ? -1 : 1]) {
      const x = this.pos.x - dz / length * sign * 0.85 + dx / length * 0.3;
      const z = this.pos.z + dx / length * sign * 0.85 + dz / length * 0.3;
      if (!this.localClear(x, z)) continue;
      const rest = this.game.nav.findPath(x, z, this.goal[0], this.goal[1]);
      if (!rest) continue;
      this.path = [[this.pos.x, this.pos.z], [x, z], ...rest.slice(1)]; this.pi = 1;
      return true;
    }
    return false;
  }
  hear(pos, loud) {
    if (!this.alive || this.visible) return;
    this.heard = pos.clone(); this.heardT = this.game.time; this.heardLoud = loud;
  }
  onDamaged(att) {
    if (!att || !this.alive) return;
    if (!this.visible || this.target !== att) {
      this.lastSeen = att.pos.clone(); this.lastSeenT = this.game.time;
      if (!this.visible) {
        this.target = att;
        // 朝攻击者方向扭头（带误差）
        const dx = att.pos.x - this.pos.x, dz = att.pos.z - this.pos.z;
        this.lookYaw = Math.atan2(-dx, -dz) + (Math.random() - 0.5) * 0.5;
      }
    }
  }
  canSee(t) {
    const g = this.game;
    const e = this.eye(_v);
    const dist = e.distanceTo(t.pos);
    if (dist > this.diff.see) return false;
    // 视野角
    const dx = t.pos.x - this.pos.x, dz = t.pos.z - this.pos.z;
    const ang = Math.abs(wrapPi(Math.atan2(-dx, -dz) - this.yaw));
    if (ang > this.diff.fov / 2 && dist > 6) return false;
    for (const pt of [t.soldier.headWorld(_v2), t.soldier.chestWorld(_v3)]) {
      const d = pt.clone().sub(e); const L = d.length(); d.divideScalar(L);
      if (!g.world.raycast(e.x, e.y, e.z, d.x, d.y, d.z, L - 0.1, 'sight')) return true;
    }
    return false;
  }
  think() {
    const g = this.game, now = g.time;
    // 感知
    let best = null, bestD = 1e9;
    for (const a of g.actors) {
      if (!a.alive || a.team === this.team) continue;
      const d = a.pos.distanceTo(this.pos);
      if (d > bestD) continue;
      if (this.canSee(a)) { best = a; bestD = d; }
    }
    if (best) {
      if (!this.visible || this.target !== best) {
        const [r0, r1] = this.diff.react;
        const surprise = this.target === best && now - this.lastSeenT < 1.5 ? 0.4 : 1;
        this.reactUntil = now + (r0 + Math.random() * (r1 - r0)) * surprise;
        const k = this.diff.aimErr * (0.8 + bestD / 28);
        const a = Math.random() * Math.PI * 2;
        this.errY = Math.cos(a) * k * 1.3; this.errP = Math.sin(a) * k * 0.8 - k * 0.1;
        this.aimHead = Math.random() < this.diff.headP;
        this.burst = 0;
      }
      this.target = best; this.visible = true; this.lastSeen = best.pos.clone(); this.lastSeenT = now;
      if (g.mode !== 'bomb') this.path = null;
    } else {
      this.visible = false;
      if (this.target && (!this.target.alive || now - this.lastSeenT > 5)) this.target = null;
    }
    // 任务导航与当前感知在同一个思考周期更新。
    if (g.mode === 'bomb') this.pickBombGoal();
    const objectiveBusy = g.mode === 'bomb' && (g.isInteracting(this) || this.c4Selected);
    // 移动决策
    if (!this.visible) {
      if (g.mode === 'bomb') {
        // 目标只来自模式层的公开任务，不从敌人实时坐标生成导航。
        // lookAt 由地图任务提供，在 update 中按路径和守点状态转向。
      } else if (this.lastSeen && now - this.lastSeenT < 5 && this.role !== 'hold') {
        if (!this.path || this.huntFor !== this.lastSeenT) {
          this.path = g.nav.findPath(this.pos.x, this.pos.z, this.lastSeen.x, this.lastSeen.z); this.pi = 1; this.huntFor = this.lastSeenT;
        }
      } else if (this.heard && now - this.heardT < 3 && this.role !== 'hold' && Math.random() < 0.5) {
        this.path = g.nav.findPath(this.pos.x, this.pos.z, this.heard.x, this.heard.z); this.pi = 1;
        this.lookYaw = Math.atan2(-(this.heard.x - this.pos.x), -(this.heard.z - this.pos.z));
        this.heard = null;
      } else if (!this.path || this.pi >= this.path.length) {
        if (this.role === 'hold' && this.goal && this.pos.distanceTo(_v.set(this.goal[0], this.pos.y, this.goal[1])) < 1.2) {
          this.holdT += 0.15;
          if (this.holdT > 25 + Math.random() * 20) { this.holdT = 0; this.pickGoal(); }
        } else { this.stage++; this.pickGoal(); }
      }
      // 换弹
      const w = this.weapon;
      if (!objectiveBusy && w.def.mag > 1 && w.mag < w.def.mag * 0.5 && w.canReload() && now - this.lastSeenT > 1.2) this.startReload();
      // 手雷
      this.nadeT -= 0.15;
      if (!objectiveBusy && this.nadeT <= 0 && this.lastSeen && now - this.lastSeenT < 3 && this.inv[3].mag > 0) {
        const d = this.lastSeen.distanceTo(this.pos);
        if (d > 7 && d < 24 && Math.random() < 0.35) { this.nadePlan = this.lastSeen.clone(); this.nadeT = 25 + Math.random() * 25; }
      }
    } else {
      // 狙击：开镜
      const w = this.weapon;
      if (!objectiveBusy && w.def.type === 'sniper' && !this.scoped && bestD > 7 && now >= w.boltUntil) this.wantScope = true;
      if (Math.random() < 0.12 * this.diff.strafe) this.crouchUntil = now + 0.6 + Math.random() * 1.2;
    }
    // 卡住检测
    this.stuckT += 0.15;
    if (this.stuckT > 1.0) {
      const moved = this.lastCheck.distanceTo(this.pos);
      if (this.path && this.pi < this.path.length && moved < 0.35 && !this.visible && now >= this.yieldUntil) {
        this.stuckN++;
        if (g.mode === 'bomb') {
          if (this.stuckN === 1) this.detour();
          if (this.stuckN >= 2) { this.reportBlockedTask(); this.stuckN = 0; this.pickGoal(); }
        } else {
          this.wantJump = true;
          if (this.stuckN > 2) { this.stuckN = 0; this.stage++; this.pickGoal(); }
        }
      } else this.stuckN = 0;
      this.lastCheck.copy(this.pos); this.stuckT = 0;
    }
  }
  update(dt) {
    const g = this.game, now = g.time;
    if (!this.alive) return;
    if (g.mode === 'bomb' && !g.canFight()) {
      this.fireHeld = false; this.nadePlan = null; this.wantJump = false;
      this.vel.set(0, 0, 0);
      return;
    }
    this.thinkT -= dt;
    if (this.thinkT <= 0) { this.thinkT = 0.13 + Math.random() * 0.06; this.think(); }
    let urgentTravel = false;
    if (g.mode === 'bomb') {
      g.updateBotObjective(this);
      if (g.isInteracting(this)) {
        // 安拆期间武器状态与任务不能竞争，也不靠角色分离把人推出交互范围。
        this.clearObjectiveActions(dt);
        this.vel.x = this.vel.z = 0;
        this.move(dt, 0, 0, false, false, false);
        return;
      }
      const task = g.getBombTask(this);
      if (task && ['plant', 'defuse'].includes(task.interact)
        && Math.hypot(this.pos.x - task.goal.x, this.pos.z - task.goal.z) < 0.7
        && g.shouldBotInteract(this, task)) {
        // 已抵达任务点后先站定，再由下一段模拟开始安拆。
        // 行进中仍会与目击敌人交战；到点后选择完成目标，受击死亡照常取消任务。
        this.clearObjectiveActions(dt);
        this.move(dt, 0, 0, false, false, false);
        return;
      }
      urgentTravel = !!(task?.urgent && ['plant', 'defuse'].includes(task.interact)
        && Math.hypot(this.pos.x - task.goal.x, this.pos.z - task.goal.z) >= 0.7);
      if (urgentTravel) {
        // 时间紧迫时携包/拆包负责人先赶路，取消尚未执行的投雷与慢速姿态。
        this.nadePlan = null; this.wantJump = false; this.wantScope = false;
        this.scoped = 0; this.scopeReady = false; this.reScope = 0;
      }
    }
    const D = this.diff;
    let wishX = 0, wishZ = 0, fire = false, firePressed = false, alt = false, crouch = !urgentTravel && now < this.crouchUntil, walk = false;
    let sw = null, reload = false;
    // 手雷投掷流程
    if (urgentTravel && this.slot === 3 && !this.pendingThrow) {
      sw = 0; this.autoSwitchAt = 0;
    } else if (this.nadePlan) {
      if (this.slot !== 3) sw = 3;
      else if (now >= this.readyAt && !this.pendingThrow) {
        const d = this.nadePlan.distanceTo(this.pos);
        this.lookYaw = Math.atan2(-(this.nadePlan.x - this.pos.x), -(this.nadePlan.z - this.pos.z));
        this.lookPitch = 0.25 + d * 0.012;
        firePressed = true; this.nadePlan = null;
      }
    } else if (this.slot === 3 && this.inv[3].mag <= 0 && !this.pendingThrow && !this.autoSwitchAt) sw = 0;
    // 瞄准
    let dYaw = this.yaw, dPitch = this.pitch;
    const tgt = this.target;
    if (tgt && tgt.alive && this.visible) {
      const e = this.eye(_v);
      const p = this.aimHead ? tgt.soldier.headWorld(_v2) : tgt.soldier.chestWorld(_v2);
      p.addScaledVector(tgt.vel, 0.08);
      const dx = p.x - e.x, dy = p.y - e.y, dz = p.z - e.z, hd = Math.hypot(dx, dz);
      const trueYaw = Math.atan2(-dx, -dz), truePitch = Math.atan2(dy, hd);
      const k = Math.exp(-D.track * dt);
      this.errY *= k; this.errP *= k;
      const targetSpeed = Number.isFinite(tgt.speed) ? tgt.speed : 0;
      const wob = 0.004 * (1 + targetSpeed / 4);
      dYaw = trueYaw + this.errY + Math.sin(now * 3.1 + this.id) * wob;
      dPitch = truePitch + this.errP + Math.cos(now * 2.7 + this.id) * wob * 0.6 - this.punchP * D.comp;
      this.lookYaw = undefined; this.lookPitch = undefined;
      // 开火判断
      const aimErr = Math.hypot(wrapPi(this.yaw - trueYaw), this.pitch - truePitch);
      const tol = Math.atan2(0.32, hd) * 1.4 + 0.01;
      const w = this.weapon, d = w.def;
      if (now >= this.reactUntil && aimErr < tol && now >= this.readyAt && !this.nadePlan) {
        if (d.type === 'sniper') { if (this.scoped && this.scopeReady && aimErr < tol * 0.6) firePressed = true; }
        else if (d.type === 'pistol') { firePressed = Math.random() < dt * 5; }
        else if (now >= this.burstPauseUntil) {
          fire = true;
          if (hd > 14) {
            this.burst++;
            if (this.burst > 3 + Math.random() * 4) { this.burst = 0; this.burstPauseUntil = now + 0.18 + Math.random() * 0.3 * (hd / 30); }
          }
        }
      }
      if (this.wantScope) { alt = true; this.wantScope = false; }
      if (urgentTravel) {
        // 仍瞄准目击敌人，移动只跟随既有路径，不为追敌直穿墙体。
        if (this.path && this.pi < this.path.length) {
          const wp = this.path[this.pi], dx = wp[0] - this.pos.x, dz = wp[1] - this.pos.z, dd = Math.hypot(dx, dz);
          if (dd < 0.55) this.pi++;
          else { wishX = dx / dd; wishZ = dz / dd; }
        }
      } else {
        // 横移
        this.strafeT -= dt;
        if (this.strafeT <= 0) { this.strafeT = 0.25 + Math.random() * 0.7; this.strafeDir = Math.random() < 0.5 ? -1 : 1; if (Math.random() < 0.2) this.strafeDir = 0; }
        const moveK = d.type === 'sniper' ? 0 : D.strafe;
        const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
        wishX = rx * this.strafeDir * moveK; wishZ = rz * this.strafeDir * moveK;
        if (hd > 22 && d.type !== 'sniper' && this.role !== 'hold') { wishX += -Math.sin(this.yaw) * 0.5; wishZ += -Math.cos(this.yaw) * 0.5; }
        if (Math.random() < D.bunny * dt && this.onGround && d.type !== 'sniper') this.wantJump = true;
      }
    } else {
      if (this.scoped && !this.visible && now - this.lastSeenT > 2) alt = true; // 收镜
      // 沿路径行走
      if (this.path && this.pi < this.path.length) {
        const wp = this.path[this.pi];
        const dx = wp[0] - this.pos.x, dz = wp[1] - this.pos.z, dd = Math.hypot(dx, dz);
        if (dd < 0.55) this.pi++;
        else { wishX = dx / dd; wishZ = dz / dd; }
        if (this.lookYaw === undefined || now - this.heardT > 1.5) dYaw = Math.atan2(-dx, -dz);
        dPitch = 0;
        walk = !urgentTravel && this.role === 'flank' && this.stage === 1;
      } else if (this.role === 'hold' && this.holdYaw !== undefined) {
        dYaw = this.holdYaw + Math.sin(now * 0.4 + this.id) * 0.35; dPitch = -0.02;
        crouch = crouch || Math.sin(now * 0.3 + this.id) > 0.3;
      }
      if (g.mode === 'bomb') {
        const moving = Math.hypot(wishX, wishZ) > 0.1;
        const taskYaw = this.bombLookYaw(now, moving ? Math.atan2(-wishX, -wishZ) : null);
        if (taskYaw !== null) dYaw = taskYaw;
      }
      if (this.lookYaw !== undefined && (g.mode !== 'bomb' || now - this.lastHurt < 0.65)) {
        dYaw = this.lookYaw; if (this.lookPitch !== undefined) dPitch = this.lookPitch;
      }
    }
    // 取消投雷计划后换回主枪，本帧不能顺带向已拿出的手雷发出拉环命令。
    if (urgentTravel && this.slot === 3) { fire = false; firePressed = false; alt = false; }
    // 爆破用确定优先级局部让行；实体重叠仍由 Actor.move 处理。
    if (g.mode === 'bomb') [wishX, wishZ] = this.avoidTeammates(wishX, wishZ);
    else for (const a of g.actors) {
      if (a === this || !a.alive) continue;
      const dx = this.pos.x - a.pos.x, dz = this.pos.z - a.pos.z, d2 = dx * dx + dz * dz;
      if (d2 < 1.2 && d2 > 1e-4) { const d = Math.sqrt(d2); wishX += dx / d * 0.6; wishZ += dz / d * 0.6; }
    }
    // 转向（限速）
    const turn = D.turn * dt * (this.visible ? 1 : 0.7);
    const ey = wrapPi(dYaw - this.yaw);
    this.yaw = wrapPi(this.yaw + THREE.MathUtils.clamp(ey, -turn, turn));
    this.pitch += THREE.MathUtils.clamp(dPitch - this.pitch, -turn * 0.6, turn * 0.6);
    // 移动 & 武器
    this.move(dt, wishX, wishZ, this.wantJump, crouch, walk);
    this.wantJump = false;
    const ammo = this.ammoDecision(now);
    if (ammo) {
      sw = ammo.sw ?? sw; reload = ammo.reload;
      if (ammo.sw !== null) { fire = false; firePressed = false; alt = false; }
    }
    const w = this.weapon;
    if (!this.c4Selected) this.weaponUpdate(dt, { fire, firePressed: firePressed || (fire && !this.fireHeld), alt, altPressed: alt, reload, sw });
    this.fireHeld = fire;
    void w;
  }
}
