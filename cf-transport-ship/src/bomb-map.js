// 通用爆破测试场，仅用于验证规则和机器人任务，不代表 CF 沙漠灰布局。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32 } from './textures.js';

const BOUNDS = {
  minX: -26,
  minZ: -20,
  maxX: 26,
  maxZ: 20,
};

function stoneTexture(kind) {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const rnd = mulberry32(kind === 'wall' ? 48171 : 8234);
  ctx.fillStyle = kind === 'wall' ? '#bda889' : '#c6b497';
  ctx.fillRect(0, 0, 256, 256);
  if (kind === 'wall') {
    // 低对比石砖和错缝，避免高频纹理盖过轮廓。
    for (let row = 0; row < 4; row++) {
      const offset = row % 2 ? -64 : 0;
      for (let col = 0; col < 3; col++) {
        const value = 166 + Math.floor(rnd() * 18);
        ctx.fillStyle = `rgb(${value + 26},${value + 8},${value - 20})`;
        ctx.fillRect(offset + col * 128 + 2, row * 64 + 2, 124, 60);
      }
    }
  } else {
    ctx.strokeStyle = 'rgba(110,91,69,.15)';
    ctx.lineWidth = 2;
    for (let i = 0; i <= 4; i++) {
      ctx.beginPath();
      ctx.moveTo(i * 64, 0);
      ctx.lineTo(i * 64, 256);
      ctx.moveTo(0, i * 64);
      ctx.lineTo(256, i * 64);
      ctx.stroke();
    }
  }
  for (let i = 0; i < 4500; i++) {
    ctx.fillStyle = rnd() < 0.5 ? 'rgba(58,41,20,.035)' : 'rgba(255,246,220,.06)';
    ctx.fillRect(rnd() * 256, rnd() * 256, 1 + rnd() * 2, 1);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  return texture;
}

export function buildBombMap(scene, T, world) {
  const root = new THREE.Group();
  root.name = 'bomb-test';
  scene.add(root);
  const ownTextures = [];
  const wallMap = stoneTexture('wall');
  const floorMap = stoneTexture('floor');
  if (wallMap) ownTextures.push(wallMap);
  if (floorMap) ownTextures.push(floorMap);
  const materials = {
    wall: new THREE.MeshStandardMaterial({
      color: 0xe4d5bb,
      map: wallMap,
      roughness: 0.95,
      metalness: 0,
    }),
    floor: new THREE.MeshStandardMaterial({
      color: 0xe4d7bf,
      map: floorMap,
      roughness: 0.96,
      metalness: 0,
    }),
    trim: new THREE.MeshStandardMaterial({
      color: 0x897966,
      roughness: 0.92,
      metalness: 0,
    }),
    wood: new THREE.MeshStandardMaterial({
      color: 0xc6ad85,
      map: T?.crates?.find((c) => c.kind === 'wood')?.map || T?.crates?.[1]?.map || null,
      roughness: 0.85,
      metalness: 0,
    }),
    metal: new THREE.MeshStandardMaterial({
      color: 0x627473,
      roughness: 0.65,
      metalness: 0.35,
    }),
    markA: new THREE.MeshStandardMaterial({
      color: 0xc9753c,
      roughness: 0.9,
      metalness: 0,
    }),
    markB: new THREE.MeshStandardMaterial({
      color: 0x4e929b,
      roughness: 0.9,
      metalness: 0,
    }),
  };
  const batches = new Map();
  const geometries = new Set();
  const meshes = [];
  const matrix = new THREE.Matrix4();
  const rotation = new THREE.Euler();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3(1, 1, 1);
  const position = new THREE.Vector3();

  function geometry(geo, key, x, y, z, rx = 0, ry = 0, rz = 0) {
    rotation.set(rx, ry, rz);
    quaternion.setFromEuler(rotation);
    matrix.compose(position.set(x, y, z), quaternion, scale);
    geo.applyMatrix4(matrix);
    let batch = batches.get(key);
    if (!batch) batches.set(key, batch = []);
    batch.push(geo);
  }

  // 实体盒体与碰撞使用同一组尺寸。条纹、标识等贴面装饰不另加碰撞。
  function box(x, y, z, sx, sy, sz, key, solid = true, props = {}) {
    const geo = new THREE.BoxGeometry(sx, sy, sz);
    if (key === 'wall' || key === 'floor') {
      const uv = geo.attributes.uv;
      const tile = key === 'wall' ? 2.8 : 4;
      const faces = [[sz, sy], [sz, sy], [sx, sz], [sx, sz], [sx, sy], [sx, sy]];
      for (let face = 0; face < 6; face++) {
        for (let i = face * 4; i < face * 4 + 4; i++) {
          uv.setXY(i, uv.getX(i) * faces[face][0] / tile, uv.getY(i) * faces[face][1] / tile);
        }
      }
    }
    geometry(geo, key, x, y, z);
    if (solid) world.add({
      x,
      y,
      z,
      sx,
      sy,
      sz,
      mat: key === 'wood' ? 'wood' : 'stone',
      surface: key === 'wood' ? 'wood' : 'concrete',
      ...props,
    });
  }

  // 地面和外墙封闭场地；地图没有楼梯或隐藏的第二导航层。
  box(0, -0.3, 0, 62, 0.6, 50, 'floor');
  box(-26.5, 2.4, 0, 1, 4.8, 42, 'wall');
  box(26.5, 2.4, 0, 1, 4.8, 42, 'wall');
  box(0, 2.4, -20.5, 52, 4.8, 1, 'wall');
  box(0, 2.4, 20.5, 52, 4.8, 1, 'wall');

  // 双外路与中路相连。X 5..9 的开口允许中路切入包点方向。
  for (const z of [-6, 6]) {
    box(-7, 1.65, z, 24, 3.3, 0.8, 'wall');
    box(14, 1.65, z, 10, 3.3, 0.8, 'wall');
    for (const x of [-18.7, 4.7, 9.3, 18.7]) box(x, 1.7, z, 0.65, 3.4, 1, 'trim');
    box(-7, 3.4, z, 24, 0.2, 1, 'trim');
    box(14, 3.4, z, 10, 0.2, 1, 'trim');
  }

  // 错位掩体保留两侧绕行空间，包点中心不会被装饰占用。
  const covers = [
    { x: -11, z: -15, sx: 2.4, sy: 1.8, sz: 2.4, key: 'wood' },
    { x: -4, z: -9.6, sx: 2.8, sy: 2.1, sz: 2.4, key: 'wood' },
    { x: 5, z: -17, sx: 3, sy: 1.5, sz: 2.4, key: 'metal' },
    { x: -9, z: 10, sx: 2.6, sy: 2.1, sz: 2.6, key: 'wood' },
    { x: 0, z: 17, sx: 3, sy: 1.5, sz: 2.4, key: 'metal' },
    { x: 8, z: 9.5, sx: 2.8, sy: 1.8, sz: 2.4, key: 'wood' },
    { x: -9, z: -1.3, sx: 3, sy: 1.6, sz: 2.6, key: 'wood' },
    { x: 1, z: 2, sx: 3.2, sy: 2.4, sz: 2.5, key: 'wall' },
    { x: 12, z: -1.5, sx: 2.8, sy: 1.8, sz: 2.6, key: 'metal' },
    { x: 20, z: -17, sx: 2.5, sy: 1.8, sz: 2.5, key: 'wood' },
    { x: 20, z: 17, sx: 2.5, sy: 1.8, sz: 2.5, key: 'wood' },
  ];
  for (const cover of covers) {
    box(cover.x, cover.sy / 2, cover.z, cover.sx, cover.sy, cover.sz, cover.key);
    if (cover.key === 'metal') {
      // 加固条嵌在实体内，不产生模型外的额外障碍。
      for (const offset of [-0.8, 0.8]) {
        box(cover.x + offset, cover.sy / 2, cover.z, 0.12, cover.sy, cover.sz + 0.008, 'trim', false);
      }
    }
  }

  const sites = [
    { id: 'A', label: 'A区', x: 15, y: 0, z: -13, radius: 3 },
    { id: 'B', label: 'B区', x: 15, y: 0, z: 13, radius: 3 },
  ];
  for (const site of sites) {
    const key = site.id === 'A' ? 'markA' : 'markB';
    geometry(new THREE.RingGeometry(2.86, site.radius, 48), key, site.x, 0.015, site.z, -Math.PI / 2);
    for (const dz of [-1.1, 1.1]) box(site.x, 0.018, site.z + dz, 1.8, 0.016, 0.12, key, false);
    for (const dx of [-0.84, 0.84]) box(site.x + dx, 0.018, site.z, 0.12, 0.016, 2.3, key, false);
    sign(site.id, 25.96, 2.5, site.z, -Math.PI / 2, key);
    sign(site.id, -15, 2.2, site.z < 0 ? -6.411 : 6.411, site.z < 0 ? Math.PI : 0, key);
  }
  sign('ATTACK', -25.96, 2.5, 0, Math.PI / 2, 'markA');
  sign('DEFEND', 25.96, 2.5, 0, -Math.PI / 2, 'markB');
  sign('TEST FIELD', 0, 3, -19.96, 0, 'trim');

  function sign(label, x, y, z, yaw, key) {
    if (typeof document === 'undefined') return;
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = label.length === 1 ? '#d2c3a9' : '#ad9d83';
    ctx.fillRect(0, 0, 512, 256);
    ctx.strokeStyle = '#675746';
    ctx.lineWidth = 12;
    ctx.strokeRect(10, 10, 492, 236);
    ctx.fillStyle = key === 'markA' ? '#9a4721' : key === 'markB' ? '#2c6672' : '#493e32';
    ctx.font = `bold ${label.length === 1 ? 184 : 60}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, 256, 136);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    ownTextures.push(texture);
    const material = new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 0.92,
      metalness: 0,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    materials[`sign${ownTextures.length}`] = material;
    geometry(new THREE.PlaneGeometry(label.length === 1 ? 2 : 4, label.length === 1 ? 1 : 2), `sign${ownTextures.length}`, x, y, z, 0, yaw);
  }

  for (const [key, batch] of batches) {
    const geo = mergeGeometries(batch, false);
    for (const input of batch) input.dispose();
    geo.computeBoundingSphere();
    geometries.add(geo);
    const mesh = new THREE.Mesh(geo, materials[key]);
    mesh.castShadow = key !== 'floor' && !key.startsWith('sign') && !key.startsWith('mark');
    mesh.receiveShadow = true;
    root.add(mesh);
    meshes.push(mesh);
  }
  world.build();

  const spawn = (x, yaw) => [-4, -2, 0, 2, 4].map((z) => ({ x, y: 0.02, z, yaw }));
  let disposed = false;
  return {
    id: 'bomb-test',
    name: '爆破测试场',
    root,
    meshes,
    materials,
    spawns: {
      attack: spawn(-22, -Math.PI / 2),
      defend: spawn(22, Math.PI / 2),
    },
    sites,
    navBounds: [BOUNDS.minX, BOUNDS.minZ, BOUNDS.maxX, BOUNDS.maxZ],
    radarBounds: { ...BOUNDS },
    spectator: {
      x: -8,
      y: 13,
      z: 0,
      lookX: 13,
      lookY: 1.3,
      lookZ: 0,
    },
    lampSpots: [],
    funnelTop: null,
    update() {},
    dispose() {
      if (disposed) return;
      disposed = true;
      root.removeFromParent();
      for (const geo of geometries) geo.dispose();
      for (const material of Object.values(materials)) material.dispose();
      for (const texture of ownTextures) texture.dispose();
      root.clear();
    },
  };
}
