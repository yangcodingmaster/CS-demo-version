import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildDesertMap } from '../src/desert-map.js';
import { DESERT_LAYOUT, desertBoxes } from '../src/desert-layout.js';
import { World, NavGrid } from '../src/physics.js';
import { STAND_H, EYE_STAND, EYE_CROUCH } from '../src/actor.js';

function fixture() {
  const scene = new THREE.Scene();
  const world = new World();
  const map = buildDesertMap(scene, {}, world);
  const nav = new NavGrid(world, ...map.navBounds, 0.5, 0.42);
  return { scene, world, map, nav };
}

function legal(world, nav, x, z, label) {
  assert.ok(nav.walkable(nav.idx(x, z)), `${label} 不是可走网格，不能靠 nearestFree 假通过`);
  assert.equal(world.blocked(x, 0, z, 0.36, STAND_H), false, `${label} 站立胶囊被实体占用`);
  assert.equal(world.support(x, z, 0.36, 0.42)?.y, 0, `${label} 没有连续 y=0 地面`);
}

function pathLength(start, path) {
  let length = 0, old = start;
  for (const point of path) {
    length += Math.hypot(point[0] - old[0], point[1] - old[1]);
    old = point;
  }
  return length;
}

// 用实际移动碰撞走完 Nav 路径，检测拉直段贴墙、门洞顶头或地面缺口。
// 这里直接驱动胶囊，不替代浏览器中的真实 Bot 转向与战斗验收。
function walk(world, start, path, label) {
  const ent = {
    pos: new THREE.Vector3(start[0], 0, start[1]),
    vel: new THREE.Vector3(),
    radius: 0.36,
    height: STAND_H,
    stepHeight: 0.42,
    onGround: true,
  };
  const dt = 0.025;
  let ticks = 0;
  for (const [x, z] of path) {
    let distance;
    while ((distance = Math.hypot(x - ent.pos.x, z - ent.pos.z)) > 0.1) {
      assert.ok(ticks++ < 9000, `${label} 胶囊卡在 ${ent.pos.x.toFixed(2)},${ent.pos.z.toFixed(2)}，目标 ${x},${z}`);
      const speed = Math.min(5.7, distance / dt);
      ent.vel.set((x - ent.pos.x) / distance * speed, ent.vel.y - 19 * dt, (z - ent.pos.z) / distance * speed);
      world.move(ent, dt);
      assert.ok(Number.isFinite(ent.pos.x + ent.pos.y + ent.pos.z), `${label} 移动出现非有限位置`);
      assert.ok(Math.abs(ent.pos.y) < 0.001, `${label} 必经路线依赖高低差或失去地面`);
    }
  }
  return ent.pos;
}

test('沙城的十个出生点、两个包点合法，二十条路线和 A/B 回防互通可实际步行', () => {
  const { map, world, nav } = fixture();
  try {
    assert.equal(map.id, 'desert-gray');
    assert.equal(map.name, '沙城');
    assert.match(map.description, /原创.*非官方/);
    assert.equal(map.spawns.attack.length, 5);
    assert.equal(map.spawns.defend.length, 5);
    const spawns = Object.values(map.spawns).flat();
    assert.equal(new Set(spawns.map((p) => `${p.x},${p.z}`)).size, 10);
    for (const [i, spawn] of spawns.entries()) {
      legal(world, nav, spawn.x, spawn.z, `出生 ${i}`);
      for (const site of map.sites) {
        legal(world, nav, site.x, site.z, `包点 ${site.id}`);
        assert.ok(Math.hypot(spawn.x - site.x, spawn.z - site.z) > site.radius + 8, '出生区不能位于安包区附近');
        const path = nav.findPath(spawn.x, spawn.z, site.x, site.z);
        assert.ok(path?.length, `出生 ${i} 无法到达 ${site.id}`);
        assert.deepEqual(path.at(-1), [site.x, site.z]);
        const end = walk(world, [spawn.x, spawn.z], path, `出生 ${i} 到 ${site.id}`);
        assert.ok(Math.hypot(end.x - site.x, end.z - site.z) < 0.15);
      }
    }
    for (const [a, b] of [[map.sites[0], map.sites[1]], [map.sites[1], map.sites[0]]]) {
      const path = nav.findPath(a.x, a.z, b.x, b.z);
      assert.ok(path?.length, `${a.id} 到 ${b.id} 不通`);
      walk(world, [a.x, a.z], path, `${a.id} 到 ${b.id}`);
    }
  } finally { map.dispose(); }
});

