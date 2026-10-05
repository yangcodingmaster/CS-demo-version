// 第一人称武器与手臂
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildGun, gunMaterials } from './guns.js';
import { WEAPONS } from './weapons.js';

const HIP = {
  scar: { p: [0.125, -0.13, -0.94], r: [0.045, 0.145, 0.02] },
  qbz95: { p: [0.12, -0.14, -0.83], r: [0.045, 0.145, 0.02] },
  p90: { p: [0.12, -0.14, -0.87], r: [0.05, 0.15, 0.02] },
  barrett: { p: [0.13, -0.16, -0.99], r: [0.04, 0.13, 0.02] },
  ak47: { p: [0.125, -0.135, -0.71], r: [0.045, 0.145, 0.02] },
  m4a1: { p: [0.125, -0.155, -0.7], r: [0.045, 0.145, 0.02] },
  awm: { p: [0.135, -0.125, -0.78], r: [0.04, 0.135, 0.02] },
  mp5: { p: [0.12, -0.145, -0.66], r: [0.05, 0.15, 0.02] },
  deagle: { p: [0.09, -0.105, -0.44], r: [0.05, 0.1, 0] },
  usp: { p: [0.09, -0.092, -0.43], r: [0.05, 0.1, 0] },
  glock18: { p: [0.095, -0.093, -0.44], r: [0.05, 0.11, 0] },
  knife: { p: [0.1, -0.1, -0.4], r: [0.32, -0.7, 0.4] },
  he: { p: [0.125, -0.1, -0.36], r: [0.1, -0.2, 0.2] },
};
const KICK = {
  scar: [0.038, 0.055], qbz95: [0.028, 0.045], p90: [0.023, 0.035], barrett: [0.13, 0.24],
  ak47: [0.04, 0.07], m4a1: [0.032, 0.05], awm: [0.09, 0.2], mp5: [0.024, 0.035],
  deagle: [0.05, 0.22], usp: [0.038, 0.16], glock18: [0.028, 0.12],
};

// 类别判据：优先 weapons.js 的 type，其次显式 id 集合（集成 Agent 写入新枪数据前后都成立）
const PISTOL_IDS = new Set(['deagle', 'usp', 'glock18']);
const wtype = (id) => (WEAPONS[id] && WEAPONS[id].type) || (PISTOL_IDS.has(id) ? 'pistol' : '');
const pick = (table, id, dflt) => table[id] ?? table[wtype(id)] ?? dflt;
// 枪口火焰缩放：集中的类别表（单枪覆盖优先），调整只改这一处
const FLASH_SCALE = { pistol: 1.2, usp: 1.0, glock18: 0.95, awm: 1.6, mp5: 0.8, deagle: 1.2 };
// 滑套后坐时长 / 空仓换弹末尾的套筒释放行程：按类别取值
const SLIDE_KICK = { pistol: 0.09 };
const SLIDE_RELEASE = { pistol: 0.03 };

const ease = (t) => t * t * (3 - 2 * t);
const seg = (f, a, b) => Math.min(1, Math.max(0, (f - a) / (b - a)));

// 静态手套合批：圆润掌面与弯曲手指保持简化轮廓，不增加逐指动画或独立 draw call。
function gloveGeometry(side) {
  const pieces = [];
  const add = (geo, x, y, z, rx = 0, ry = 0, rz = 0) => {
    const g = geo.index ? geo.toNonIndexed() : geo;
    if (g !== geo) geo.dispose();
    g.rotateX(rx); g.rotateY(ry); g.rotateZ(rz); g.translate(x, y, z);
    pieces.push(g);
  };
  add(new RoundedBoxGeometry(0.036, 0.067, 0.033, 2, 0.01), side * 0.034, -0.006, 0.009);
  add(new RoundedBoxGeometry(0.033, 0.034, 0.031, 1, 0.007), side * 0.031, -0.048, 0.019);
  for (let i = 0; i < 4; i++) {
    const y = 0.022 - i * 0.018;
    add(new THREE.CapsuleGeometry(0.008, 0.036 - i * 0.002, 2, 8), 0.004 * side, y, -0.014, 0, 0, Math.PI / 2);
    add(new RoundedBoxGeometry(0.014, 0.019, 0.032, 1, 0.0045), -side * 0.022, y, 0.002);
  }
  add(new THREE.CapsuleGeometry(0.01, 0.032, 2, 8), side * 0.015, 0.031, 0.021, -0.5, 0, side * 0.8);
  add(new RoundedBoxGeometry(0.018, 0.027, 0.024, 1, 0.006), -side * 0.003, 0.02, 0.018);
  const geo = mergeGeometries(pieces, false);
  for (const g of pieces) g.dispose();
  return geo;
}

