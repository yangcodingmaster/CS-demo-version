// 枪械模型：程序化构建。局部坐标：枪口朝 -Z，上 +Y，右 +X，原点在握把上方
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { fbm, normalFromHeight } from './textures.js';

let M = null;
function wearTextures() {
  const S = 256;
  const n = fbm(S, S, 8, 8, 5, 4242);
  const c = document.createElement('canvas'); c.width = c.height = S;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(S, S);
  for (let i = 0; i < S * S; i++) {
    const v = 150 + n[i] * 105;
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const rough = new THREE.CanvasTexture(c); rough.wrapS = rough.wrapT = THREE.RepeatWrapping;
  const nrm = new THREE.CanvasTexture(normalFromHeight(n, S, S, 1.2)); nrm.wrapS = nrm.wrapT = THREE.RepeatWrapping;
  // 木纹
  const wc = document.createElement('canvas'); wc.width = wc.height = 256;
  const wx = wc.getContext('2d');
  const g = fbm(256, 256, 1, 24, 4, 777);
  const wi = wx.createImageData(256, 256);
  for (let i = 0; i < 256 * 256; i++) {
    const v = 0.65 + g[i] * 0.55;
    wi.data[i * 4] = 120 * v; wi.data[i * 4 + 1] = 62 * v; wi.data[i * 4 + 2] = 30 * v; wi.data[i * 4 + 3] = 255;
  }
  wx.putImageData(wi, 0, 0);
  const wood = new THREE.CanvasTexture(wc); wood.colorSpace = THREE.SRGBColorSpace; wood.wrapS = wood.wrapT = THREE.RepeatWrapping;
  return { rough, nrm, wood };
}

export function gunMaterials() {
  if (M) return M;
  const w = wearTextures();
  const mk = (color, rough, metal, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, roughnessMap: w.rough, normalMap: w.nrm, normalScale: new THREE.Vector2(0.3, 0.3), ...extra });
  M = {
    metal: mk(0x363a3f, 0.68, 0.65),
    black: mk(0x202328, 0.78, 0.08),
    steel: mk(0xabb1b5, 0.4, 0.78),
    wood: new THREE.MeshStandardMaterial({ map: w.wood, color: 0xe0c5aa, roughness: 0.66, metalness: 0.02, normalMap: w.nrm, normalScale: new THREE.Vector2(0.24, 0.24) }),
    bakelite: mk(0x6a2e14, 0.45, 0.1),
    olive: mk(0x586045, 0.76, 0.06),
    tan: mk(0x8f7a55, 0.6, 0.15),
    rubber: mk(0x191b1c, 0.9, 0.0),
    brass: mk(0xc8a04a, 0.3, 1.0),
    glass: new THREE.MeshStandardMaterial({ color: 0x0a1a24, roughness: 0.05, metalness: 0.9, emissive: 0x051018 }),
    blade: mk(0xb9c2c8, 0.29, 0.94),
    red: mk(0x8a1a14, 0.5, 0.2),
  };
  return M;
}

function part(parent, geo, mat, x, y, z, rx = 0, ry = 0, rz = 0, name) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
  if (name) m.name = name;
  parent.add(m);
  return m;
}
// 主体件用 2 段圆角（轮廓柔和），小配件用 1 段倒角（省三角面）
const RB = (w, h, d, r = 0.004) => new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4));
const RB1 = (w, h, d, r = 0.003) => new RoundedBoxGeometry(w, h, d, 1, Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4));
const BX = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const CZ = (r, len, seg = 14, r2) => { const g = new THREE.CylinderGeometry(r2 ?? r, r, len, seg); g.rotateX(Math.PI / 2); return g; };
const CX = (r, len, seg = 10) => { const g = new THREE.CylinderGeometry(r, r, len, seg); g.rotateZ(Math.PI / 2); return g; };
const CY = (r, len, seg = 10) => new THREE.CylinderGeometry(r, r, len, seg);
function anchor(g, name, x, y, z) { const o = new THREE.Object3D(); o.name = name; o.position.set(x, y, z); g.add(o); return o; }

// 从侧面轮廓挤出薄实体。倒角只用一段，避免用多块圆角盒拼出斜面。
// points 为 [z, y]；UV 按实际轮廓归一化，木纹不会缩成一条颜色带。
function profile(width, points, bevel = 0.002, holes = []) {
  const path = (outline, Path) => {
    const s = new Path();
    outline.forEach(([z, y], i) => i ? s.lineTo(-z, y) : s.moveTo(-z, y));
    s.closePath();
    return s;
  };
  const shape = path(points, THREE.Shape);
  shape.holes = holes.map((outline) => path(outline, THREE.Path));
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: width - bevel * 2,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 1,
    curveSegments: 1,
    steps: 1,
  });
  geo.translate(0, 0, -width / 2 + bevel);
  geo.rotateY(Math.PI / 2);
  geo.computeBoundingBox();
  const p = geo.attributes.position, n = geo.attributes.normal, uv = geo.attributes.uv;
  const b = geo.boundingBox, dz = b.max.z - b.min.z, dy = b.max.y - b.min.y;
  for (let i = 0; i < p.count; i++) {
    const u = (p.getZ(i) - b.min.z) / dz;
    const v = Math.abs(n.getX(i)) > 0.5 ? (p.getY(i) - b.min.y) / dy : (p.getX(i) - b.min.x) / width;
    uv.setXY(i, u, v);
  }
  return geo;
}

