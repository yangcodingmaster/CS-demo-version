// 从正在运行的构建采集彩色模型，固定灯光与视角，便于精修前后人工对照。
// node tools/capture-weapon-studio.mjs before|after [url]
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const tag = process.argv[2] || 'now';
const url = process.argv[3] || 'http://127.0.0.1:8000/';
const dir = 'tools/shots/guns';
fs.mkdirSync(dir, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.M1_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--mute-audio'],
});
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__game?.screens?.visible === 'home', null, { timeout: 90000 });
  await page.addStyleTag({ content: 'body > :not(#c) { display: none !important; }' });
  const ids = await page.evaluate(() => Object.keys(window.__game.hud.icons));
  const report = {};
  for (const id of ids) {
    report[id] = await page.evaluate((weaponId) => {
      const g = window.__game;
      g.simulate = () => {};
      g.vm.equip(weaponId, 0.001);
      g.vm.resetParts();
      const model = g.vm.cur.clone(true);
      model.position.set(0, 0, 0);
      model.rotation.set(0, 0, 0);
      const scene = new g.renderer.vmScene.constructor();
      scene.background = new g.vm.sun.color.constructor('#b8c0c8');
      scene.environment = g.renderer.vmScene.environment;
      scene.environmentIntensity = 0.75;
      scene.add(model);
      model.updateMatrixWorld(true);
      const lo = g.renderer.camera.position.clone().set(Infinity, Infinity, Infinity);
      const hi = lo.clone().set(-Infinity, -Infinity, -Infinity);
      let triangles = 0;
      model.traverse((o) => {
        // 枪口火焰为共享特效，不参与静态模型包围盒。
        let visible = true;
        for (let parent = o; parent; parent = parent.parent) visible &&= parent.visible;
        if (!o.isMesh || !visible) return;
        o.geometry.computeBoundingBox();
        const box = o.geometry.boundingBox;
        triangles += (o.geometry.index?.count || o.geometry.attributes.position.count) / 3;
        for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
          const v = lo.clone().set(x, y, z).applyMatrix4(o.matrixWorld);
          lo.min(v);
          hi.max(v);
        }
      });
      const center = lo.clone().add(hi).multiplyScalar(0.5);
      const size = hi.clone().sub(lo);
      const camera = g.renderer.vmCamera.clone();
      camera.fov = 32;
      const distance = Math.max(size.z / camera.aspect, size.y, size.x) / (2 * Math.tan(camera.fov * Math.PI / 360)) * 1.65;
      camera.position.copy(center).add(lo.clone().set(1, 0.42, 0.24).normalize().multiplyScalar(distance));
      camera.lookAt(center);
      camera.updateProjectionMatrix();
      const sun = g.vm.sun.clone();
      sun.position.set(-1, 3, 2);
      sun.intensity = 3;
      sun.castShadow = false;
      const fill = g.vm.fill.clone();
      fill.intensity = 2;
      const edge = sun.clone();
      edge.position.set(2, 1, -2);
      edge.intensity = 2;
      scene.add(sun, fill, edge);
      g.renderFrame = () => {
        const r = g.renderer.renderer;
        r.setRenderTarget(null);
        r.render(scene, camera);
      };
      g.renderFrame();
      return { triangles, bounds: size.toArray() };
    }, id);
    await page.screenshot({ path: `${dir}/${tag}-studio-${id}.png` });
  }
  fs.writeFileSync(`${dir}/${tag}-studio.json`, JSON.stringify({ models: report, errors }, null, 2));
  console.log(JSON.stringify({ tag, count: ids.length, errors }));
  if (errors.length) process.exitCode = 1;
} finally {
  await browser.close();
}