export class ViewModel {
  constructor(scene, T, team) {
    this.scene = scene;
    this.rig = new THREE.Group();
    scene.add(this.rig);
    this.holder = new THREE.Group();
    this.rig.add(this.holder);
    this.guns = {};
    this.cur = null; this.id = null;
    // 灯光（方向每帧同步到相机空间）
    this.sun = new THREE.DirectionalLight(0xffffff, 2.5);
    this.sun.position.set(0.5, 1, 0.3);
    scene.add(this.sun);
    this.fill = new THREE.HemisphereLight(0xcfe2f4, 0x40464c, 0.35);
    scene.add(this.fill);
    this.muzzleLight = new THREE.PointLight(0xffb060, 0, 1.5, 2);
    scene.add(this.muzzleLight);
    // 手臂
    const m = gunMaterials();
    this.gloveMat = new THREE.MeshStandardMaterial({ color: 0x292d31, roughness: 0.82, metalness: 0.02, normalMap: m.black.normalMap, normalScale: new THREE.Vector2(0.18, 0.18) });
    this.sleeveMat = new THREE.MeshStandardMaterial({ color: 0x222326, roughness: 0.9, metalness: 0, normalMap: m.black.normalMap, normalScale: new THREE.Vector2(0.8, 0.8) });
    this.cuffMat = new THREE.MeshStandardMaterial({ color: 0xb01c1c, roughness: 0.8 });
    this.arms = {};
    for (const s of ['R', 'L']) {
      const g = new THREE.Group();
      const fore = new THREE.Mesh(new THREE.CapsuleGeometry(0.032, 0.3, 4, 12), this.sleeveMat);
      const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.034, 0.014, 12), this.cuffMat);
      const hand = new THREE.Group();
      const glove = new THREE.Mesh(gloveGeometry(s === 'R' ? 1 : -1), this.gloveMat);
      hand.add(glove);
      g.add(fore, cuff, hand);
      this.rig.add(g);
      this.arms[s] = { g, fore, cuff, hand, glove };
    }
    this.elbow = { R: new THREE.Vector3(0.5, -0.44, -0.3), L: new THREE.Vector3(-0.04, -0.5, -0.5) };
    // 枪口火焰
    const fm = (tex) => new THREE.MeshBasicMaterial({ map: tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, color: 0xffd9a0 });
    this.flashTex = T.flash;
    this.flash = new THREE.Group();
    this.flashFront = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.16), fm(T.flash[0]));
    this.flashSide1 = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.07), fm(T.flashSide));
    this.flashSide2 = this.flashSide1.clone();
    this.flashSide1.rotation.y = Math.PI / 2; this.flashSide1.position.z = -0.1;
    this.flashSide2.rotation.set(0, Math.PI / 2, Math.PI / 2); this.flashSide2.position.z = -0.1;
    this.flashSide1.geometry = this.flashSide1.geometry.clone().rotateZ(Math.PI);
    this.flash.add(this.flashFront, this.flashSide1, this.flashSide2);
    this.flash.visible = false;
    this.flash.renderOrder = 10;
    // 弹壳
    this.shells = [];
    const shellGeo = new THREE.CylinderGeometry(0.0055, 0.0055, 0.035, 8); shellGeo.rotateZ(Math.PI / 2);
    for (let i = 0; i < 14; i++) {
      const s = new THREE.Mesh(shellGeo, m.brass);
      s.visible = false; this.rig.add(s);
      this.shells.push({ mesh: s, v: new THREE.Vector3(), w: new THREE.Vector3(), life: 0 });
    }
    this.shellIdx = 0;
    // 状态
    this.t = 0;
    this.kick = 0; this.kickV = 0; this.kickRot = 0; this.kickRotV = 0;
    this.sway = new THREE.Vector2(); this.swayV = new THREE.Vector2();
    this.bobT = 0; this.bobK = 0;
    this.land = 0;
    this.drawT = 1; this.drawDur = 0.5;
    this.anim = null; // {type, t, dur, empty, heavy}
    this.flashT = 0;
    this.slideT = 0;
    this.setTeam(team);
    this.visible = true;
  }
  setTeam(team) {
    this.team = team;
    this.sleeveMat.color.set(team === 'GR' ? 0x3b4757 : 0x222326);
    this.cuffMat.color.set(team === 'GR' ? 0x263c57 : 0x3c292b);
  }
  equip(id, drawTime) {
    if (!this.guns[id]) {
      const g = buildGun(id);
      g.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
      this.guns[id] = g;
    }
    if (this.cur) { this.resetParts(); this.holder.remove(this.cur); } // 收枪前把零件归位，避免动画中断后静止位置被记成新基准
    this.cur = this.guns[id]; this.id = id;
    this.holder.add(this.cur);
    this.cur.visible = true;
    this.parts = {};
    this.cur.traverse((o) => { if (o.name) this.parts[o.name] = o; });
    this.partRest = {};
    for (const k of ['mag', 'bolt', 'slide', 'pin', 'lever']) if (this.parts[k]) this.partRest[k] = { p: this.parts[k].position.clone(), r: this.parts[k].rotation.clone() };
    const mz = this.parts.muzzle;
    if (mz) { mz.add(this.flash); }
    this.drawT = 0; this.drawDur = drawTime || 0.5;
    this.anim = null;
    this.slideT = 0;
    this.kick = this.kickV = this.kickRot = this.kickRotV = 0;
  }
  fire() {
    const k = KICK[this.id] || [0.03, 0.05];
    this.kickV += k[0] * 38; this.kickRotV += k[1] * 38;
    this.flashT = 0.05;
    this.flash.visible = true;
    this.flashFront.material.map = this.flashTex[(Math.random() * 3) | 0];
    this.flashFront.rotation.z = Math.random() * Math.PI;
    const sc = pick(FLASH_SCALE, this.id, 1);
    this.flash.scale.setScalar(sc * (0.8 + Math.random() * 0.45));
    if (!WEAPONS[this.id]?.boltAction) this.ejectShell();
    else this.anim = { type: 'bolt', t: 0, dur: 1.3 };
    // 滑套后坐：按能力判断（凡是有 slide 部件的枪都触发），不按 id 硬编码
    if (this.parts.slide) this.slideT = pick(SLIDE_KICK, this.id, 0.09);
  }
  ejectShell() {
    const an = this.parts.eject;
    if (!an) return;
    const s = this.shells[this.shellIdx++ % this.shells.length];
    an.getWorldPosition(s.mesh.position);
    s.mesh.visible = true; s.life = 0.9;
    s.v.set(0.9 + Math.random() * 0.6, 0.9 + Math.random() * 0.5, 0.25 + Math.random() * 0.3);
    s.w.set(Math.random() * 20, Math.random() * 20, Math.random() * 20);
    s.mesh.rotation.set(0, Math.random(), 0);
  }
  reload(dur, empty) { this.resetParts(); this.slideT = 0; this.anim = { type: 'reload', t: 0, dur, empty }; }
  melee(heavy) { this.anim = { type: heavy ? 'stab' : 'slash', t: 0, dur: heavy ? 0.85 : 0.38, dir: Math.random() > 0.5 ? 1 : -1 }; }
  throwNade() { this.anim = { type: 'throw', t: 0, dur: 0.75 }; }
  inspect() { if (!this.anim) this.anim = { type: 'inspect', t: 0, dur: 2.6 }; }
  cancelAnim() { if (this.anim && this.anim.type !== 'bolt') this.anim = null; this.resetParts(); }
  resetParts() {
    for (const k in this.partRest) { this.parts[k].position.copy(this.partRest[k].p); this.parts[k].rotation.copy(this.partRest[k].r); this.parts[k].visible = true; }
  }
  setVisible(v) { this.rig.visible = v; }

  // st: {speed, onGround, crouch, lookDX, lookDY, sunDirCam (Vector3), light (0..1), indoor}
  update(dt, st) {
    this.t += dt;
    if (!this.cur) return;
    const id = this.id;
    const hip = HIP[id] || HIP.ak47;
    // 弹簧：后坐
    const k1 = 260, d1 = 26;
    this.kickV += (-k1 * this.kick - d1 * this.kickV) * dt; this.kick += this.kickV * dt;
    this.kickRotV += (-k1 * this.kickRot - d1 * this.kickRotV) * dt; this.kickRot += this.kickRotV * dt;
    // 鼠标惯性摆动
    const tx = THREE.MathUtils.clamp(-st.lookDX * 0.00055, -0.05, 0.05), ty = THREE.MathUtils.clamp(st.lookDY * 0.00055, -0.04, 0.04);
    this.sway.x += (tx - this.sway.x) * Math.min(1, dt * 9);
    this.sway.y += (ty - this.sway.y) * Math.min(1, dt * 9);
    // 行走晃动
    const moving = st.onGround && st.speed > 0.5;
    this.bobK += ((moving ? Math.min(1, st.speed / 6) : 0) - this.bobK) * Math.min(1, dt * 6);
    this.bobT += dt * (5 + st.speed * 1.2) * (moving ? 1 : 0.3);
    const bx = Math.sin(this.bobT) * 0.011 * this.bobK, by = -Math.abs(Math.cos(this.bobT)) * 0.009 * this.bobK;
    const breathe = Math.sin(this.t * 1.6) * 0.0018;
    this.land *= Math.exp(-dt * 8);
    // 拔枪
    this.drawT = Math.min(1, this.drawT + dt / this.drawDur);
    const dr = 1 - ease(this.drawT);
    let px = hip.p[0] + bx + this.sway.x, py = hip.p[1] + by + breathe + this.sway.y - dr * 0.22 - this.land * 0.03 - (st.crouch ? 0.006 : 0);
    let pz = hip.p[2] + this.kick;
    let rx = hip.r[0] + this.kickRot - dr * 0.9 + this.sway.y * 1.5, ry = hip.r[1] + this.sway.x * 2, rz = hip.r[2] + (st.crouch ? -0.03 : 0) + bx * 2;
    // 特殊动作
    const P = this.parts, R = this.partRest;
    // 先记录局部手位，等本帧枪身姿态更新后再解析，避免手比弹匣/枪栓迟一帧。
    let handLTarget = null, handRTarget = null;
    const handTarget = (part, x, y, z, weight) => ({ part, offset: new THREE.Vector3(x, y, z), weight });
    if (this.slideT > 0 && P.slide) {
      // 滑套后坐（有 slide 部件即适用），结束时精确归位
      this.slideT = Math.max(0, this.slideT - dt);
      P.slide.position.z = R.slide.p.z + this.slideT * 0.5;
    }
    const a = this.anim;
    if (a) {
      a.t += dt;
      const f = Math.min(1, a.t / a.dur);
      if (a.type === 'reload') {
        const tilt = ease(seg(f, 0, 0.15)) * (1 - ease(seg(f, 0.85, 1)));
        rz += tilt * 0.45; rx += tilt * 0.18; py += tilt * 0.055; px -= tilt * 0.02;
        if (P.mag) {
          const out = ease(seg(f, 0.15, 0.3)), gone = seg(f, 0.3, 0.42), back = ease(seg(f, 0.42, 0.62)), seat = seg(f, 0.62, 0.7);
          const mp = R.mag.p;
          if (f < 0.3) { P.mag.position.set(mp.x, mp.y - out * 0.12, mp.z + out * 0.02); P.mag.visible = true; }
          else if (f < 0.42) { P.mag.position.set(mp.x, mp.y - 0.12 - gone * 0.4, mp.z); P.mag.visible = gone < 0.95; }
          else { P.mag.visible = true; P.mag.position.set(mp.x, mp.y - (1 - back) * 0.2 - (1 - seat) * 0.015, mp.z + (1 - back) * 0.025); }
          // 后置弹匣向下后方退出；P90 顶装弹匣向上提起再压入。
          const style = WEAPONS[id]?.reloadStyle;
          if (style === 'top') {
            const lift = f < 0.3 ? out * 0.13 : f < 0.42 ? 0.13 + gone * 0.24 : (1 - back) * 0.23 + (1 - seat) * 0.012;
            P.mag.position.set(mp.x - lift * 0.2, mp.y + lift, mp.z + lift * 0.15);
            rz -= tilt * 0.3;
          } else if (style === 'bullpup') {
            const distance = mp.y - P.mag.position.y;
            P.mag.position.x = mp.x - distance * 0.28;
            P.mag.position.z = mp.z + distance * 0.35;
            ry -= tilt * 0.12;
          }
          const reach = ease(seg(f, 0.1, 0.17)) * (1 - ease(seg(f, 0.68, 0.78)));
          if (reach > 0) handLTarget = P.reloadGrip
            ? handTarget(P.reloadGrip, 0, 0, 0, reach)
            : handTarget(P.mag, 0, -0.055, 0.01, reach);
          if (f > 0.62 && f < 0.7) { this.kickRot -= dt * 0.8; }
        }
        if (a.empty && P.bolt && f > 0.74 && f < 0.92) {
          const bf = seg(f, 0.74, 0.92), pull = Math.sin(bf * Math.PI);
          P.bolt.position.z = R.bolt.p.z + pull * 0.07;
          const target = handTarget(P.boltGrip || P.boltHandle || P.bolt, 0, 0, 0, pull);
          if (WEAPONS[id]?.boltAction) handRTarget = target;
          else handLTarget = target;
          rz -= pull * 0.1;
        } else if (P.bolt && R.bolt) P.bolt.position.z = R.bolt.p.z;
        // 空仓换弹末尾释放套筒：按能力判断（有 slide 部件 + 空仓），行程按类别取
        if (P.slide && a.empty) {
          P.slide.position.z = R.slide.p.z + pick(SLIDE_RELEASE, id, 0.03) * (1 - ease(seg(f, 0.82, 0.91)));
          const reach = ease(seg(f, 0.75, 0.8)) * (1 - ease(seg(f, 0.89, 0.95)));
          if (reach > 0) handLTarget = handTarget(P.slide, -0.024, 0.065, 0.01, reach);
        }
      } else if (a.type === 'bolt' && P.bolt) {
        const f2 = seg(f, 0.15, 0.85);
        const up = ease(seg(f2, 0, 0.2)) * (1 - ease(seg(f2, 0.8, 1)));
        const backK = ease(seg(f2, 0.2, 0.45)) * (1 - ease(seg(f2, 0.55, 0.8)));
        P.bolt.rotation.z = R.bolt.r.z + up * 1.2; P.bolt.position.z = R.bolt.p.z + backK * 0.09;
        rz += Math.sin(f2 * Math.PI) * 0.18; rx += Math.sin(f2 * Math.PI) * 0.06; py -= Math.sin(f2 * Math.PI) * 0.015;
        const reach = ease(seg(f2, 0, 0.12)) * (1 - ease(seg(f2, 0.86, 1)));
        if (reach > 0) handRTarget = handTarget(P.boltGrip || P.boltHandle || P.bolt, 0, 0, 0, reach);
        if (backK > 0.5 && !a.ejected) { a.ejected = true; this.ejectShell(); }
      } else if (a.type === 'slash') {
        const s = Math.sin(f * Math.PI), dir = a.dir;
        ry -= dir * s * 1.1; rz += dir * s * -0.6; px += dir * Math.sin(f * Math.PI * 2) * 0.06; pz -= s * 0.08; rx += s * 0.3;
      } else if (a.type === 'stab') {
        const wind = ease(seg(f, 0, 0.35)), thrust = ease(seg(f, 0.35, 0.55)), ret = ease(seg(f, 0.65, 1));
        pz += wind * 0.08 - thrust * 0.22 + ret * 0.14; rx += wind * -0.4 + thrust * 0.9 - ret * 0.5; py += wind * 0.05 - thrust * 0.04 - ret * 0.01;
      } else if (a.type === 'throw') {
        const pin = seg(f, 0, 0.3), wind = ease(seg(f, 0.3, 0.55)), thr = ease(seg(f, 0.55, 0.8));
        if (P.pin) { P.pin.visible = pin < 0.6; }
        if (pin < 1) handLTarget = handTarget(this.cur, 0.03, 0.06, 0, 1 - ease(seg(pin, 0.7, 1)));
        py += wind * 0.08 - thr * 0.12; pz += wind * 0.1 - thr * 0.3; rx += wind * 0.8 - thr * 1.6;
        if (f > 0.72) this.cur.visible = false;
      } else if (a.type === 'inspect') {
        const s1 = ease(seg(f, 0, 0.25)) * (1 - ease(seg(f, 0.8, 1)));
        const s2 = ease(seg(f, 0.4, 0.6)) * (1 - ease(seg(f, 0.8, 1)));
        if (id === 'knife') {
          ry -= s1 * 0.25 - s2 * 0.35; rz += s1 * 0.28; px -= s1 * 0.1; py += s1 * 0.03; rx += s2 * 0.15;
        } else { ry += s1 * 0.9 - s2 * 1.1; rz += s1 * 0.5; px -= s1 * 0.08; py += s1 * 0.04; rx += s2 * 0.3; }
      }
      if (f >= 1) { this.anim = null; this.resetParts(); if (a.type === 'throw') this.cur.visible = false; }
    }
    this.holder.position.set(px, py, pz);
    this.holder.rotation.set(rx, ry, rz);
    this.holder.updateMatrixWorld(true);
    // 手臂 IK（简化：前臂从固定肘点指向手）
    const gp = P.grip ? P.grip.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3(px, py, pz);
    const fp = P.fore ? P.fore.getWorldPosition(new THREE.Vector3()) : null;
    const resolveHand = (base, target) => target ? base.clone().lerp(target.part.localToWorld(target.offset), target.weight) : base;
    this.placeArm('R', resolveHand(gp, handRTarget), true);
    if (id === 'knife' || (id === 'he' && !handLTarget)) this.arms.L.g.visible = false;
    else { this.arms.L.g.visible = true; this.placeArm('L', resolveHand(fp || gp, handLTarget), false); }
    // 枪口火焰
    if (this.flashT > 0) {
      this.flashT -= dt;
      if (this.flashT <= 0) this.flash.visible = false;
      this.flash.getWorldPosition(this.muzzleLight.position);
      this.muzzleLight.intensity = this.flashT > 0 ? 3 : 0;
    }
    // 弹壳
    for (const s of this.shells) {
      if (s.life <= 0) continue;
      s.life -= dt;
      s.v.y -= 9.8 * dt;
      s.mesh.position.addScaledVector(s.v, dt);
      s.mesh.rotation.x += s.w.x * dt; s.mesh.rotation.y += s.w.y * dt;
      if (s.life <= 0) s.mesh.visible = false;
    }
    // 光照
    if (st.sunDirCam) this.sun.position.copy(st.sunDirCam);
    this.sun.intensity = 2.6 * (st.light ?? 1);
    this.fill.intensity = 0.35 * (st.indoor ? 0.5 : 1);
  }
  placeArm(s, handPos, right) {
    const A = this.arms[s];
    A.hand.position.copy(handPos);
    A.hand.quaternion.copy(this.holder.quaternion);
    A.hand.rotateX(right ? -0.24 : 0.22);
    const broadSupport = !right && ['rifle', 'smg', 'sniper'].includes(wtype(this.id));
    const cup = right && this.id === 'he';
    A.glove.scale.x = cup ? 1.22 : broadSupport ? 1.18 : 1;
    A.glove.position.x = cup ? 0.009 : broadSupport ? -0.006 : 0;
    A.hand.updateWorldMatrix(true, false);
    const wristX = (right ? 0.031 : -0.031) * A.glove.scale.x + A.glove.position.x;
    const wrist = A.hand.localToWorld(new THREE.Vector3(wristX, -0.048, 0.019));
    const E = this.elbow[s].clone();
    const hp = (HIP[this.id] || HIP.ak47).p;
    E.x += (this.holder.position.x - hp[0]) * 0.6; E.y += (this.holder.position.y - hp[1]) * 0.6; E.z += (this.holder.position.z - hp[2]) * 0.5;
    if (s === 'L' && wtype(this.id) === 'pistol') E.set(0.0, -0.46, -0.3); // 手枪：左手托握肘位更靠内
    const dir = wrist.clone().sub(E);
    const L = dir.length(); dir.normalize();
    const mid = E.clone().add(wrist).multiplyScalar(0.5);
    A.fore.position.copy(mid);
    A.fore.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    A.fore.scale.set(1, Math.max(0.2, L / 0.364), 1);
    A.cuff.position.copy(wrist).addScaledVector(dir, -0.014);
    A.cuff.quaternion.copy(A.fore.quaternion);
  }
}