function guard(g, mat, front, rear, top, bottom, width = 0.014) {
  const points = [[rear, top], [front + 0.009, top], [front, top - 0.012], [front + 0.005, bottom + 0.009], [front + 0.016, bottom], [rear - 0.007, bottom], [rear, bottom + 0.014]];
  const hole = [[rear - 0.008, top - 0.007], [front + 0.015, top - 0.007], [front + 0.01, bottom + 0.012], [rear - 0.009, bottom + 0.01]];
  part(g, profile(width, points, 0.0008, [hole]), mat, 0, 0, 0);
}

function serrations(g, mat, halfWidth, y, startZ, count, spacing, height) {
  for (const x of [-halfWidth, halfWidth]) for (let i = 0; i < count; i++) {
    part(g, BX(0.0015, height, 0.0024), mat, x, y, startZ + i * spacing, -0.14);
  }
}

function curvedMag(g, mat, segs, x0, y0, z0, w, segH, segD, curve, channelMat) {
  const mag = new THREE.Group(); mag.name = 'mag';
  mag.position.set(x0, y0, z0);
  const centers = [{ y: 0, z: 0, a: 0 }];
  let y = 0, z = 0;
  for (let i = 0; i < segs; i++) {
    const a = (i + 0.5) * curve;
    y -= Math.cos(a) * segH; z -= Math.sin(a) * segH;
    centers.push({ y, z, a: (i + 1) * curve });
  }
  const edge = (offset) => centers.map((c) => [c.z + Math.cos(c.a) * offset, c.y - Math.sin(c.a) * offset]);
  part(mag, profile(w, [...edge(-segD / 2), ...edge(segD / 2).reverse()], 0.002), mat, 0, 0, 0);
  // 两条浅冲压槽跟随同一弧线，轮廓和底板只属于可拆卸 mag 组。
  if (channelMat) for (const x of [-w / 2, w / 2]) for (const offset of [-segD * 0.22, segD * 0.22]) {
    const left = edge(offset - 0.0015).slice(1), right = edge(offset + 0.0015).slice(1).reverse();
    part(mag, profile(0.0012, [...left, ...right], 0), channelMat, x, 0.007, 0);
  }
  const a = segs * curve;
  part(mag, RB1(w + 0.005, 0.011, segD + 0.007, 0.003), mat, 0, y - Math.cos(a) * 0.003, z - Math.sin(a) * 0.003, a);
  const hold = centers[Math.max(1, Math.floor(segs * 0.65))];
  anchor(mag, 'reloadGrip', 0, hold.y, hold.z);
  g.add(mag);
  return mag;
}

function bladeFacet(upper) {
  const sections = [
    { z: -0.035, top: 0.016, ridge: 0.005, bottom: -0.014, t: 0.0024 },
    { z: -0.16, top: 0.014, ridge: 0.004, bottom: -0.012, t: 0.002 },
    { z: -0.205, top: 0.014, ridge: 0.006, bottom: -0.006, t: 0.0012 },
    { z: -0.235, top: 0.003, ridge: 0.003, bottom: 0.003, t: 0 },
  ];
  const verts = [], uvs = [];
  const point = (s, side, ridge) => [ridge ? s.t * side : 0, ridge ? s.ridge : upper ? s.top : s.bottom, s.z];
  const triangle = (a, b, c) => { verts.push(...a, ...b, ...c); for (const p of [a, b, c]) uvs.push((-p[2] - 0.035) / 0.2, (p[1] + 0.014) / 0.03); };
  for (let i = 1; i < sections.length; i++) for (const side of [-1, 1]) {
    const a = point(sections[i - 1], side, true), b = point(sections[i], side, true);
    const c = point(sections[i], side, false), d = point(sections[i - 1], side, false);
    const flip = upper ? side < 0 : side > 0;
    if (i < sections.length - 1) flip ? triangle(a, c, b) : triangle(a, b, c);
    flip ? triangle(a, d, c) : triangle(a, c, d);
  }
  const s = sections[0];
  if (upper) triangle(point(s, -1, true), point(s, 1, true), point(s, 1, false));
  else triangle(point(s, 1, true), point(s, -1, true), point(s, 1, false));
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.computeVertexNormals();
  return geo;
}

