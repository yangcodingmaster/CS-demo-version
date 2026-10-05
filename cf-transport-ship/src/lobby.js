// 备战大厅：借用游戏渲染器，人物及房间与战斗场景完全独立。
import * as THREE from 'three';
import { Soldier } from './character.js';
import { WEAPONS } from './weapons.js';

function bevelBox(w, h, d, radius = 0.012) {
  const r = Math.min(radius, w / 4, h / 4, d / 3);
  const shape = new THREE.Shape();
  const x = -w / 2 + r, y = -h / 2 + r, innerW = w - 2 * r, innerH = h - 2 * r;
  shape.moveTo(x, y);
  shape.lineTo(x + innerW, y);
  shape.lineTo(x + innerW, y + innerH);
  shape.lineTo(x, y + innerH);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.001, d - 2 * r),
    bevelEnabled: true,
    bevelThickness: r,
    bevelSize: r,
    bevelSegments: 3,
    steps: 1,
  });
  geo.translate(0, 0, -d / 2 + r);
  geo.computeVertexNormals();
  return geo;
}

export class Lobby {
  constructor(renderer, T = {}) {
    this.renderer = renderer;
    this.T = T;
    this.disposed = false;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x10161f);
    this.camera = new THREE.PerspectiveCamera(34, 16 / 9, 0.05, 40);
    this.camera.position.set(1.95, 1.72, -2.7);
    this.camera.lookAt(0, 1.44, 0);
    this.root = new THREE.Group();
    this.root.name = 'lobby';
    this.scene.add(this.root);
    this.ownedGeometries = new Set();
    this.ownedMaterials = new Set();
    this.ownedTextures = new Set();
    this.soldiers = new Map();
    this.team = 'GR';
    this.weaponId = 'ak47';
    this.mode = 'team';
    this.elapsed = 0;
    this.lastFrame = null;
    this.buildRoom();
    this.sync({ team: this.team, weaponId: this.weaponId, mode: this.mode });
    this.update(0, 0);
  }

  material(options) {
    const material = new THREE.MeshStandardMaterial(options);
    this.ownedMaterials.add(material);
    return material;
  }

  mesh(geometry, material, position, parent = this.root, shadow = true) {
    this.ownedGeometries.add(geometry);
    const mesh = new THREE.Mesh(geometry, material);
    if (position) mesh.position.set(...position);
    mesh.castShadow = shadow;
    mesh.receiveShadow = shadow;
    parent.add(mesh);
    return mesh;
  }

  box(size, material, position, parent = this.root, radius = 0.012) {
    return this.mesh(bevelBox(...size, radius), material, position, parent);
  }

  buildRoom() {
    const dark = this.material({ color: 0x18212b, roughness: 0.82, metalness: 0.22 });
    const panel = this.material({ color: 0x222b33, roughness: 0.7, metalness: 0.32 });
    const floor = this.material({ color: 0x293138, roughness: 0.83, metalness: 0.12 });
    const black = this.material({ color: 0x0b1017, roughness: 0.58, metalness: 0.42 });
    const gear = this.material({ color: 0x384038, roughness: 0.91, metalness: 0.04 });
    const light = this.material({
      color: 0xffcf82,
      emissive: 0xffb45a,
      emissiveIntensity: 1.15,
      roughness: 0.35,
    });
    const coolLight = this.material({
      color: 0x93c2d4,
      emissive: 0x4a8296,
      emissiveIntensity: 0.65,
      roughness: 0.4,
    });

    const ground = this.mesh(new THREE.PlaneGeometry(22, 18), floor, [0, -0.015, 0]);
    ground.rotation.x = -Math.PI / 2;
    ground.castShadow = false;
    this.box([12, 5.2, 0.2], dark, [0, 2.1, 2.2]);
    // 墙面分缝和窄灯带，提供备战室的空间感，不抢占角色区域。
    for (let x = -4.4; x <= 4.4; x += 1.1) {
      this.box([1.065, 2.25, 0.045], panel, [x, 1.25, 2.07], this.root, 0.009);
      this.box([1.065, 1.55, 0.04], panel, [x, 3.18, 2.075], this.root, 0.008);
    }
    this.box([10.5, 0.05, 0.065], black, [0, 0.20, 2.035]);
    this.box([0.025, 1.98, 0.028], light, [-2.85, 1.50, 2.03], this.root, 0.005);
    this.box([0.035, 1.84, 0.028], coolLight, [1.73, 1.54, 2.03], this.root, 0.005);
    // 低矮装备桌位于角色后方，两侧留出呼吸空间。
    this.box([1.85, 0.085, 0.56], black, [-1.95, 0.62, 1.55]);
    for (const x of [-2.66, -1.22]) this.box([0.065, 0.61, 0.065], panel, [x, 0.28, 1.55]);
    this.box([0.61, 0.23, 0.39], gear, [-2.43, 0.77, 1.57], this.root, 0.025);
    this.box([0.54, 0.045, 0.40], panel, [-2.43, 0.895, 1.57]);
    this.box([0.11, 0.025, 0.11], black, [-2.43, 0.923, 1.57]);
    this.box([0.45, 0.10, 0.27], gear, [-1.66, 0.71, 1.58], this.root, 0.020);
    // 真实平面接触阴影不依赖显示质量；没有展示台或人物底座。
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 128;
    const context = canvas.getContext('2d');
    const gradient = context.createRadialGradient(64, 64, 4, 64, 64, 62);
    gradient.addColorStop(0, 'rgba(0,0,0,0.55)');
    gradient.addColorStop(0.4, 'rgba(0,0,0,0.32)');
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, 128, 128);
    const texture = new THREE.CanvasTexture(canvas);
    this.ownedTextures.add(texture);
    const shadowMaterial = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    });
    this.ownedMaterials.add(shadowMaterial);
    const contact = this.mesh(new THREE.PlaneGeometry(1.2, 0.93), shadowMaterial, [0, -0.008, 0], this.root, false);
    contact.rotation.x = -Math.PI / 2;

    this.scene.add(new THREE.HemisphereLight(0xc4d8e9, 0x494134, 1.1));
    const key = new THREE.DirectionalLight(0xffecdb, 2.7);
    key.position.set(1.8, 3.9, -3.5);
    key.target.position.set(0, 1.2, 0);
    key.castShadow = true;
    key.shadow.mapSize.set(rendererQuality(this.renderer) === 'high' ? 2048 : 1024, rendererQuality(this.renderer) === 'high' ? 2048 : 1024);
    key.shadow.camera.left = -3;
    key.shadow.camera.right = 3;
    key.shadow.camera.top = 3;
    key.shadow.camera.bottom = -3;
    key.shadow.camera.near = 0.1;
    key.shadow.camera.far = 10;
    key.shadow.bias = -0.0005;
    key.shadow.normalBias = 0.015;
    key.shadow.radius = 2.5;
    this.scene.add(key, key.target);
    this.shadowLight = key;
    const rim = new THREE.PointLight(0xffba70, 17, 7, 2);
    rim.position.set(-1.0, 2.5, 1.1);
    this.scene.add(rim);
    const fill = new THREE.PointLight(0x91bddb, 7, 6, 2);
    fill.position.set(-2.1, 1.9, -1.4);
    this.scene.add(fill);
  }

  buildCharacter(team) {
    const soldier = new Soldier(team);
    // Soldier 的纹理、骨架几何和合并枪械按游戏生命周期共享，仅拥有此处 material。
    // 战斗底模为远景设计。大厅保留其骨架和 IK，仅以专用圆润几何替换可见身形。
    soldier.material.visible = false;
    const vest = this.material({ color: team === 'GR' ? 0x35445a : 0x454a3d, roughness: 0.83 });
    const trim = this.material({ color: team === 'GR' ? 0x647383 : 0x77796c, roughness: 0.76 });
    const cloth = this.material({ color: team === 'GR' ? 0x46576c : 0x272b30, roughness: 0.89 });
    const glove = this.material({ color: 0x23282d, roughness: 0.82 });
    const rubber = this.material({ color: 0x10161c, roughness: 0.67 });
    const metal = this.material({ color: 0x88949c, roughness: 0.34, metalness: 0.82 });
    const accent = this.material({ color: team === 'GR' ? 0x407dd0 : 0xb35b4d, roughness: 0.58 });
    const lens = this.material({
      color: team === 'GR' ? 0x7ac2d6 : 0xe4a657,
      roughness: 0.23,
      metalness: 0.56,
      transparent: true,
      opacity: 0.82,
    });
    const B = soldier.B;
    const ellipse = (radius, scale, material, position, bone) => {
      const geometry = new THREE.SphereGeometry(radius, 16, 12);
      geometry.scale(...scale);
      return this.mesh(geometry, material, position, bone);
    };
    const limb = (radius, length, material, position, bone) =>
      this.mesh(new THREE.CapsuleGeometry(radius, length, 4, 14), material, position, bone);
    this.box([0.345, 0.235, 0.224], cloth, [0, 0.085, 0], B.spine, 0.031);
    ellipse(0.211, [1, 0.86, 0.63], cloth, [0, 0.088, 0.013], B.chest);
    ellipse(0.122, [1.42, 1.08, 0.91], cloth, [0, -0.016, 0.016], B.hips);
    this.box([0.352, 0.045, 0.248], rubber, [0, 0.066, 0.008], B.hips, 0.014);
    this.box([0.043, 0.036, 0.015], metal, [0, 0.066, -0.131], B.hips, 0.008);
    for (const side of ['R', 'L']) {
      const sx = side === 'R' ? 1 : -1;
      ellipse(0.087, [1.08, 1.08, 1.02], cloth, [0, -0.04, 0.005], B['upperArm' + side]);
      limb(0.066, 0.19, cloth, [0, -0.15, 0], B['upperArm' + side]);
      limb(0.052, 0.185, cloth, [0, -0.125, 0], B['forearm' + side]);
      limb(0.090, 0.27, cloth, [0, -0.206, 0.012], B['thigh' + side]);
      limb(0.068, 0.28, cloth, [0, -0.204, 0], B['shin' + side]);
      this.box([0.137, 0.155, 0.255], rubber, [0, 0.013, -0.040], B['foot' + side], 0.025);
      this.box([0.074, 0.091, 0.088], vest, [sx * 0.062, -0.18, 0.007], B['thigh' + side], 0.016);
      this.box([0.022, 0.06, 0.05], accent, [sx * 0.069, -0.097, -0.014], B['upperArm' + side], 0.008);
    }
    limb(0.063, 0.035, rubber, [0, 0.038, 0], B.neck);
    ellipse(0.108, [1.04, 1.15, 1.08], rubber, [0, 0.100, 0.007], B.head);
    ellipse(0.100, [1.04, 0.73, 1.09], cloth, [0, 0.064, -0.013], B.head);
    if (team === 'GR') {
      const helmet = new THREE.SphereGeometry(0.134, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.55);
      helmet.scale(1.04, 0.91, 1.08);
      this.mesh(helmet, vest, [0, 0.126, 0.005], B.head);
      this.box([0.221, 0.014, 0.040], trim, [0, 0.148, -0.110], B.head, 0.004);
    }
    this.box([0.40, 0.32, 0.045], vest, [0, 0.075, -0.161], B.chest, 0.012);
    this.box([0.22, 0.10, 0.025], cloth, [0, 0.14, -0.193], B.chest, 0.008);
    for (const side of [-1, 1]) {
      const strap = this.box([0.052, 0.33, 0.040], vest, [side * 0.152, 0.09, -0.159], B.chest, 0.009);
      strap.rotation.z = side * -0.11;
      this.box([0.047, 0.047, 0.016], metal, [side * 0.151, 0.17, -0.187], B.chest, 0.007);
      const shoulderStrap = this.box([0.045, 0.023, 0.148], cloth, [side * 0.125, 0.211, 0.009], B.chest, 0.005);
      shoulderStrap.rotation.z = side * -0.24;
    }
    for (const x of [-0.107, 0, 0.107]) {
      this.box([0.088, 0.119, 0.063], vest, [x, -0.035, -0.175], B.chest, 0.011);
      this.box([0.073, 0.025, 0.016], trim, [x, 0.008, -0.214], B.chest, 0.006);
    }
    for (const y of [0.075, 0.11]) {
      for (const x of [-0.045, 0.045]) this.box([0.061, 0.014, 0.008], trim, [x, y, -0.213], B.chest, 0.003);
    }
    this.box([0.075, 0.043, 0.013], accent, [-0.105, 0.163, -0.215], B.chest, 0.006);
    this.box([0.10, 0.033, 0.013], rubber, [0.056, 0.18, -0.217], B.chest, 0.005);
    // 布料衣领沿颈部两侧收口，避免放大后出现裸露的细柱颈。
    for (const side of [-1, 1]) {
      const collar = this.box([0.049, 0.085, 0.10], cloth, [side * 0.055, 0.005, 0.008], B.neck, 0.011);
      collar.rotation.z = side * 0.23;
    }
    this.box([0.077, 0.035, 0.025], cloth, [0, -0.019, -0.043], B.neck, 0.008);
    const lensY = team === 'GR' ? 0.155 : 0.12;
    this.box([0.215, 0.055, 0.026], rubber, [0, lensY, -0.117], B.head, 0.008);
    for (const side of [-1, 1]) {
      this.box([0.085, 0.035, 0.012], lens, [side * 0.051, lensY, -0.140], B.head, 0.005);
      this.box([0.024, 0.060, 0.081], rubber, [side * 0.118, lensY - 0.012, -0.030], B.head, 0.008);
      this.box([0.016, 0.030, 0.023], metal, [side * 0.123, lensY - 0.011, -0.076], B.head, 0.005);
    }
    if (team === 'GR') {
      this.box([0.057, 0.015, 0.177], trim, [0, 0.253, 0.013], B.head, 0.004);
      this.box([0.048, 0.031, 0.018], rubber, [0, 0.231, -0.111], B.head, 0.005);
    }
    for (const side of ['R', 'L']) {
      const cuff = this.mesh(new THREE.CylinderGeometry(0.061, 0.056, 0.052, 12), cloth, [0, -0.237, 0], B['forearm' + side]);
      cuff.receiveShadow = false;
      ellipse(0.050, [0.85, 1.05, 0.72], glove, [0, -0.038, 0], B['hand' + side]);
      this.box([0.052, 0.034, 0.017], rubber, [0, -0.027, -0.034], B['hand' + side], 0.005);
      this.box([0.090, 0.056, 0.020], cloth, [0, -0.104, -0.061], B['forearm' + side], 0.006);
    }
    // 衣服的块面、精细装备和现有骨架一起动画；不修改战斗命中盒。
    soldier.root.rotation.y = 0.10;
    return soldier;
  }

  sync({ team = this.team, weaponId = this.weaponId, mode = this.mode, environment } = {}) {
    if (this.disposed) return;
    const nextTeam = team === 'BL' ? 'BL' : 'GR';
    const nextWeapon = WEAPONS[weaponId] ? weaponId : 'ak47';
    if (!this.soldier || nextTeam !== this.team) {
      if (this.soldier) this.root.remove(this.soldier.root);
      if (!this.soldiers.has(nextTeam)) this.soldiers.set(nextTeam, this.buildCharacter(nextTeam));
      this.soldier = this.soldiers.get(nextTeam);
      this.root.add(this.soldier.root);
    }
    this.team = nextTeam;
    this.weaponId = nextWeapon;
    this.mode = mode === 'bomb' ? 'bomb' : 'team';
    this.soldier.setWeapon(nextWeapon);
    // 环境纹理来自游戏主场景，其所有权仍归 Environment。
    if (environment !== undefined) this.scene.environment = environment || null;
    this.scene.environmentIntensity = 0.24;
  }

  frameCamera() {
    const canvas = this.renderer.renderer.domElement;
    const width = canvas.clientWidth || window.innerWidth || 1280;
    const height = canvas.clientHeight || window.innerHeight || 720;
    const stage = document.querySelector('.lobbyStage[data-role="lobbyStage"]');
    const box = stage?.getBoundingClientRect();
    const valid = box && box.width > 80 && box.height > 80;
    const cx = valid ? box.left + box.width / 2 : width * 0.29;
    const cy = valid ? box.top + box.height / 2 : height * 0.51;
    const stageHeight = valid ? box.height : height * 0.76;
    const frame = [width, height, cx, cy, stageHeight].map((value) => Math.round(value)).join(':');
    if (this.lastFrame === frame) return;
    this.lastFrame = frame;
    const distance = this.camera.position.distanceTo(new THREE.Vector3(0, 1.44, 0));
    const visibleHeight = 1.33 * height / Math.max(height * 0.42, stageHeight);
    this.camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(visibleHeight / (2 * distance)));
    this.camera.setViewOffset(width, height, width / 2 - cx, height / 2 - cy, width, height);
    this.camera.updateProjectionMatrix();
  }

  update(dt, time) {
    if (this.disposed) return;
    const step = Number.isFinite(dt) ? THREE.MathUtils.clamp(dt, 0, 0.1) : 0;
    this.elapsed = Number.isFinite(time) ? time : this.elapsed + step;
    const t = this.elapsed;
    const breathing = Math.sin(t * 1.65);
    const sway = Math.sin(t * 0.47);
    const soldier = this.soldier;
    soldier.root.position.set(sway * 0.009, breathing * 0.004, 0);
    soldier.root.rotation.y = 0.10 + sway * 0.014;
    soldier.update(step, {
      speed: 0,
      fwd: 0,
      side: 0,
      crouch: false,
      pitch: -0.075 + breathing * 0.012,
      onGround: true,
      reloading: false,
    });
    soldier.mesh.updateMatrixWorld(true);
    this.frameCamera();
  }

  render() {
    if (this.disposed) return;
    const R = this.renderer;
    const uniforms = R.fx.uniforms;
    const saved = {
      scene: R.worldPass.scene,
      camera: R.worldPass.camera,
      vmEnabled: R.vmPass.enabled,
      exposure: R.renderer.toneMappingExposure,
      bloomStrength: R.bloom?.strength,
      bloomThreshold: R.bloom?.threshold,
      bloomRadius: R.bloom?.radius,
      fx: Object.fromEntries(Object.keys(uniforms).filter((key) => key !== 'tDiffuse').map((key) => [key, uniforms[key].value])),
    };
    try {
      R.worldPass.scene = this.scene;
      R.worldPass.camera = this.camera;
      R.vmPass.enabled = false;
      R.renderer.toneMappingExposure = 0.86;
      if (R.bloom) {
        R.bloom.strength = 0.12;
        R.bloom.threshold = 1.6;
        R.bloom.radius = 0.25;
      }
      for (const [key, uniform] of Object.entries(uniforms)) {
        if (key !== 'tDiffuse') uniform.value = key === 'uTime' ? this.elapsed : key === 'uVignette' ? 0.19 : 0;
      }
      R.composer.render();
    } finally {
      R.worldPass.scene = saved.scene;
      R.worldPass.camera = saved.camera;
      R.vmPass.enabled = saved.vmEnabled;
      R.renderer.toneMappingExposure = saved.exposure;
      if (R.bloom) {
        R.bloom.strength = saved.bloomStrength;
        R.bloom.threshold = saved.bloomThreshold;
        R.bloom.radius = saved.bloomRadius;
      }
      for (const [key, value] of Object.entries(saved.fx)) uniforms[key].value = value;
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.scene.environment = null;
    for (const soldier of this.soldiers.values()) {
      soldier.material.dispose();
      soldier.mesh.skeleton.dispose();
      soldier.root.removeFromParent();
    }
    for (const geometry of this.ownedGeometries) geometry.dispose();
    for (const material of this.ownedMaterials) material.dispose();
    for (const texture of this.ownedTextures) texture.dispose();
    this.shadowLight.shadow.dispose();
    this.soldiers.clear();
    this.root.clear();
    this.scene.clear();
  }
}

function rendererQuality(renderer) {
  return renderer.quality || 'medium';
}