test('二十五组出生点在站立/蹲伏高度均不能直线互射或互相看见', () => {
  const { map, world } = fixture();
  try {
    for (const mode of ['bullet', 'sight']) for (const eye of [EYE_STAND, EYE_CROUCH]) {
      for (const a of map.spawns.attack) for (const b of map.spawns.defend) {
        const length = Math.hypot(b.x - a.x, b.z - a.z);
        const hit = world.raycast(a.x, eye, a.z, (b.x - a.x) / length, 0, (b.z - a.z) / length, length, mode);
        assert.ok(hit, `出生 ${a.x}→${b.x} 在高度 ${eye} 出现 ${mode} 直通`);
        assert.ok(hit.t > 0.36 && hit.t < length - 0.36, '遮挡不能依赖出生点自身埋在墙里');
      }
    }
  } finally { map.dispose(); }
});

test('A/B 三米安包圆及所有门洞保留站立空间，字牌不会堵住入口', () => {
  const { map, world, nav } = fixture();
  try {
    for (const site of map.sites) {
      for (const radius of [0, 1.5, site.radius]) for (let i = 0; i < 32; i++) {
        const angle = Math.PI * 2 * i / 32;
        legal(world, nav, site.x + Math.cos(angle) * radius, site.z + Math.sin(angle) * radius, `${site.id} 圆内采样`);
      }
    }
    for (const gate of DESERT_LAYOUT.gates) {
      for (let offset = -gate.width / 2 + 0.6; offset <= gate.width / 2 - 0.6; offset += 0.25) {
        const x = gate.x + (gate.axis === 'x' ? offset : 0), z = gate.z + (gate.axis === 'z' ? offset : 0);
        assert.equal(world.blocked(x, 0, z, 0.36, STAND_H), false, `${gate.id} 门洞被实体/招牌挡住`);
      }
    }
  } finally { map.dispose(); }
});

test('长道、小道和北回防的分段路线连续，中心出生的小道比外侧长道更短', (t) => {
  const { map, world, nav } = fixture();
  try {
    const lengths = {};
    for (const [id, route] of Object.entries(DESERT_LAYOUT.routes)) {
      const start = id === 'northRotate' ? route[0] : [0, 28];
      let old = start;
      lengths[id] = 0;
      for (const point of route) {
        legal(world, nav, ...point, `${id} ${point}`);
        const path = nav.findPath(...old, ...point);
        assert.ok(path?.length, `${id} 的分段无法连通`);
        lengths[id] += pathLength(old, path);
        walk(world, old, path, `${id} 分段 ${old}→${point}`);
        old = point;
      }
    }
    // 这些是分段走指定通道的真实 Nav 距离，不声称所有出生点的全局最短路都走小道。
    assert.ok(lengths.aShort < lengths.aLong - 1, `A 小道 ${lengths.aShort}m 没有比长道 ${lengths.aLong}m 更短`);
    assert.ok(lengths.bShort < lengths.bLong - 1, `B 小道 ${lengths.bShort}m 没有比长道 ${lengths.bLong}m 更短`);
    assert.ok(DESERT_LAYOUT.routes.aLong.some(([x]) => x > 33));
    assert.ok(DESERT_LAYOUT.routes.bLong.some(([x]) => x < -33));
    assert.ok(DESERT_LAYOUT.routes.aShort.some(([x, z]) => x === 20 && z === -13));
    assert.ok(DESERT_LAYOUT.routes.bShort.some(([x, z]) => x === -16.5 && z === -13));
    t.diagnostic(JSON.stringify(Object.fromEntries(Object.entries(lengths).map(([id, n]) => [id, +n.toFixed(2)]))));
  } finally { map.dispose(); }
});