const builders = {
  ak47(m) {
    const g = new THREE.Group();
    // 冲压机匣与拱形上盖；加强筋使用涂层而不是两条醒目的银色贴片。
    part(g, profile(0.046, [[-0.175,0.015],[-0.168,0.061],[0.061,0.061],[0.075,0.046],[0.071,0.006],[-0.133,0.003]],0.003), m.metal, 0,0,0);
    part(g, CZ(0.022,0.214,14), m.metal, 0,0.058,-0.031);
    part(g, RB1(0.042,0.022,0.204,0.005), m.metal, 0,0.071,-0.031);
    for (const x of [-0.0235,0.0235]) part(g, BX(0.0015,0.007,0.15), m.black, x,0.025,-0.053);
    part(g, RB1(0.0025,0.015,0.066,0.003), m.black, 0.024,0.053,-0.052);
    part(g, BX(0.0025,0.004,0.083), m.metal, 0.025,0.024,0.008,0.13);
    for (const z of [-0.131,0.03]) part(g, CX(0.0028,0.049,8), m.steel, 0,0.019,z);
    // 木护木收口、暖棕木托和黑色卡箍形成连续轮廓。
    part(g, profile(0.05,[[-0.181,0.031],[-0.205,0.043],[-0.344,0.04],[-0.37,0.025],[-0.361,0.001],[-0.204,-0.003],[-0.181,0.009]],0.004),m.wood,0,0,0);
    part(g, CZ(0.0175,0.163,14,0.016), m.wood, 0,0.065,-0.278);
    for (const z of [-0.182,-0.367]) part(g, CZ(0.024,0.013,12),m.metal,0,0.039,z);
    for (const x of [-0.025,0.025]) for (const z of [-0.24,-0.275,-0.31]) part(g,BX(0.0015,0.008,0.018),m.bakelite,x,0.031,z);
    part(g,CZ(0.0085,0.30,14),m.metal,0,0.042,-0.47);
    part(g,CZ(0.006,0.26,12),m.metal,0,0.066,-0.43);
    part(g,profile(0.023,[[-0.397,0.04],[-0.397,0.067],[-0.38,0.083],[-0.37,0.069],[-0.37,0.04]],0.002),m.metal,0,0,0);
    part(g,profile(0.024,[[-0.568,0.039],[-0.565,0.067],[-0.557,0.08],[-0.545,0.08],[-0.54,0.061],[-0.539,0.039]],0.002),m.metal,0,0,0);
    for (const x of [-0.01,0.01]) part(g,BX(0.0035,0.023,0.008),m.metal,x,0.083,-0.552,0,0,x<0?0.2:-0.2);
    part(g,BX(0.0035,0.02,0.004),m.steel,0,0.088,-0.552);
    part(g,profile(0.025,[[-0.193,0.04],[-0.191,0.074],[-0.18,0.088],[-0.15,0.083],[-0.147,0.059],[-0.163,0.041]],0.002),m.metal,0,0,0);
    part(g,RB1(0.018,0.007,0.04,0.002),m.metal,0,0.091,-0.175);
    part(g,CZ(0.012,0.06,12),m.metal,0,0.042,-0.615);
    part(g,CZ(0.0085,0.006,12),m.black,0,0.042,-0.648);
    // 护圈回到弹匣与握把之间，卡笋连接机匣下缘。
    part(g,RB1(0.036,0.034,0.081,0.005),m.metal,0,-0.009,-0.109);
    guard(g,m.metal,-0.064,0.006,0.008,-0.051,0.014);
    part(g,profile(0.008,[[-0.033,-0.008],[-0.023,-0.015],[-0.022,-0.035],[-0.03,-0.042],[-0.037,-0.039],[-0.031,-0.031]],0.001),m.steel,0,0,0);
    part(g,RB1(0.018,0.027,0.009,0.002),m.metal,0,-0.038,-0.073,0.25);
    curvedMag(g,m.bakelite,5,0,0.005,-0.102,0.03,0.045,0.07,0.11,m.black);
    part(g,profile(0.03,[[0.015,0.005],[0.045,0.004],[0.067,-0.088],[0.04,-0.099],[0.025,-0.089],[0.009,-0.013]],0.004),m.bakelite,0,0,0);
    part(g,profile(0.044,[[0.069,0.039],[0.119,0.037],[0.183,0.036],[0.322,0.052],[0.335,0.035],[0.335,-0.05],[0.311,-0.059],[0.157,-0.028],[0.102,-0.009],[0.069,0.013]],0.004),m.wood,0,0,0);
    part(g,profile(0.046,[[0.331,0.051],[0.343,0.049],[0.343,-0.052],[0.331,-0.055]],0.002),m.metal,0,0,0);
    part(g,CX(0.004,0.049,8),m.steel,0,0.003,0.303);
    part(g,RB1(0.026,0.01,0.013,0.003),m.metal,0,-0.036,0.199);
    part(g,CX(0.006,0.03),m.steel,0.034,0.06,-0.08,0,0,0,'bolt');
    anchor(g,'grip',0,-0.035,0.03);
    anchor(g,'fore',0,0,-0.29);
    anchor(g,'muzzle',0,0.042,-0.66);
    anchor(g,'eject',0.03,0.068,-0.04);
    anchor(g,'magwell',0,-0.02,-0.12);
    return g;
  },
  m4a1(m) {
    const g = new THREE.Group();
    part(g,profile(0.042,[[-0.157,0.029],[-0.151,0.069],[-0.126,0.075],[0.057,0.075],[0.077,0.062],[0.074,0.023],[-0.115,0.02]],0.003),m.metal,0,0,0);
    part(g,profile(0.037,[[-0.139,0.031],[-0.087,0.027],[-0.081,-0.045],[-0.031,-0.043],[-0.021,-0.01],[0.062,-0.009],[0.063,0.027]],0.003),m.black,0,0,0);
    part(g,RB1(0.026,0.011,0.214,0.002),m.metal,0,0.081,-0.038);
    for(let i=0;i<11;i++) part(g,BX(0.03,0.005,0.008),m.metal,0,0.089,-0.14+i*0.019);
    // 抛壳窗、推机柄和后照门在机匣表面，不撑成额外方块。
    part(g,profile(0.003,[[-0.066,0.065],[-0.018,0.065],[-0.013,0.041],[-0.063,0.041]],0.0005),m.black,0.022,0,0);
    part(g,CX(0.0065,0.009,10),m.metal,0.026,0.06,0.015,0.45);
    part(g,RB1(0.03,0.022,0.031,0.003),m.black,0,0.099,0.025);
    for(const x of [-0.011,0.011]) part(g,BX(0.005,0.017,0.008),m.black,x,0.117,0.025);
    part(g,CZ(0.0245,0.211,16),m.black,0,0.046,-0.28);
    part(g,CZ(0.025,0.032,14),m.metal,0,0.046,-0.166);
    // 轴向固定环与窄导轨；宽面护木保持圆筒轮廓。
    for(const z of [-0.183,-0.378]) part(g,CZ(0.027,0.013,16),m.metal,0,0.046,z);
    part(g,RB1(0.029,0.008,0.174,0.003),m.metal,0,0.073,-0.281);
    for(let i=0;i<7;i++) part(g,BX(0.032,0.004,0.007),m.metal,0,0.079,-0.353+i*0.024);
    for(const x of [-0.0246,0.0246]) for(let i=0;i<5;i++) part(g,RB1(0.002,0.009,0.018,0.001),m.metal,x,0.045,-0.347+i*0.032);
    part(g,CZ(0.0115,0.205,14,0.0095),m.metal,0,0.046,-0.473);
    part(g,CZ(0.0155,0.056,12),m.metal,0,0.046,-0.599);
    for(const x of [-0.014,0.014]) for(const z of [-0.593,-0.611]) part(g,BX(0.002,0.012,0.01),m.black,x,0.046,z);
    part(g,CZ(0.01,0.004,12),m.black,0,0.046,-0.626);
    part(g,profile(0.018,[[-0.433,0.025],[-0.424,0.073],[-0.416,0.091],[-0.409,0.091],[-0.393,0.025]],0.002,[[[-0.42,0.04],[-0.413,0.069],[-0.404,0.04]]]),m.metal,0,0,0);
    for(const x of [-0.009,0.009]) part(g,BX(0.0035,0.022,0.008),m.metal,x,0.099,-0.413,0,0,x<0?0.16:-0.16);
    part(g,BX(0.0035,0.022,0.004),m.steel,0,0.104,-0.413);
    guard(g,m.black,-0.025,0.031,-0.003,-0.046,0.016);
    part(g,RB1(0.007,0.026,0.007,0.002),m.steel,0,-0.022,0.002,0.22);
    curvedMag(g,m.metal,4,0,-0.04,-0.085,0.028,0.045,0.062,0.06,m.black);
    part(g,profile(0.028,[[0.017,0.003],[0.044,0.002],[0.074,-0.079],[0.055,-0.096],[0.031,-0.09],[0.009,-0.016]],0.004),m.black,0,0,0);
    part(g,RB1(0.031,0.013,0.035,0.004),m.rubber,0,-0.086,0.053,0.38);
    part(g,CZ(0.0155,0.19,14),m.metal,0,0.046,0.143);
    part(g,profile(0.043,[[0.145,0.033],[0.196,0.066],[0.275,0.069],[0.296,0.054],[0.297,-0.035],[0.275,-0.04],[0.257,-0.012],[0.185,-0.009]],0.004),m.black,0,0,0);
    part(g,RB1(0.046,0.102,0.014,0.004),m.rubber,0,0.016,0.301);
    part(g,RB1(0.015,0.011,0.047,0.002),m.metal,0,-0.019,0.207);
    part(g,BX(0.03,0.01,0.02),m.black,0,0.078,0.07,0,0,0,'bolt');
    anchor(g,'grip',0,-0.035,0.035);
    anchor(g,'fore',0,0.02,-0.28);
    anchor(g,'muzzle',0,0.046,-0.63);
    anchor(g,'eject',0.026,0.055,-0.03);
    anchor(g,'magwell',0,-0.06,-0.085);
    return g;
  },
  awm(m) {
    const g = new THREE.Group();
    // 连续橄榄绿托体及真实镂空的拇指孔，前托到枪托不再是一串方盒。
    part(g,profile(0.055,[[-0.442,0.015],[-0.432,0.032],[-0.225,0.033],[-0.162,0.041],[0.133,0.04],[0.182,0.055],[0.29,0.059],[0.315,0.037],[0.315,-0.099],[0.277,-0.104],[0.238,-0.078],[0.136,-0.043],[0.102,-0.022],[0.097,-0.113],[0.06,-0.113],[0.042,-0.031],[-0.166,-0.032],[-0.43,-0.033]],0.004,[[[0.12,0.019],[0.23,0.016],[0.229,-0.047],[0.153,-0.028],[0.117,-0.016]]]),m.olive,0,0,0);
    part(g,profile(0.05,[[0.157,0.046],[0.29,0.048],[0.298,0.074],[0.174,0.079],[0.157,0.069]],0.003),m.olive,0,0,0);
    part(g,RB1(0.057,0.167,0.017,0.004),m.rubber,0,-0.018,0.328);
    for(const z of [-0.28,-0.355]) part(g,BX(0.058,0.009,0.03),m.black,0,-0.025,z);
    part(g,CZ(0.024,0.22,16),m.metal,0,0.05,-0.07);
    part(g,CZ(0.0185,0.36,14),m.metal,0,0.05,-0.35);
    part(g,CZ(0.0155,0.2,14,0.0145),m.metal,0,0.05,-0.63);
    part(g,CZ(0.017,0.02,12),m.steel,0,0.05,-0.737);
    part(g,profile(0.04,[[-0.819,0.03],[-0.819,0.07],[-0.751,0.07],[-0.747,0.06],[-0.747,0.04],[-0.751,0.03]],0.003),m.metal,0,0,0);
    for(const x of [-0.019,0.019]) for(const z of [-0.762,-0.789]) part(g,BX(0.0018,0.016,0.011),m.black,x,0.05,z);
    part(g,CZ(0.012,0.006,12),m.black,0,0.05,-0.826);
    // 镜筒、渐扩物镜、目镜调焦环与环形镜座按同一轴线连接。
    part(g,CZ(0.0175,0.30,16),m.black,0,0.118,-0.07);
    part(g,CZ(0.031,0.09,16,0.0185),m.black,0,0.118,-0.25);
    part(g,CZ(0.025,0.06,16,0.018),m.black,0,0.118,0.1);
    part(g,CZ(0.027,0.002,16),m.glass,0,0.118,-0.296);
    part(g,CZ(0.021,0.002,16),m.glass,0,0.118,0.132);
    for(const z of [-0.155,0.015]) {
      part(g,new THREE.TorusGeometry(0.0195,0.003,4,14),m.metal,0,0.118,z);
      part(g,RB1(0.028,0.028,0.022,0.003),m.metal,0,0.085,z);
    }
    for(const z of [-0.284,-0.273,0.11,0.122]) part(g,new THREE.TorusGeometry(z<0?0.029:0.0225,0.0018,4,14),m.metal,0,0.118,z);
    part(g,RB1(0.03,0.01,0.195,0.002),m.metal,0,0.072,-0.068);
    part(g,CY(0.014,0.026,12),m.metal,0,0.148,-0.07);
    part(g,CX(0.013,0.026,12),m.metal,0.026,0.118,-0.07);
    part(g,CX(0.01,0.005,12),m.black,0.041,0.118,-0.07);
    const bolt=new THREE.Group();bolt.name='bolt';bolt.position.set(0.024,0.05,0.02);
    part(bolt,CX(0.0045,0.045,10),m.steel,0.02,0,0);
    part(bolt,new THREE.SphereGeometry(0.011,10,8),m.black,0.045,-0.006,0,0,0,0,'boltHandle');
    anchor(bolt,'boltGrip',0.045,-0.006,0);
    g.add(bolt);
    const mag=new THREE.Group();mag.name='mag';mag.position.set(0,-0.035,-0.07);
    part(mag,profile(0.034,[[-0.04,0],[-0.043,-0.054],[0.04,-0.06],[0.045,-0.003]],0.003),m.metal,0,0,0);
    part(mag,RB1(0.039,0.011,0.092,0.003),m.black,0,-0.061,0);
    anchor(mag,'reloadGrip',0,-0.035,0);
    g.add(mag);
    guard(g,m.black,0.005,0.057,-0.02,-0.061,0.014);
    part(g,RB1(0.007,0.024,0.008,0.002),m.steel,0,-0.039,0.031,0.24);
    for(const x of [-0.014,0.014]) {
      part(g,CZ(0.005,0.13,10),m.black,x,-0.035,-0.366);
      part(g,RB1(0.012,0.01,0.025,0.002),m.rubber,x,-0.041,-0.43);
    }
    part(g,CX(0.004,0.061,8),m.steel,0,-0.04,0.271);
    anchor(g,'grip',0,-0.05,0.075);
    anchor(g,'fore',0,-0.02,-0.3);
    anchor(g,'muzzle',0,0.05,-0.84);
    anchor(g,'eject',0.03,0.06,-0.08);
    anchor(g,'magwell',0,-0.05,-0.07);
    anchor(g,'scope',0,0.118,0.13);
    return g;
  },
  mp5(m) {
    const g=new THREE.Group();
    // 冲压圆顶上机匣及收紧的聚合物下机匣。
    part(g,profile(0.041,[[-0.255,0.027],[-0.249,0.063],[0.059,0.064],[0.075,0.05],[0.071,0.014],[-0.173,0.012]],0.003),m.metal,0,0,0);
    part(g,CZ(0.0185,0.305,14),m.metal,0,0.061,-0.091);
    part(g,profile(0.033,[[-0.152,0.013],[-0.099,-0.02],[-0.079,-0.021],[-0.077,0],[0.047,-0.004],[0.059,0.022]],0.003),m.black,0,0,0);
    part(g,profile(0.048,[[-0.385,0.028],[-0.377,0.056],[-0.251,0.063],[-0.228,0.031],[-0.25,-0.003],[-0.364,-0.006],[-0.385,0.008]],0.005),m.black,0,0,0);
    for(const z of [-0.274,-0.31,-0.346]) part(g,BX(0.049,0.009,0.005),m.metal,0,0.031,z);
    part(g,CZ(0.0115,0.08,12),m.metal,0,0.046,-0.41);
    part(g,CZ(0.0145,0.025,12),m.metal,0,0.046,-0.4415);
    part(g,CZ(0.0085,0.004,12),m.black,0,0.046,-0.4535);
    part(g,new THREE.TorusGeometry(0.0138,0.0028,4,14),m.metal,0,0.087,-0.38);
    part(g,RB1(0.019,0.028,0.016,0.003),m.metal,0,0.063,-0.38);
    part(g,BX(0.003,0.021,0.004),m.steel,0,0.081,-0.38);
    part(g,CY(0.0135,0.019,12),m.black,0,0.087,0.021);
    part(g,CZ(0.003,0.025,8),m.steel,0,0.092,0.021);
    part(g,CZ(0.008,0.146,12),m.metal,-0.022,0.063,-0.3);
    part(g,CX(0.008,0.017,10),m.black,-0.033,0.063,-0.367);
    curvedMag(g,m.metal,4,0,0,-0.13,0.026,0.042,0.052,0.14,m.black);
    part(g,RB1(0.032,0.021,0.057,0.004),m.black,0,-0.009,-0.13);
    guard(g,m.black,-0.058,0.006,0.005,-0.047,0.018);
    part(g,RB1(0.007,0.026,0.007,0.002),m.steel,0,-0.024,-0.027,0.18);
    part(g,profile(0.03,[[0.011,0.008],[0.044,0.006],[0.064,-0.078],[0.036,-0.096],[0.018,-0.084],[0.003,-0.015]],0.004),m.black,0,0,0);
    for(const x of [-0.016,0.016]) part(g,CZ(0.0045,0.21,10),m.metal,x,0.035,0.152);
    part(g,profile(0.045,[[0.24,0.063],[0.26,0.064],[0.26,-0.009],[0.243,-0.005],[0.237,0.041]],0.003),m.black,0,0,0);
    part(g,RB1(0.048,0.074,0.01,0.003),m.rubber,0,0.027,0.264);
    part(g,RB1(0.003,0.015,0.044,0.001),m.black,0.022,0.046,-0.057);
    part(g,BX(0.012,0.012,0.03),m.black,-0.02,0.07,-0.2,0,0,0,'bolt');
    anchor(g,'grip',0,-0.035,0.03);
    anchor(g,'fore',0,0,-0.3);
    anchor(g,'muzzle',0,0.046,-0.46);
    anchor(g,'eject',0.025,0.055,-0.07);
    anchor(g,'magwell',0,-0.02,-0.13);
    return g;
  },
  deagle(m) {
    const g=new THREE.Group(),slide=new THREE.Group();slide.name='slide';g.add(slide);
    // 宽厚套筒的斜肩与顶脊保留银灰主体，枪口加深色孔。
    part(slide,profile(0.034,[[-0.202,0.046],[-0.195,0.079],[-0.184,0.084],[0.032,0.084],[0.051,0.075],[0.052,0.047],[0.034,0.04],[-0.186,0.04]],0.002),m.steel,0,0,0);
    part(slide,RB1(0.014,0.007,0.224,0.002),m.metal,0,0.086,-0.075);
    serrations(slide,m.metal,0.0172,0.061,0.008,6,0.007,0.023);
    part(slide,BX(0.004,0.01,0.007),m.black,0,0.094,-0.187);
    for(const x of [-0.009,0.009]) part(slide,RB1(0.006,0.014,0.01,0.002),m.metal,x,0.089,0.035);
    part(slide,CZ(0.0085,0.005,12),m.black,0,0.062,-0.203);
    part(slide,profile(0.0015,[[-0.052,0.076],[-0.013,0.076],[-0.013,0.059],[-0.046,0.059]],0),m.metal,0.0175,0,0);
    part(g,profile(0.03,[[-0.166,0.039],[-0.17,0.019],[-0.13,0.009],[-0.009,0.007],[0.045,0.02],[0.053,0.038]],0.002),m.metal,0,0,0);
    guard(g,m.metal,-0.078,-0.006,0.012,-0.042,0.015);
    part(g,profile(0.007,[[-0.04,0.001],[-0.03,-0.011],[-0.03,-0.024],[-0.035,-0.032],[-0.042,-0.029],[-0.039,-0.015]],0.0007),m.steel,0,0,0);
    part(g,RB1(0.012,0.018,0.015,0.003),m.metal,0,0.074,0.06,-0.2);
    part(g,profile(0.034,[[-0.002,0.009],[0.038,0.012],[0.058,-0.087],[0.046,-0.099],[0.017,-0.095],[-0.008,-0.025]],0.004),m.rubber,0,0,0);
    for(const x of [-0.0172,0.0172]) {
      part(g,profile(0.0015,[[0.002,-0.014],[0.029,-0.008],[0.043,-0.075],[0.02,-0.08]],0),m.black,x,0,0);
      for(const y of [-0.022,-0.073]) part(g,CX(0.0032,0.0018,8),m.metal,x,y,0.017-(y+0.022)*0.2);
    }
    const mag=new THREE.Group();mag.name='mag';mag.position.set(0,-0.03,0.02);mag.rotation.x=0.24;
    part(mag,RB1(0.022,0.088,0.04,0.003),m.metal,0,-0.018,0);
    part(mag,RB1(0.032,0.012,0.047,0.003),m.black,0,-0.067,0);
    anchor(mag,'reloadGrip',0,-0.039,0);
    g.add(mag);
    anchor(g,'grip',0,-0.04,0.03);
    anchor(g,'fore',-0.02,-0.05,0.02);
    anchor(g,'muzzle',0,0.062,-0.21);
    anchor(g,'eject',0.02,0.07,-0.03);
    anchor(g,'magwell',0,-0.1,0.04);
    return g;
  },
  usp(m) {
    const g=new THREE.Group(),slide=new THREE.Group();slide.name='slide';g.add(slide);
    // 细长深灰套筒、低斜肩与较长下机匣，与银色 deagle 和短 Glock 区分。
    part(slide,profile(0.028,[[-0.185,0.046],[-0.179,0.075],[-0.163,0.08],[0.018,0.08],[0.034,0.07],[0.035,0.045]],0.0018),m.metal,0,0,0);
    part(slide,RB1(0.015,0.004,0.19,0.0015),m.black,0,0.081,-0.074);
    part(slide,RB1(0.006,0.012,0.01,0.0015),m.black,0,0.087,-0.173);
    part(slide,BX(0.0025,0.006,0.004),m.steel,0,0.093,-0.173);
    for(const x of [-0.0085,0.0085]) part(slide,RB1(0.005,0.012,0.011,0.0015),m.black,x,0.085,0.019);
    serrations(slide,m.black,0.0143,0.06,-0.005,5,0.007,0.024);
    part(slide,profile(0.0015,[[-0.055,0.075],[-0.017,0.075],[-0.012,0.058],[-0.05,0.058]],0),m.black,0.0147,0,0);
    part(slide,CZ(0.0088,0.012,12),m.steel,0,0.06,-0.186);
    part(slide,CZ(0.0056,0.003,12),m.black,0,0.06,-0.192);
    part(g,profile(0.028,[[-0.15,0.04],[-0.151,0.016],[-0.107,0.006],[-0.002,0.005],[0.033,0.02],[0.038,0.036]],0.0025),m.black,0,0,0);
    for(const z of [-0.102,-0.122]) part(g,BX(0.029,0.003,0.003),m.metal,0,0.007,z);
    guard(g,m.black,-0.085,-0.005,0.008,-0.054,0.017);
    part(g,RB1(0.007,0.026,0.009,0.002),m.steel,0,-0.027,-0.039,0.15);
    part(g,profile(0.03,[[-0.011,0.006],[0.032,0.006],[0.052,-0.097],[0.041,-0.11],[0.008,-0.104],[-0.016,-0.025]],0.003),m.black,0,0,0);
    for(const x of [-0.0152,0.0152]) part(g,profile(0.0015,[[-0.004,-0.019],[0.025,-0.016],[0.04,-0.086],[0.011,-0.092]],0),m.rubber,x,0,0);
    part(g,RB1(0.004,0.009,0.025,0.001),m.steel,0.016,0.027,-0.022);
    part(g,CX(0.003,0.033,8),m.metal,0,0.019,0.007);
    const mag=new THREE.Group();mag.name='mag';mag.position.set(0,-0.09,0.02);mag.rotation.x=0.18;
    part(mag,RB1(0.024,0.09,0.04,0.003),m.steel,0,0.025,0);
    part(mag,RB1(0.031,0.011,0.047,0.003),m.black,0,-0.023,0);
    anchor(mag,'reloadGrip',0,0.005,0);
    g.add(mag);
    anchor(g,'grip',0,-0.04,0.02);
    anchor(g,'fore',-0.02,-0.045,0);
    anchor(g,'muzzle',0,0.06,-0.198);
    anchor(g,'eject',0.022,0.066,-0.02);
    anchor(g,'magwell',0,-0.088,0.02);
    return g;
  },
  glock18(m) {
    const g=new THREE.Group(),slide=new THREE.Group();slide.name='slide';g.add(slide);
    part(slide,profile(0.034,[[-0.136,0.045],[-0.135,0.072],[-0.13,0.078],[0.02,0.078],[0.027,0.072],[0.028,0.044]],0.0014),m.metal,0,0,0);
    part(slide,RB1(0.017,0.003,0.145,0.001),m.black,0,0.08,-0.055);
    part(slide,RB1(0.005,0.012,0.009,0.0015),m.black,0,0.086,-0.126);
    part(slide,BX(0.0025,0.006,0.004),m.steel,0,0.092,-0.126);
    for(const x of [-0.009,0.009]) part(slide,RB1(0.005,0.011,0.011,0.0015),m.black,x,0.085,0.017);
    serrations(slide,m.black,0.0172,0.061,0.002,5,0.0048,0.023);
    part(slide,profile(0.0013,[[-0.032,0.074],[-0.003,0.074],[-0.003,0.061],[-0.027,0.061]],0),m.black,0.0176,0,0);
    part(slide,CZ(0.0095,0.014,12),m.steel,0,0.06,-0.135);
    part(slide,CZ(0.006,0.002,12),m.black,0,0.06,-0.142);
    part(g,profile(0.034,[[-0.113,0.041],[-0.112,0.005],[-0.084,-0.005],[-0.018,-0.002],[0.034,0.022],[0.036,0.039]],0.002),m.black,0,0,0);
    guard(g,m.black,-0.089,-0.011,0.005,-0.037,0.025);
    part(g,RB1(0.007,0.023,0.008,0.002),m.steel,0,-0.014,-0.043,0.08);
    part(g,profile(0.032,[[-0.02,0.008],[0.027,0.01],[0.049,-0.105],[0.032,-0.118],[-0.004,-0.11],[-0.028,-0.02]],0.003),m.black,0,0,0);
    for(const x of [-0.0162,0.0162]) part(g,profile(0.0015,[[-0.017,-0.017],[0.019,-0.014],[0.033,-0.09],[-0.002,-0.096]],0),m.rubber,x,0,0);
    part(g,RB1(0.003,0.007,0.026,0.001),m.metal,0.018,0.028,-0.016);
    part(g,CX(0.0027,0.037,8),m.metal,0,0.02,-0.002);
    const mag=new THREE.Group();mag.name='mag';mag.position.set(0,-0.095,0.01);mag.rotation.x=0.16;
    part(mag,RB1(0.028,0.10,0.044,0.003),m.steel,0,0.032,0);
    part(mag,profile(0.034,[[-0.025,-0.021],[-0.026,-0.034],[0.023,-0.034],[0.028,-0.026],[0.023,-0.021]],0.002),m.black,0,0,0);
    anchor(mag,'reloadGrip',0,0.006,0);
    g.add(mag);
    anchor(g,'grip',0,-0.045,0.01);
    anchor(g,'fore',-0.02,-0.04,-0.01);
    anchor(g,'muzzle',0,0.06,-0.1465);
    anchor(g,'eject',0.024,0.064,-0.01);
    anchor(g,'magwell',0,-0.093,0.01);
    return g;
  },
  knife(m) {
    const g=new THREE.Group();
    // 菱形刀脊渐薄至刀锋与刀尖，两个面分别表现厚背与打磨刃面。
    part(g,bladeFacet(true),m.steel,0,0,0);
    part(g,bladeFacet(false),m.blade,0,0,0);
    part(g,profile(0.022,[[-0.038,0.026],[-0.026,0.029],[-0.022,0.021],[-0.022,-0.024],[-0.031,-0.028],[-0.04,-0.02]],0.002),m.metal,0,0,0);
    part(g,profile(0.025,[[-0.021,0.015],[-0.005,0.016],[0.076,0.011],[0.088,0.005],[0.086,-0.012],[-0.004,-0.017],[-0.022,-0.011]],0.003),m.rubber,0,0,0);
    for(const z of [-0.003,0.02,0.043,0.066]) part(g,RB1(0.026,0.027,0.004,0.0015),m.black,0,-0.001,z);
    part(g,RB1(0.028,0.026,0.016,0.004),m.metal,0,0,0.09);
    part(g,CX(0.004,0.03,8),m.steel,0,0,0.091);
    anchor(g,'grip',0,0,0.03);
    anchor(g,'muzzle',0,0,-0.23);
    return g;
  },
  he(m) {
    const g=new THREE.Group();
    const outline=[new THREE.Vector2(0,-0.043),new THREE.Vector2(0.019,-0.04),new THREE.Vector2(0.03,-0.028),new THREE.Vector2(0.034,-0.013),new THREE.Vector2(0.034,0.009),new THREE.Vector2(0.03,0.029),new THREE.Vector2(0.017,0.041),new THREE.Vector2(0,0.043)];
    part(g,new THREE.LatheGeometry(outline,16),m.olive,0,0,0);
    part(g,CY(0.0344,0.004,16),m.tan,0,0.006,0);
    part(g,CY(0.0135,0.019,12),m.metal,0,0.046,0);
    part(g,CY(0.01,0.009,12),m.steel,0,0.059,0);
    // 折弯保险杆贴着弹体，保险销与拉环之间有连接短杆。
    const lever=new THREE.Group();lever.name='lever';lever.position.set(0,0.033,0.0245);lever.rotation.x=-0.2;g.add(lever);
    part(lever,profile(0.012,[[-0.027,0.026],[0.006,0.026],[0.01,0.012],[0.006,-0.035],[0.001,-0.038],[0.005,0.011],[0.002,0.021],[-0.027,0.021]],0.0008),m.metal,0,0,0);
    part(g,new THREE.TorusGeometry(0.012,0.0018,4,12),m.steel,0.022,0.055,0,0,Math.PI/2,0,'pin');
    part(g,CX(0.0018,0.016,8),m.steel,0.014,0.055,0);
    part(g,CX(0.003,0.019,8),m.metal,0,0.054,0.012);
    anchor(g,'grip',0,0,0);
    anchor(g,'muzzle',0,0,-0.04);
    return g;
  },
};

