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
    metal: mk(0x2b2d30, 0.42, 0.85),
    black: mk(0x16171a, 0.6, 0.35),
    steel: mk(0x8e939a, 0.28, 0.95),
    wood: new THREE.MeshStandardMaterial({ map: w.wood, roughness: 0.55, metalness: 0.05, normalMap: w.nrm, normalScale: new THREE.Vector2(0.4, 0.4) }),
    bakelite: mk(0x6a2e14, 0.45, 0.1),
    olive: mk(0x4d5638, 0.62, 0.2),
    tan: mk(0x8f7a55, 0.6, 0.15),
    rubber: mk(0x121212, 0.85, 0.0),
    brass: mk(0xc8a04a, 0.3, 1.0),
    glass: new THREE.MeshStandardMaterial({ color: 0x0a1a24, roughness: 0.05, metalness: 0.9, emissive: 0x051018 }),
    blade: mk(0xc9ced4, 0.18, 1.0),
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

function curvedMag(g, mat, segs, x0, y0, z0, w, segH, segD, curve) {
  const mag = new THREE.Group(); mag.name = 'mag';
  mag.position.set(x0, y0, z0);
  let y = 0, z = 0, a = 0;
  for (let i = 0; i < segs; i++) {
    const m = part(mag, RB(w, segH + 0.004, segD, 0.003), mat, 0, y - segH / 2, z);
    m.rotation.x = -a;
    y -= Math.cos(a) * segH; z -= Math.sin(a) * segH;
    a += curve;
  }
  part(mag, RB1(w + 0.005, 0.013, segD + 0.008, 0.003), mat, 0, y - 0.004, z, -a + curve);
  g.add(mag);
  return mag;
}

