// C4 是任务物件，不占四个背包槽位。模型在游戏生命周期内复用。
import * as THREE from 'three';

function makeC4() {
  const root = new THREE.Group();
  const body = new THREE.MeshStandardMaterial({ color: 0x667255, roughness: 0.85 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x242b2b, roughness: 0.65 });
  const metal = new THREE.MeshStandardMaterial({ color: 0x88918a, roughness: 0.45, metalness: 0.5 });
  const lit = new THREE.MeshBasicMaterial({ color: 0x85e7a3, toneMapped: false });
  const box = (w, h, d, x, y, z, material) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    m.position.set(x, y, z); m.castShadow = true; root.add(m); return m;
  };
  box(0.32, 0.22, 0.12, 0, 0, 0, body);
  box(0.21, 0.16, 0.015, 0, 0, 0.069, dark);
  box(0.15, 0.032, 0.006, 0, 0.052, 0.08, lit);
  for (let row = 0; row < 3; row++) for (let col = 0; col < 3; col++) {
    box(0.032, 0.023, 0.006, (col - 1) * 0.05, 0.008 - row * 0.035, 0.08, metal);
  }
  box(0.023, 0.235, 0.135, -0.135, 0, 0, dark);
  box(0.023, 0.235, 0.135, 0.135, 0, 0, dark);
  root.userData.lamp = lit;
  return root;
}

export class BombVisual {
  constructor(scene, vmScene) {
    this.world = makeC4(); this.held = makeC4();
    this.held.position.set(0.18, -0.12, -0.68);
    this.held.scale.setScalar(0.8);
    this.held.rotation.set(-0.18, -0.15, 0.05);
    const glove = new THREE.MeshStandardMaterial({ color: 0x1b1b1d, roughness: 0.7 });
    const sleeve = new THREE.MeshStandardMaterial({ color: 0x262a2c, roughness: 0.9 });
    for (const side of [-1, 1]) {
      const palm = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.08, 0.08), glove);
      palm.position.set(side * 0.17, -0.045, 0.025);
      const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.04, 0.25, 4, 10), sleeve);
      arm.position.set(side * 0.21, -0.22, 0.105); arm.rotation.x = -0.65; arm.rotation.z = side * 0.22;
      this.held.add(palm, arm);
    }
    this.world.rotation.x = -Math.PI / 2;
    scene.add(this.world); vmScene.add(this.held);
    this.reset();
  }
  reset() { this.world.visible = this.held.visible = false; }
  update(bomb, player, now, playing) {
    const placed = bomb && ['dropped', 'planted'].includes(bomb.bomb.state);
    this.world.visible = !!(playing && placed && bomb.bomb.position);
    if (this.world.visible) {
      this.world.position.copy(bomb.bomb.position); this.world.position.y += 0.095;
      const blink = bomb.bomb.state === 'planted' && Math.sin(now * 8) < 0;
      this.world.userData.lamp.color.set(blink ? 0xec644b : 0x85e7a3);
    }
    this.held.visible = !!(playing && player?.alive && player.c4Selected && bomb?.carrierId === player.id && bomb.bomb.state === 'carried');
  }
}