// 只在同一静态层内合并；可拆弹匣、套筒、枪栓和保险件保留独立动作节点。
// 有名字的 Mesh 不合并，避免动画或持握查询失去原部件。
function mergeStaticParts(root) {
  const layers = [];
  root.traverse((o) => { if (o.isGroup) layers.push(o); });
  for (const layer of layers.reverse()) {
    const buckets = new Map();
    for (const o of layer.children) {
      if (!o.isMesh || o.name || o.children.length || Array.isArray(o.material)) continue;
      const key = o.material.uuid;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(o);
    }
    for (const parts of buckets.values()) {
      if (parts.length < 2) continue;
      const geos = parts.map((o) => {
        o.updateMatrix();
        const geo = o.geometry.clone().applyMatrix4(o.matrix);
        if (!geo.index) return geo;
        const nonIndexed = geo.toNonIndexed();
        geo.dispose();
        return nonIndexed;
      });
      const geo = mergeGeometries(geos, false);
      for (const input of geos) input.dispose();
      if (!geo) continue;
      for (const o of parts) { layer.remove(o); o.geometry.dispose(); }
      layer.add(new THREE.Mesh(geo, parts[0].material));
    }
  }
}

export function buildGun(id) {
  const m = gunMaterials();
  const g = builders[id](m);
  mergeStaticParts(g);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
  return g;
}

