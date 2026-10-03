// 沙漠灰风格的原创沙城，单层布局；不宣称还原任何官方版本。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { DESERT_LAYOUT, desertBoxes } from './desert-layout.js';

export function buildDesertMap(scene, T, world) {
  const data = DESERT_LAYOUT;
  const boxes = desertBoxes(data);
  const root = new THREE.Group();
  root.name = data.id;
  scene.add(root);
  const ownedTextures = [];
  // 程序纹理独立拥有；T 的木箱纹理只是借用，卸载地图不释放它。
  const texture = (paint, size = 256, repeat = true) => {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    paint(ctx, size);
    const map = new THREE.CanvasTexture(canvas);
    map.colorSpace = THREE.SRGBColorSpace;
    if (repeat) map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.anisotropy = 4;
    ownedTextures.push(map);
    return map;
  };
  const wallMap = texture((ctx, size) => {
    ctx.fillStyle = '#cdbb94'; ctx.fillRect(0, 0, size, size);
    for (let row = 0; row < 4; row++) {
      const offset = row % 2 ? -64 : 0;
      for (let col = 0; col < 3; col++) {
        const x = col * 128 + offset, y = row * 64;
        ctx.fillStyle = ['#d6c6a4', '#cbbb98', '#c6b68f'][(row + col) % 3];
        ctx.fillRect(x + 2, y + 2, 124, 60);
        ctx.strokeStyle = '#b7a57f'; ctx.lineWidth = 2; ctx.strokeRect(x, y, 128, 64);
      }
    }
    for (let i = 0; i < 640; i++) {
      const x = (i * 97 + 13) % size, y = (i * 61 + Math.floor(i / 17)) % size;
      ctx.fillStyle = i % 2 ? 'rgba(105,85,56,.09)' : 'rgba(255,245,219,.13)';
      ctx.fillRect(x, y, 2, 1);
    }
  });
  const groundMap = texture((ctx, size) => {
    ctx.fillStyle = '#c5b698'; ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 1200; i++) {
      ctx.fillStyle = i % 3 ? 'rgba(145,126,91,.13)' : 'rgba(232,219,185,.22)';
      ctx.fillRect((i * 59) % size, (i * 103 + Math.floor(i / 13)) % size, 2, 2);
    }
    ctx.strokeStyle = 'rgba(114,98,73,.16)'; ctx.lineWidth = 1;
    for (let y = 0; y <= size; y += 64) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(size, y); ctx.stroke(); }
    for (let x = 0; x <= size; x += 64) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, size); ctx.stroke(); }
  });
  const doorMap = texture((ctx, size) => {
    ctx.fillStyle = '#806044'; ctx.fillRect(0, 0, size, size);
    for (let x = 0; x < size; x += 32) {
      ctx.fillStyle = x % 64 ? '#907050' : '#826347'; ctx.fillRect(x + 2, 0, 28, size);
      ctx.strokeStyle = '#624b36'; ctx.lineWidth = 2; ctx.strokeRect(x, 0, 32, size);
      ctx.strokeStyle = 'rgba(48,35,22,.2)'; ctx.beginPath(); ctx.moveTo(x + 11, 0); ctx.lineTo(x + 15, size); ctx.stroke();
    }
    ctx.fillStyle = '#383b36'; ctx.fillRect(0, 46, size, 10); ctx.fillRect(0, 190, size, 10);
  });
  const cloth = (base, stripe) => texture((ctx, size) => {
    ctx.fillStyle = base; ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = stripe;
    for (let x = 0; x < size; x += 64) ctx.fillRect(x, 0, 32, size);
  });
  const materials = {
    sandstone: new THREE.MeshStandardMaterial({ color: 0xf0ddbc, roughness: 0.96, map: wallMap }),
    arch: new THREE.MeshStandardMaterial({ color: 0xe4cfaa, roughness: 0.97, map: wallMap }),
    floor: new THREE.MeshStandardMaterial({ color: 0xefe6ce, roughness: 0.98, map: groundMap }),
    wood: new THREE.MeshStandardMaterial({ color: 0xa48960, roughness: 0.92, map: T?.crates?.find((c) => c.kind === 'wood')?.map || doorMap }),
    door: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, map: doorMap }),
    trim: new THREE.MeshStandardMaterial({ color: 0xbca582, roughness: 0.95 }),
    window: new THREE.MeshStandardMaterial({ color: 0x2f4948, roughness: 0.88 }),
    iron: new THREE.MeshStandardMaterial({ color: 0x464541, roughness: 0.7, metalness: 0.2 }),
    clothRed: new THREE.MeshStandardMaterial({ color: 0xe9d5b0, roughness: 1, map: cloth('#aa644d', '#c79873') }),
    clothBlue: new THREE.MeshStandardMaterial({ color: 0xe9d5b0, roughness: 1, map: cloth('#597b77', '#a1b4a1') }),
    signBoard: new THREE.MeshStandardMaterial({ color: 0xe3d4b6, roughness: 0.92 }),
    markA: new THREE.MeshStandardMaterial({ color: 0xb66b39, roughness: 0.95 }),
    markB: new THREE.MeshStandardMaterial({ color: 0x4c8583, roughness: 0.95 }),
  };
  const labels = [...data.signs.map((s) => s.text), 'A', 'B'];
  const atlas = texture((ctx, size) => {
    const cell = size / 4;
    ctx.clearRect(0, 0, size, size);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    labels.forEach((text, i) => {
      ctx.fillStyle = text.startsWith('A') ? '#9d5129' : text.includes('B') ? '#2e6665' : '#584c3c';
      ctx.font = `700 ${text.length === 1 ? 190 : 170}px sans-serif`;
      ctx.fillText(text, (i % 4 + 0.5) * cell, (Math.floor(i / 4) + 0.5) * cell, cell - 16);
    });
  }, 1024, false);
  if (atlas) materials.letters = new THREE.MeshStandardMaterial({ map: atlas, transparent: true, alphaTest: 0.1, roughness: 1, depthWrite: false });

  const batches = new Map();
  const geometries = new Set();
  const meshes = [];
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3(1, 1, 1);
  const rotation = new THREE.Euler();
  const addGeometry = (geo, kind, x, y, z, rx = 0, ry = 0, rz = 0) => {
    quaternion.setFromEuler(rotation.set(rx, ry, rz));
    geo.applyMatrix4(matrix.compose(position.set(x, y, z), quaternion, scale));
    if (!batches.has(kind)) batches.set(kind, []);
    batches.get(kind).push(geo);
  };
  for (const box of boxes) {
    const geo = new THREE.BoxGeometry(box.sx, box.sy, box.sz);
    if (['sandstone', 'arch', 'floor', 'door', 'clothRed', 'clothBlue'].includes(box.kind)) {
      const p = geo.getAttribute('position'), n = geo.getAttribute('normal'), uv = geo.getAttribute('uv');
      const tile = box.kind === 'floor' ? 4 : box.kind === 'door' ? 3 : 2;
      for (let i = 0; i < uv.count; i++) {
        const u = Math.abs(n.getX(i)) > 0.5 ? p.getZ(i) : p.getX(i);
        const v = Math.abs(n.getY(i)) > 0.5 ? p.getZ(i) : p.getY(i);
        uv.setXY(i, u / tile, v / tile);
      }
    }
    addGeometry(geo, box.kind, box.x, box.y, box.z, 0, box.yaw || 0);
    const wood = box.kind === 'wood' || box.kind === 'door';
    world.add({ ...box, mat: wood ? 'wood' : 'concrete', surface: wood ? 'wood' : 'concrete', tag: box.id });
  }
  const label = (index, x, y, z, width, height, rx = 0, ry = 0) => {
    if (!atlas) return;
    const geo = new THREE.PlaneGeometry(width, height);
    const uv = geo.getAttribute('uv');
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (index % 4 + uv.getX(i)) / 4, (3 - Math.floor(index / 4) + uv.getY(i)) / 4);
    addGeometry(geo, 'letters', x, y, z, rx, ry);
  };
  data.signs.forEach((sign, i) => label(i, sign.x + Math.sin(sign.yaw) * 0.028, sign.y, sign.z + Math.cos(sign.yaw) * 0.028, sign.width, sign.height, 0, sign.yaw));
  for (const [i, site] of data.sites.entries()) {
    const kind = site.id === 'A' ? 'markA' : 'markB';
    addGeometry(new THREE.RingGeometry(site.radius - 0.12, site.radius, 64), kind, site.x, 0.015, site.z, -Math.PI / 2);
    label(data.signs.length + i, site.x, 0.02, site.z, 2.6, 2.6, -Math.PI / 2);
  }
  for (const [kind, batch] of batches) {
    const geo = mergeGeometries(batch, false);
    for (const input of batch) input.dispose();
    geo.computeBoundingSphere();
    geometries.add(geo);
    const mesh = new THREE.Mesh(geo, materials[kind]);
    mesh.name = `desert-${kind}`;
    mesh.castShadow = kind !== 'floor' && kind !== 'letters' && !kind.startsWith('mark');
    mesh.receiveShadow = true;
    root.add(mesh);
    meshes.push(mesh);
  }
  world.build();
  const maxHeight = Math.max(...boxes.map((box) => box.y + box.sy / 2));
  let disposed = false;
  return {
    id: data.id,
    name: data.name,
    description: data.description,
    root,
    meshes,
    materials,
    spawns: Object.fromEntries(Object.entries(data.spawns).map(([role, points]) => [role, points.map((point) => ({ ...point }))])),
    sites: data.sites.map((site) => ({ ...site })),
    navBounds: [data.bounds.minX, data.bounds.minZ, data.bounds.maxX, data.bounds.maxZ],
    radarBounds: { ...data.bounds },
    spectator: { ...data.spectator },
    shadowBounds: [[data.bounds.minX, data.bounds.maxX], [-1, maxHeight + 2], [data.bounds.minZ, data.bounds.maxZ]],
    lampSpots: [],
    funnelTop: null,
    update() {},
    dispose() {
      if (disposed) return;
      disposed = true;
      root.removeFromParent();
      for (const geo of geometries) geo.dispose();
      for (const material of Object.values(materials)) material.dispose();
      for (const map of ownedTextures) map.dispose();
      root.clear();
    },
  };
}