const builders = {
  ak47(m) {
    const g = new THREE.Group();
    // 机匣：主体保留圆角，侧面加冲压加强筋（裸钢少量高光）
    part(g, RB(0.046, 0.056, 0.25, 0.006), m.metal, 0, 0.035, -0.05);
    part(g, RB1(0.0445, 0.03, 0.215, 0.006), m.metal, 0, 0.068, -0.028); // 机匣盖压在机匣上，避免共面
    part(g, CY(0.011, 0.026, 12), m.metal, 0, 0.076, 0.075);            // 机匣盖后端卷边
    part(g, BX(0.016, 0.01, 0.055), m.steel, -0.0245, 0.05, -0.025);     // 枪机框（拉机柄槽内）
    for (const x of [-0.0225, 0.0225]) part(g, BX(0.002, 0.012, 0.19), m.steel, x, 0.038, -0.05);
    // 护木：下护木 + 金属卡箍 + 上护木散热槽，接口不再是两块木头直接对叠
    part(g, RB1(0.05, 0.044, 0.19, 0.008), m.wood, 0, 0.02, -0.275);
    part(g, RB1(0.032, 0.05, 0.03, 0.006), m.metal, 0, 0.032, -0.183);
    part(g, CZ(0.019, 0.175), m.wood, 0, 0.066, -0.28);
    part(g, BX(0.02, 0.005, 0.024), m.metal, 0, 0.09, -0.225); // 上护木散热槽
    // 枪管 + 导气箍
    part(g, CZ(0.0085, 0.3), m.metal, 0, 0.042, -0.47);
    part(g, CZ(0.006, 0.26), m.metal, 0, 0.066, -0.43);
    part(g, RB1(0.022, 0.034, 0.026, 0.005), m.metal, 0, 0.06, -0.383);
    // 准星座：护耳围住细准星柱
    part(g, RB1(0.024, 0.03, 0.026, 0.005), m.metal, 0, 0.056, -0.552);
    for (const x of [-0.011, 0.011]) part(g, BX(0.006, 0.022, 0.008), m.metal, x, 0.078, -0.552, 0, 0, x < 0 ? 0.18 : -0.18);
    part(g, BX(0.004, 0.02, 0.004), m.steel, 0, 0.088, -0.552);
    // 枪口：斜切制退器 + 前端收口
    const brake = part(g, CZ(0.0125, 0.056, 12), m.metal, 0, 0.042, -0.612);
    brake.rotation.x = -0.1;
    part(g, CZ(0.0095, 0.014, 12), m.black, 0, 0.043, -0.641);
    // 弹匣井：把机匣底面、弹匣口与扳机护圈接成一体
    part(g, RB1(0.038, 0.048, 0.095, 0.006), m.metal, 0, -0.008, -0.11);
    // 扳机护圈 / 扳机 / 弹匣卡笋（收在机匣下方，不再悬空）
    part(g, BX(0.028, 0.008, 0.05), m.metal, 0, -0.021, -0.318);
    part(g, BX(0.026, 0.006, 0.012), m.metal, 0, -0.024, -0.345);       // 护圈底板
    part(g, BX(0.006, 0.022, 0.03), m.metal, 0, -0.034, -0.35);
    part(g, BX(0.008, 0.016, 0.026), m.metal, 0, -0.016, -0.3);
    part(g, BX(0.008, 0.026, 0.008), m.steel, 0, -0.034, -0.032);
    // 弹匣：带底板与加强筋
    curvedMag(g, m.bakelite, 5, 0, 0.005, -0.102, 0.03, 0.045, 0.07, 0.11);
    part(g, BX(0.028, 0.008, 0.062), m.metal, 0, -0.033, -0.21);
    part(g, BX(0.032, 0.004, 0.006), m.bakelite, 0, -0.06, -0.21); // 弹匣加强筋
    // 握把 + 木托（托底加钢板、托颈过渡、背带环）
    part(g, RB1(0.03, 0.1, 0.042, 0.008), m.bakelite, 0, -0.045, 0.035, 0.32);
    const st = part(g, RB1(0.042, 0.068, 0.27, 0.012), m.wood, 0, 0.004, 0.2, -0.1);
    part(st, BX(0.044, 0.1, 0.012), m.metal, 0, -0.012, 0.135);
    part(g, BX(0.04, 0.056, 0.014), m.metal, 0, 0.049, 0.337);
    part(g, BX(0.024, 0.01, 0.012), m.steel, 0, -0.038, 0.2);
    const bolt = part(g, CX(0.006, 0.03), m.steel, 0.034, 0.06, -0.08, 0, 0, 0, 'bolt');
    void bolt;
    anchor(g, 'grip', 0, -0.035, 0.03);
    anchor(g, 'fore', 0, 0.0, -0.29);
    anchor(g, 'muzzle', 0, 0.042, -0.66);
    anchor(g, 'eject', 0.03, 0.068, -0.04);
    anchor(g, 'magwell', 0, -0.02, -0.12);
    return g;
  },
  m4a1(m) {
    const g = new THREE.Group();
    // 上下机匣分层：下机匣聚合物、上机匣涂层金属 + 顶部导轨
    part(g, RB(0.042, 0.046, 0.23, 0.005), m.black, 0, 0.05, -0.04);
    part(g, RB1(0.036, 0.022, 0.2, 0.004), m.metal, 0, 0.078, -0.05);
    for (let i = 0; i < 11; i++) part(g, BX(0.026, 0.005, 0.008), m.metal, 0, 0.092, -0.15 + i * 0.02);
    part(g, RB1(0.03, 0.03, 0.042, 0.005), m.black, 0, 0.1, 0.025);    // 后照门座
    part(g, BX(0.004, 0.014, 0.004), m.steel, 0, 0.118, 0.03);
    part(g, BX(0.004, 0.01, 0.03), m.steel, 0.018, 0.082, -0.04);       // 辅助推机柄
    part(g, RB1(0.008, 0.026, 0.05, 0.003), m.black, 0.017, 0.05, -0.03); // 抛壳窗盖
    part(g, RB1(0.036, 0.05, 0.17, 0.006), m.black, 0, 0.005, -0.02);
    part(g, RB1(0.036, 0.05, 0.06, 0.006), m.black, 0, -0.03, -0.11);
    part(g, BX(0.026, 0.03, 0.07), m.black, 0, -0.03, -0.06);            // 弹匣井，衔接下机匣与弹匣
    for (const x of [-0.02, 0.02]) part(g, BX(0.002, 0.014, 0.028), m.metal, x, -0.012, 0.035);
    // 护木：圆筒 + 前后固定环 + 散热孔
    part(g, CZ(0.0255, 0.21, 14), m.black, 0, 0.046, -0.28);
    for (const z of [-0.196, -0.364]) part(g, CY(0.0268, 0.016, 14), m.metal, 0, 0.046, z);
    for (let i = 0; i < 4; i++) part(g, CZ(0.0262, 0.005, 12), m.metal, 0, 0.046, -0.215 - i * 0.038);
    // 枪管 + 消焰器（侧面开槽）
    part(g, CZ(0.0115, 0.19, 14, 0.0095), m.metal, 0, 0.046, -0.468);    // 前段枪管向枪口收细
    part(g, CZ(0.0155, 0.055, 12), m.metal, 0, 0.046, -0.601);
    for (const z of [-0.59, -0.612]) part(g, BX(0.028, 0.007, 0.007), m.black, 0, 0.046, z);
    // 三角准星座 + 护耳 + 准星柱 + 前背带环
    part(g, RB1(0.018, 0.052, 0.02, 0.005), m.black, 0, 0.068, -0.41);
    for (const x of [-0.011, 0.011]) part(g, BX(0.006, 0.028, 0.008), m.black, x, 0.09, -0.41, 0, 0, x < 0 ? 0.18 : -0.18);
    part(g, BX(0.004, 0.02, 0.004), m.steel, 0, 0.105, -0.41);
    part(g, BX(0.03, 0.014, 0.03), m.black, 0, 0.02, -0.395);
    part(g, BX(0.022, 0.014, 0.026), m.metal, 0, -0.012, -0.36);
    // 弹匣 + 底板
    curvedMag(g, m.metal, 4, 0, -0.04, -0.085, 0.028, 0.045, 0.062, 0.06);
    part(g, BX(0.032, 0.01, 0.07), m.metal, 0, -0.097, -0.204);
    // 握把：聚合物 + 橡胶底托
    part(g, RB1(0.028, 0.09, 0.036, 0.008), m.black, 0, -0.04, 0.035, 0.38);
    part(g, RB1(0.03, 0.014, 0.038, 0.005), m.rubber, 0, -0.082, 0.053, 0.38);
    // 伸缩托：缓冲管 + 托体 + 橡胶托底板
    part(g, CZ(0.016, 0.17), m.black, 0, 0.046, 0.145);
    part(g, RB1(0.042, 0.07, 0.1, 0.01), m.black, 0, 0.032, 0.235);
    part(g, RB1(0.044, 0.018, 0.014, 0.004), m.rubber, 0, 0.028, 0.292);
    part(g, BX(0.03, 0.01, 0.02), m.black, 0, 0.078, 0.07, 0, 0, 0, 'bolt');
    part(g, BX(0.002, 0.03, 0.05), m.metal, 0.022, 0.05, -0.04);
    anchor(g, 'grip', 0, -0.035, 0.035);
    anchor(g, 'fore', 0, 0.02, -0.28);
    anchor(g, 'muzzle', 0, 0.046, -0.63);
    anchor(g, 'eject', 0.026, 0.055, -0.03);
    anchor(g, 'magwell', 0, -0.06, -0.085);
    return g;
  },
  awm(m) {
    const g = new THREE.Group();
    // 枪身与护木
    part(g, RB(0.055, 0.075, 0.46, 0.012), m.olive, 0, 0.004, -0.02);
    part(g, RB1(0.05, 0.05, 0.22, 0.012), m.olive, 0, -0.005, -0.33);
    part(g, CY(0.0235, 0.02, 14), m.olive, 0, 0.05, -0.435);
    // 枪管：阶梯锥形 + 带挡板的枪口制退器
    part(g, CZ(0.024, 0.22), m.metal, 0, 0.05, -0.07);
    part(g, CZ(0.0185, 0.36, 12), m.metal, 0, 0.05, -0.35);              // 中段枪管
    part(g, CZ(0.0155, 0.2, 12, 0.0145), m.metal, 0, 0.05, -0.63);       // 前段收细
    part(g, CZ(0.017, 0.02, 12), m.steel, 0, 0.05, -0.737);              // 阶梯肩
    part(g, CZ(0.019, 0.068, 12), m.metal, 0, 0.05, -0.778);             // 制退器
    for (const z of [-0.757, -0.783]) part(g, BX(0.042, 0.009, 0.009), m.black, 0, 0.05, z);
    part(g, CZ(0.014, 0.014, 12), m.black, 0, 0.05, -0.818);
    // 瞄准镜：镜筒 + 物镜/目镜 + 双镜座环 + 塔轮
    part(g, CZ(0.018, 0.3), m.black, 0, 0.118, -0.07);
    part(g, CZ(0.03, 0.09, 16, 0.019), m.black, 0, 0.118, -0.25);
    part(g, CZ(0.025, 0.06, 16), m.black, 0, 0.118, 0.1);
    part(g, CZ(0.027, 0.002, 16), m.glass, 0, 0.118, -0.296);
    for (const z of [-0.155, 0.015]) part(g, CY(0.0215, 0.018, 14), m.black, 0, 0.118, z);
    for (const z of [-0.14, 0.0]) part(g, RB1(0.032, 0.042, 0.024, 0.005), m.metal, 0, 0.09, z);
    part(g, BX(0.03, 0.014, 0.17), m.metal, 0, 0.086, -0.07);           // 镜座底板
    part(g, BX(0.024, 0.012, 0.012), m.steel, 0, -0.088, 0.2);          // 背带环
    part(g, CY(0.014, 0.026, 12), m.black, 0, 0.147, -0.07);
    part(g, CX(0.013, 0.026, 12), m.black, 0.028, 0.118, -0.07);
    part(g, CX(0.009, 0.016, 10), m.steel, 0.042, 0.118, -0.07);
    // 枪栓
    const bolt = new THREE.Group(); bolt.name = 'bolt'; bolt.position.set(0.024, 0.05, 0.02);
    part(bolt, CX(0.005, 0.045), m.steel, 0.02, 0, 0);
    part(bolt, new THREE.SphereGeometry(0.011, 10, 8), m.black, 0.045, -0.006, 0);
    g.add(bolt);
    // 弹匣（带外伸底板）
    const mag = new THREE.Group(); mag.name = 'mag'; mag.position.set(0, -0.035, -0.07);
    part(mag, RB1(0.034, 0.06, 0.085, 0.005), m.metal, 0, -0.03, 0);
    part(mag, RB1(0.038, 0.013, 0.09, 0.004), m.metal, 0, -0.062, 0);
    g.add(mag);
    // 枪托：托颈过渡 + 托腮 + 托底橡胶垫
    part(g, RB1(0.035, 0.1, 0.045, 0.01), m.olive, 0, -0.07, 0.08, 0.3);
    part(g, RB1(0.05, 0.16, 0.045, 0.01), m.olive, 0, -0.02, 0.3);
    part(g, RB1(0.042, 0.028, 0.14, 0.008), m.olive, 0, 0.052, 0.24);
    part(g, RB1(0.04, 0.04, 0.18, 0.01), m.olive, 0, 0.028, 0.22);
    part(g, BX(0.052, 0.17, 0.014), m.rubber, 0, -0.02, 0.33);
    for (const x of [-0.013, 0.013]) part(g, CZ(0.006, 0.14), m.black, x, -0.032, -0.37); // 前托下方脚架管
    anchor(g, 'grip', 0, -0.05, 0.075);
    anchor(g, 'fore', 0, -0.02, -0.3);
    anchor(g, 'muzzle', 0, 0.05, -0.84);
    anchor(g, 'eject', 0.03, 0.06, -0.08);
    anchor(g, 'magwell', 0, -0.05, -0.07);
    anchor(g, 'scope', 0, 0.118, 0.13);
    return g;
  },
  mp5(m) {
    const g = new THREE.Group();
    // 机匣 + 金属上盖，取消整块黑
    part(g, RB(0.042, 0.058, 0.32, 0.014), m.black, 0, 0.042, -0.09);
    part(g, RB1(0.04, 0.016, 0.3, 0.006), m.metal, 0, 0.074, -0.09);
    // 护木：两段收口 + 前箍 + 横向防滑槽
    part(g, RB1(0.046, 0.05, 0.15, 0.012), m.black, 0, 0.02, -0.31);
    part(g, RB1(0.04, 0.032, 0.13, 0.008), m.black, 0, 0.052, -0.3);
    for (const z of [-0.29, -0.315]) part(g, BX(0.048, 0.036, 0.006), m.metal, 0, 0.02, z);
    part(g, CY(0.024, 0.014, 14), m.metal, 0, 0.032, -0.385);
    // 枪管 + 枪口
    part(g, CZ(0.0115, 0.08, 12), m.metal, 0, 0.046, -0.41);
    part(g, CZ(0.0145, 0.024, 12), m.metal, 0, 0.046, -0.45);
    part(g, CZ(0.009, 0.01, 12), m.black, 0, 0.046, -0.459);
    // 准星护环 + 柱 + 照门鼓
    part(g, CY(0.016, 0.02, 14), m.black, 0, 0.083, -0.38);
    part(g, BX(0.004, 0.018, 0.004), m.steel, 0, 0.088, -0.38);
    part(g, CY(0.014, 0.024, 12), m.black, 0, 0.085, 0.02);
    part(g, BX(0.02, 0.006, 0.008), m.metal, 0, 0.1, 0.02);
    // 拉机柄管（前段裸钢）
    part(g, CZ(0.009, 0.14), m.black, -0.024, 0.066, -0.3);
    part(g, CZ(0.007, 0.03), m.steel, -0.024, 0.066, -0.377);
    part(g, CX(0.0095, 0.016, 10), m.steel, -0.036, 0.066, -0.368);      // 拉机柄头
    part(g, RB1(0.024, 0.012, 0.05, 0.003), m.black, 0, -0.018, -0.33);   // 护手挡块
    // 弹匣：插入口 + 弯匣 + 底板
    const mag = curvedMag(g, m.metal, 4, 0, 0.0, -0.13, 0.026, 0.042, 0.052, 0.14);
    part(mag, RB1(0.032, 0.012, 0.062, 0.004), m.metal, 0, -0.19, -0.031); // 弹匣底板
    part(g, RB1(0.032, 0.02, 0.056, 0.005), m.black, 0, -0.012, -0.13);
    // 握把：聚合物 + 金属底盖 + 扳机
    part(g, RB1(0.03, 0.095, 0.04, 0.008), m.black, 0, -0.04, 0.03, 0.3);
    part(g, RB1(0.032, 0.013, 0.042, 0.005), m.metal, 0, -0.082, 0.042, 0.3);
    part(g, BX(0.008, 0.024, 0.008), m.steel, 0, -0.032, -0.03);
    part(g, RB1(0.03, 0.022, 0.05, 0.005), m.black, 0, 0.062, 0.09);
    // 伸缩托：双导轨 + 托底板 + 橡胶垫
    for (const x of [-0.016, 0.016]) part(g, CZ(0.005, 0.2), m.metal, x, 0.035, 0.15);
    part(g, RB1(0.045, 0.07, 0.018, 0.005), m.black, 0, 0.03, 0.25);
    part(g, RB1(0.047, 0.02, 0.012, 0.004), m.rubber, 0, 0.026, 0.259);
    part(g, BX(0.012, 0.012, 0.03), m.black, -0.02, 0.07, -0.2, 0, 0, 0, 'bolt');
    anchor(g, 'grip', 0, -0.035, 0.03);
    anchor(g, 'fore', 0, 0.0, -0.3);
    anchor(g, 'muzzle', 0, 0.046, -0.46);
    anchor(g, 'eject', 0.025, 0.055, -0.07);
    anchor(g, 'magwell', 0, -0.02, -0.13);
    return g;
  },
  deagle(m) {
    const g = new THREE.Group();
    // 套筒：顶部散热肋 + 尾部防滑纹 + 前端衬套
    const slide = new THREE.Group(); slide.name = 'slide'; g.add(slide);
    part(slide, RB(0.032, 0.042, 0.255, 0.006), m.steel, 0, 0.062, -0.075);
    part(slide, BX(0.012, 0.006, 0.23), m.metal, 0, 0.086, -0.075);
    for (let i = 0; i < 6; i++) part(slide, BX(0.034, 0.03, 0.003), m.metal, 0, 0.062, 0.014 + i * 0.009);
    part(slide, BX(0.004, 0.01, 0.006), m.steel, 0, 0.094, -0.19);
    part(slide, RB1(0.028, 0.016, 0.013, 0.004), m.metal, 0, 0.08, 0.043);
    part(slide, RB1(0.009, 0.013, 0.009, 0.003), m.black, 0, 0.048, -0.194);
    // 下机匣：导轨 + 扳机护圈 + 击锤
    part(g, RB1(0.03, 0.032, 0.18, 0.005), m.metal, 0, 0.026, -0.05);
    part(g, BX(0.018, 0.008, 0.1), m.metal, 0, 0.008, -0.11);
    part(g, BX(0.006, 0.006, 0.07), m.metal, 0, -0.003, -0.035);
    part(g, BX(0.006, 0.03, 0.006), m.metal, 0, -0.018, -0.07);
    part(g, RB1(0.008, 0.026, 0.01, 0.003), m.steel, 0, -0.02, -0.036);
    part(g, RB1(0.01, 0.02, 0.014, 0.004), m.metal, 0, 0.076, 0.06);
    // 握把：粗糙橡胶 + 底托 + 后缘托
    part(g, RB1(0.034, 0.115, 0.055, 0.012), m.rubber, 0, -0.04, 0.025, 0.24);
    for (const y of [-0.03, -0.075]) part(g, BX(0.036, 0.005, 0.05), m.metal, 0, y, 0.025 + (y + 0.052) * 0.24); // 握把分模线
    part(g, RB1(0.034, 0.014, 0.028, 0.005), m.rubber, 0, -0.094, 0.043, 0.24);
    part(g, RB1(0.03, 0.01, 0.02, 0.004), m.metal, 0, 0.0, 0.05);
    const mag = new THREE.Group(); mag.name = 'mag'; mag.position.set(0, -0.03, 0.02); mag.rotation.x = 0.24;
    part(mag, BX(0.022, 0.1, 0.04), m.metal, 0, -0.04, 0);
    part(mag, BX(0.026, 0.012, 0.044), m.metal, 0, -0.094, 0);
    g.add(mag);
    anchor(g, 'grip', 0, -0.04, 0.03);
    anchor(g, 'fore', -0.02, -0.05, 0.02);
    anchor(g, 'muzzle', 0, 0.062, -0.21);
    anchor(g, 'eject', 0.02, 0.07, -0.03);
    anchor(g, 'magwell', 0, -0.1, 0.04);
    return g;
  },
  usp(m) {
    const g = new THREE.Group();
    // 套筒：细长（比 deagle 窄）、顶部防反光肋、尾部防滑纹
    const slide = new THREE.Group(); slide.name = 'slide'; g.add(slide);
    part(slide, RB(0.028, 0.038, 0.215, 0.005), m.steel, 0, 0.06, -0.075);
    part(slide, RB1(0.014, 0.006, 0.2, 0.002), m.metal, 0, 0.081, -0.075);
    part(slide, RB1(0.008, 0.01, 0.02, 0.003), m.metal, 0, 0.08, -0.176);
    part(slide, BX(0.003, 0.008, 0.004), m.steel, 0, 0.088, -0.176);
    part(slide, RB1(0.024, 0.011, 0.018, 0.003), m.metal, 0, 0.079, 0.022);
    for (let i = 0; i < 3; i++) part(slide, BX(0.03, 0.03, 0.003), m.black, 0, 0.06, -0.002 + i * 0.011);
    part(slide, BX(0.02, 0.009, 0.05), m.black, 0.008, 0.064, -0.03);
    part(slide, CZ(0.0088, 0.011, 12), m.steel, 0, 0.06, -0.188);
    // 下机匣：深灰聚合物 + 附件导轨
    part(g, RB1(0.026, 0.032, 0.15, 0.005), m.black, 0, 0.026, -0.06);
    part(g, BX(0.016, 0.006, 0.08), m.black, 0, 0.008, -0.09);
    // 独立扳机护圈（前壁 + 下缘）
    part(g, RB1(0.008, 0.05, 0.008, 0.002), m.black, 0, -0.033, -0.078);
    part(g, RB1(0.008, 0.008, 0.062, 0.002), m.black, 0, -0.054, -0.047);
    part(g, RB1(0.007, 0.026, 0.009, 0.002), m.steel, 0, -0.03, -0.04);
    part(g, RB1(0.006, 0.01, 0.026, 0.002), m.metal, 0.014, 0.034, -0.015);
    // 握把：粗糙聚合物 + 防滑纹 + 底托
    part(g, RB1(0.03, 0.115, 0.05, 0.008), m.rubber, 0, -0.045, 0.015, 0.18);
    for (const y of [-0.032, -0.062]) part(g, BX(0.032, 0.005, 0.042), m.rubber, 0, y, 0.015 + (y + 0.047) * 0.18);
    part(g, RB1(0.03, 0.012, 0.052, 0.004), m.rubber, 0, -0.108, 0.025, 0.18);
    // 弹匣：藏进握把，底板外露
    const mag = new THREE.Group(); mag.name = 'mag'; mag.position.set(0, -0.09, 0.02); mag.rotation.x = 0.18;
    part(mag, RB1(0.024, 0.058, 0.04, 0.003), m.steel, 0, -0.028, 0);
    part(mag, RB1(0.028, 0.008, 0.045, 0.003), m.black, 0, -0.058, 0);
    g.add(mag);
    anchor(g, 'grip', 0, -0.04, 0.02);
    anchor(g, 'fore', -0.02, -0.045, 0.0);
    anchor(g, 'muzzle', 0, 0.06, -0.198);
    anchor(g, 'eject', 0.022, 0.066, -0.02);
    anchor(g, 'magwell', 0, -0.088, 0.02);
    return g;
  },
  glock18(m) {
    const g = new THREE.Group();
    // 套筒：短、方、前段平切（与 USP/deagle 轮廓明显不同）
    const slide = new THREE.Group(); slide.name = 'slide'; g.add(slide);
    part(slide, RB(0.034, 0.036, 0.16, 0.007), m.metal, 0, 0.06, -0.055);
    part(slide, RB1(0.015, 0.005, 0.145, 0.002), m.metal, 0, 0.079, -0.055);
    part(slide, RB1(0.009, 0.012, 0.018, 0.003), m.black, 0, 0.08, -0.126);
    part(slide, BX(0.003, 0.008, 0.004), m.steel, 0, 0.088, -0.126);
    part(slide, RB1(0.028, 0.012, 0.024, 0.004), m.black, 0, 0.078, 0.03);
    for (let i = 0; i < 3; i++) part(slide, BX(0.036, 0.026, 0.003), m.black, 0, 0.06, 0.008 + i * 0.011);
    part(slide, BX(0.022, 0.008, 0.028), m.metal, 0.009, 0.064, -0.012);
    part(slide, CZ(0.0095, 0.014, 12), m.steel, 0, 0.06, -0.135);
    // 聚合物机匣：比 USP 更厚更方
    part(g, RB1(0.032, 0.038, 0.13, 0.005), m.black, 0, 0.028, -0.045);
    part(g, BX(0.03, 0.012, 0.06), m.black, 0, 0.006, -0.07);
    part(g, RB1(0.03, 0.036, 0.008, 0.002), m.black, 0, -0.015, -0.084);
    part(g, RB1(0.03, 0.008, 0.056, 0.002), m.black, 0, -0.033, -0.056);
    part(g, RB1(0.008, 0.024, 0.009, 0.002), m.steel, 0, -0.012, -0.04);
    part(g, BX(0.008, 0.008, 0.03), m.steel, 0.017, 0.04, -0.012);       // 套筒释放杆
    // 握把：厚实深色聚合物 + 防滑纹 + 底托
    part(g, RB1(0.032, 0.125, 0.054, 0.008), m.rubber, 0, -0.05, 0.005, 0.16);
    for (const y of [-0.036, -0.07]) part(g, BX(0.034, 0.006, 0.046), m.rubber, 0, y, 0.005 + (y + 0.053) * 0.16);
    part(g, RB1(0.033, 0.014, 0.056, 0.004), m.black, 0, -0.116, 0.014, 0.16);
    // 弹匣：短肥 + 指托底板
    const mag = new THREE.Group(); mag.name = 'mag'; mag.position.set(0, -0.095, 0.01); mag.rotation.x = 0.16;
    part(mag, RB1(0.028, 0.055, 0.044, 0.003), m.steel, 0, -0.026, 0);
    part(mag, RB1(0.032, 0.009, 0.05, 0.003), m.black, 0, -0.055, 0);
    g.add(mag);
    anchor(g, 'grip', 0, -0.045, 0.01);
    anchor(g, 'fore', -0.02, -0.04, -0.01);
    anchor(g, 'muzzle', 0, 0.06, -0.1465);
    anchor(g, 'eject', 0.024, 0.064, -0.01);
    anchor(g, 'magwell', 0, -0.093, 0.01);
    return g;
  },
  knife(m) {
    const g = new THREE.Group();
    const sh = new THREE.Shape();
    sh.moveTo(0, -0.014); sh.lineTo(0.15, -0.012); sh.quadraticCurveTo(0.19, -0.008, 0.2, 0.012);
    sh.lineTo(0.13, 0.016); sh.lineTo(0.12, 0.012); sh.lineTo(0.03, 0.016); sh.lineTo(0, 0.016); sh.closePath();
    const bg = new THREE.ExtrudeGeometry(sh, { depth: 0.004, bevelEnabled: true, bevelThickness: 0.0015, bevelSize: 0.002, bevelSegments: 1 });
    bg.translate(0, 0, -0.002); bg.rotateY(Math.PI / 2);
    part(g, bg, m.blade, 0, 0.0, -0.035);
    part(g, CZ(0.004, 0.014, 8), m.steel, 0, 0.0, -0.152);          // 刀尖加强
    part(g, RB1(0.02, 0.05, 0.014, 0.003), m.metal, 0, 0.0, -0.03);
    part(g, RB1(0.028, 0.013, 0.016, 0.004), m.metal, 0, 0.0, -0.024); // 护手横挡
    // 握把：橡胶 + 防滑槽 + 金属尾帽
    part(g, RB1(0.024, 0.03, 0.11, 0.01), m.rubber, 0, 0.0, 0.03);
    for (let i = 0; i < 4; i++) part(g, BX(0.026, 0.032, 0.004), m.black, 0, 0, -0.005 + i * 0.022);
    part(g, RB1(0.026, 0.032, 0.022, 0.006), m.metal, 0, 0, 0.086);
    part(g, RB1(0.021, 0.026, 0.012, 0.004), m.steel, 0, 0, 0.1);
    anchor(g, 'grip', 0, 0, 0.03);
    anchor(g, 'muzzle', 0, 0, -0.23);
    return g;
  },
  he(m) {
    const g = new THREE.Group();
    // 弹体：压扁球 + 腰部刻槽 + 颈口
    const body = new THREE.SphereGeometry(0.034, 16, 12); body.scale(1, 1.25, 1);
    part(g, body, m.olive, 0, 0, 0);
    part(g, CY(0.0305, 0.007, 14), m.olive, 0, 0.008, 0);
    part(g, CY(0.0145, 0.03, 10), m.metal, 0, 0.041, 0);
    // 保险杆 + 拉环 + 引信座
    const lever = part(g, RB1(0.012, 0.072, 0.006, 0.002), m.metal, 0.0, 0.033, 0.0245, -0.2, 0, 0, 'lever');
    void lever;
    const pin = part(g, new THREE.TorusGeometry(0.012, 0.0022, 5, 10), m.steel, 0.022, 0.055, 0, 0, Math.PI / 2, 0, 'pin');
    void pin;
    part(g, BX(0.062, 0.014, 0.004), m.tan, 0, -0.004, 0.0315);          // 弹体识别带
    part(g, CY(0.0105, 0.011, 8), m.steel, 0, 0.059, 0);
    anchor(g, 'grip', 0, 0, 0.0);
    anchor(g, 'muzzle', 0, 0, -0.04);
    return g;
  },
};

export function buildGun(id) {
  const m = gunMaterials();
  const g = builders[id](m);
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