// 第三人称：合并为单个网格（按材质分组）
const merged = {};
export function buildGunMerged(id) {
  if (!merged[id]) {
    const g = buildGun(id);
    g.updateMatrixWorld(true);
    const groups = new Map();
    g.traverse((o) => {
      if (!o.isMesh) return;
      const geo = o.geometry.clone().applyMatrix4(o.matrixWorld);
      const keep = new THREE.BufferGeometry();
      keep.setAttribute('position', geo.attributes.position);
      keep.setAttribute('normal', geo.attributes.normal);
      keep.setAttribute('uv', geo.attributes.uv || new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
      if (geo.index) keep.setIndex(geo.index);
      const k = o.material.uuid;
      if (!groups.has(k)) groups.set(k, { mat: o.material, geos: [] });
      groups.get(k).geos.push(keep.index ? keep.toNonIndexed() : keep);
    });
    const mats = [], geos = [];
    for (const { mat, geos: gs } of groups.values()) { mats.push(mat); geos.push(mergeGeometries(gs, false)); }
    const all = mergeGeometries(geos, true);
    const anchors = {};
    g.traverse((o) => { if (!o.isMesh && o.name && o !== g) anchors[o.name] = o.getWorldPosition(new THREE.Vector3()); });
    merged[id] = { geo: all, mats, anchors };
  }
  const d = merged[id];
  const mesh = new THREE.Mesh(d.geo, d.mats);
  mesh.castShadow = true;
  mesh.userData.anchors = d.anchors;
  return mesh;
}