test('箱体、棚柱和建筑细节落盘后，三处窄通道仍有至少三米实体净宽', (t) => {
  const { map, world, nav } = fixture();
  try {
    const probes = [
      { id: 'B 小巷', left: -17.5, right: -14, z: -8 },
      { id: 'A 长道棚柱/箱体', left: 31, right: 38, z: 8 },
      { id: 'B 长道棚柱/箱体', left: -38, right: -30, z: 8 },
    ];
    for (const { id, left, right, z } of probes) {
      let longest = 0, run = 0, end = left;
      for (let x = left; x <= right; x += 0.01) {
        if (world.blocked(x, 0, z, 0.005, STAND_H)) run = 0;
        else run += 0.01;
        if (run > longest) { longest = run; end = x; }
      }
      assert.ok(longest >= 3, `${id} 实体净宽仅 ${longest.toFixed(2)}m`);
      const mid = end - longest / 2;
      legal(world, nav, mid, z, id);
      t.diagnostic(`${id}: ${longest.toFixed(2)}m`);
    }
  } finally { map.dispose(); }
});

test('渲染盒体与碰撞逐项一致、合批数量有限，复用纹理不会被地图卸载释放', () => {
  const scene = new THREE.Scene(), world = new World(), borrowed = new THREE.Texture();
  let borrowedDisposed = 0;
  borrowed.addEventListener('dispose', () => borrowedDisposed++);
  const map = buildDesertMap(scene, { crates: [{ kind: 'wood', map: borrowed }] }, world);
  const boxes = desertBoxes();
  assert.equal(world.colliders.length, boxes.length);
  assert.ok(map.meshes.length <= 14, '装饰不应产生逐物体 draw call');
  for (const mesh of map.meshes) {
    assert.ok(mesh.material && mesh.geometry.getAttribute('position').count > 0);
    assert.ok(Number.isFinite(mesh.geometry.boundingSphere.radius));
  }
  for (const box of boxes) {
    const collider = world.colliders.find((c) => c.tag === box.id);
    assert.ok(collider, `${box.id} 没有碰撞`);
    assert.deepEqual([collider.x, collider.y, collider.z, collider.hx * 2, collider.hy * 2, collider.hz * 2], [box.x, box.y, box.z, box.sx, box.sy, box.sz]);
  }
  const maxHeight = Math.max(...world.colliders.map((c) => c.top));
  assert.equal(map.shadowBounds[1][1], maxHeight + 2);
  assert.equal(map.materials.wood.map, borrowed);
  let disposed = 0;
  for (const mesh of map.meshes) mesh.geometry.addEventListener('dispose', () => disposed++);
  for (const material of Object.values(map.materials)) material.addEventListener('dispose', () => disposed++);
  const expected = map.meshes.length + Object.keys(map.materials).length;
  map.dispose(); map.dispose();
  assert.equal(disposed, expected);
  assert.equal(borrowedDisposed, 0);
  assert.equal(scene.children.length, 0);
  borrowed.dispose();
});

test('地图返回的出生/包点数据独立，重开不污染共享布局', () => {
  const first = fixture();
  first.map.spawns.attack[0].x = 123;
  first.map.sites[0].x = 123;
  first.map.dispose();
  const second = fixture();
  try {
    assert.equal(second.map.spawns.attack[0].x, -8);
    assert.equal(second.map.sites[0].x, 25);
  } finally { second.map.dispose(); }
});
