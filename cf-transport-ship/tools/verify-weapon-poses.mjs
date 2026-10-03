// 确定性第一人称动作验收。冻结对战，以 120Hz 推进 ViewModel，避免死亡/换枪干扰截图。
// 运行：node tools/verify-weapon-poses.mjs <标签>
// POSE_BASELINE=1 允许旧版动作检查失败，保存对照证据；新版默认任何动作失败都会退出非零。
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const TAG = process.argv[2] || 'polish';
const BASE = process.env.M1_URL || 'http://127.0.0.1:8000/';
const CHROME = process.env.M1_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const DIR = 'tools/shots/weapon-poses';
const IDS = ['ak47', 'm4a1', 'awm', 'mp5', 'deagle', 'usp', 'glock18', 'knife', 'he'];
const results = [];
const errors = [];
const report = {};
const check = (id, name, ok, detail) => {
  results.push({ id, name, ok: !!ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${id} · ${name}`);
};

fs.mkdirSync(DIR, { recursive: true });
const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--mute-audio'] });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`${BASE}?nolock&q=low`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__game?.screens.visible === 'home', null, { timeout: 90000 });
  await page.evaluate(() => {
    const g = window.__game;
    g.startTeamMatch();
    g.player.updateCamera(0.025);
    g.renderFrame(0.025);
    g.simulate = () => {};
    g.renderFrame = () => g.renderer.render();
    g.hud.el.toast.style.opacity = 0;
    g.hud.el.protect.textContent = '';
    const vm = g.vm;
    const st = { speed: 0, onGround: true, crouch: false, lookDX: 0, lookDY: 0, sunDirCam: vm.sun.position.clone().set(0.5, 1, 0.3), light: 1, indoor: false };
    window.__poseAdvance = (seconds) => {
      for (let t = 0; t < seconds - 1e-9;) {
        const dt = Math.min(1 / 120, seconds - t);
        vm.update(dt, st);
        t += dt;
      }
      g.renderer.render();
    };
    window.__poseRest = () => {
      const drift = [];
      for (const [key, rest] of Object.entries(vm.partRest)) {
        const part = vm.parts[key];
        if (part.position.distanceTo(rest.p) > 1e-7 || ['x', 'y', 'z'].some((axis) => Math.abs(part.rotation[axis] - rest.r[axis]) > 1e-7) || !part.visible) drift.push(key);
      }
      return { animation: vm.anim?.type || null, drift, finite: [...vm.holder.position.toArray(), ...vm.holder.rotation.toArray().slice(0, 3), ...vm.arms.R.hand.position.toArray(), ...vm.arms.L.hand.position.toArray()].every(Number.isFinite) };
    };
    window.__poseBounds = () => {
      const cam = g.renderer.vmCamera;
      vm.rig.updateMatrixWorld(true);
      const v = vm.holder.position.clone();
      let count = 0, clipped = 0;
      const bounds = [Infinity, Infinity, -Infinity, -Infinity];
      vm.cur.traverse((o) => {
        if (!o.isMesh || !o.geometry?.attributes.position) return;
        for (let p = o; p; p = p.parent) if (!p.visible) return;
        const positions = o.geometry.attributes.position;
        for (let i = 0; i < positions.count; i++) {
          v.fromBufferAttribute(positions, i).applyMatrix4(o.matrixWorld).project(cam);
          if (v.z < -1 || v.z > 1 || Math.abs(v.x) > 1 || Math.abs(v.y) > 1) clipped++;
          bounds[0] = Math.min(bounds[0], v.x); bounds[1] = Math.min(bounds[1], v.y);
          bounds[2] = Math.max(bounds[2], v.x); bounds[3] = Math.max(bounds[3], v.y);
          count++;
        }
      });
      const grip = vm.parts.grip.getWorldPosition(v).project(cam);
      return { bounds: bounds.map((n) => +n.toFixed(3)), clippedFraction: +(clipped / Math.max(count, 1)).toFixed(4), gripInView: Math.abs(grip.x) < 1 && Math.abs(grip.y) < 1 && grip.z > -1 && grip.z < 1 };
    };
    window.__poseIdle = () => ({ position: vm.holder.position.toArray(), rotation: vm.holder.rotation.toArray().slice(0, 3) });
  });

  for (const id of IDS) {
    const initial = await page.evaluate((wid) => {
      const g = window.__game, p = g.player, vm = g.vm;
      const slot = ['deagle', 'usp', 'glock18'].includes(wid) ? 1 : wid === 'knife' ? 2 : wid === 'he' ? 3 : 0;
      p.giveLoadout({ primary: slot === 0 ? wid : 'ak47', secondary: slot === 1 ? wid : 'deagle', melee: 'knife', throwable: 'he' });
      p.slot = slot;
      g.hud.slots(p.inv, slot);
      g.hud.el.wName.textContent = p.weapon.def.hudName;
      g.hud.el.wIcon.src = g.hud.icons[wid];
      g.hud.el.aMag.textContent = slot === 2 ? '∞' : p.weapon.mag;
      g.hud.el.aRes.textContent = slot < 2 ? `/ ${p.weapon.reserve}` : '';
      vm.equip(wid, p.weapon.def.draw);
      vm.setVisible(true);
      vm.sway.set(0, 0); vm.bobK = 0; vm.land = 0;
      window.__poseAdvance(vm.drawDur + 0.03);
      return { idle: window.__poseIdle(), bounds: window.__poseBounds(), rest: window.__poseRest(), reload: p.weapon.def.reload || null };
    }, id);
    report[id] = { initial };
    check(id, '持枪与手位有限，握持点在画面内', initial.rest.finite && initial.bounds.gripInView, initial);
    await page.screenshot({ path: `${DIR}/${TAG}-${id}-idle.png` });

    await page.evaluate(() => { window.__game.vm.inspect(); window.__poseAdvance(0.95); });
    report[id].inspectBounds = await page.evaluate(() => window.__poseBounds());
    await page.screenshot({ path: `${DIR}/${TAG}-${id}-inspect.png` });
    const inspected = await page.evaluate(() => { window.__poseAdvance(1.7); return { pose: window.__poseIdle(), rest: window.__poseRest() }; });
    check(id, '检视结束回到持枪位置与角度', inspected.rest.animation === null && inspected.rest.drift.length === 0 && inspected.pose.rotation.every((n, i) => Math.abs(n - initial.idle.rotation[i]) < 1e-7) && [0, 2].every((i) => Math.abs(inspected.pose.position[i] - initial.idle.position[i]) < 1e-7), inspected);

    if (initial.reload) {
      for (const empty of [false, true]) {
        const midway = await page.evaluate(({ dur, empty }) => {
          const vm = window.__game.vm;
          vm.reload(dur, empty);
          window.__poseAdvance(dur * 0.5);
          const expected = vm.parts.reloadGrip
            ? vm.parts.reloadGrip.getWorldPosition(vm.holder.position.clone())
            : vm.parts.mag.localToWorld(vm.holder.position.clone().set(0, -0.055, 0.01));
          return { handGap: vm.arms.L.hand.getWorldPosition(vm.holder.position.clone()).distanceTo(expected), animation: vm.anim?.type, duration: vm.anim?.dur };
        }, { dur: initial.reload, empty });
        check(id, `${empty ? '空仓' : '普通'}换弹中左手贴合本帧弹匣`, midway.handGap < 0.002 && midway.duration === initial.reload, midway);
        if (empty) await page.screenshot({ path: `${DIR}/${TAG}-${id}-reload.png` });
        const finished = await page.evaluate((dur) => {
          window.__poseAdvance(dur * 0.49);
          const stillReloading = window.__game.vm.anim?.type === 'reload';
          window.__poseAdvance(dur * 0.02);
          return { stillReloading, rest: window.__poseRest() };
        }, initial.reload);
        check(id, `${empty ? '空仓' : '普通'}换弹依原时长结束且零件归位`, finished.stillReloading && finished.rest.animation === null && finished.rest.drift.length === 0, finished);
      }
    }

    if (id === 'awm') {
      const bolt = await page.evaluate(() => {
        const vm = window.__game.vm;
        vm.fire();
        window.__poseAdvance(0.65);
        const anchor = vm.parts.boltGrip || vm.parts.boltHandle || vm.parts.bolt;
        const expected = anchor.getWorldPosition(vm.holder.position.clone());
        const handGap = vm.arms.R.hand.getWorldPosition(vm.holder.position.clone()).distanceTo(expected);
        window.__poseAdvance(0.7);
        return { handGap, rest: window.__poseRest() };
      });
      report[id].bolt = bolt;
      check(id, '拉栓手位跟随命名锚点且枪栓归位', bolt.handGap < 0.002 && bolt.rest.animation === null && bolt.rest.drift.length === 0, bolt);
    } else if (id === 'knife') {
      for (const heavy of [false, true]) {
        const knife = await page.evaluate((heavy) => {
          const vm = window.__game.vm;
          vm.equip('knife', 0.01); window.__poseAdvance(0.02);
          const idle = window.__poseIdle();
          vm.melee(heavy);
          vm.anim.t = vm.anim.dur;
          window.__poseAdvance(0.001);
          return { idle, end: window.__poseIdle(), rest: window.__poseRest() };
        }, heavy);
        check(id, `${heavy ? '重击' : '轻击'}结束帧自然回握`, knife.rest.animation === null && knife.end.rotation.every((n, i) => Math.abs(n - knife.idle.rotation[i]) < 1e-7) && knife.end.position.every((n, i) => Math.abs(n - knife.idle.position[i]) < (i === 1 ? 0.004 : 1e-7)), knife);
      }
    } else if (id === 'he') {
      const thrown = await page.evaluate(() => { const vm = window.__game.vm; vm.throwNade(); window.__poseAdvance(0.76); return { visible: vm.cur.visible, rest: window.__poseRest() }; });
      check(id, '投掷结束收起手雷且保险零件不残留', !thrown.visible && thrown.rest.animation === null && thrown.rest.drift.length === 0, thrown);
    }

    const cancelled = await page.evaluate((wid) => {
      const vm = window.__game.vm;
      vm.equip(wid, 0.01); window.__poseAdvance(0.02);
      vm.inspect(); window.__poseAdvance(0.45);
      vm.equip(wid === 'ak47' ? 'm4a1' : 'ak47', 0.01);
      vm.equip(wid, 0.01); window.__poseAdvance(0.02);
      return window.__poseRest();
    }, id);
    check(id, '切枪中断后再次拿出无位移与可见性残留', cancelled.animation === null && cancelled.drift.length === 0 && cancelled.finite, cancelled);
  }
} catch (error) {
  errors.push(String(error.stack || error));
} finally {
  await browser.close();
}
const passed = results.filter((r) => r.ok).length;
const failed = results.length - passed;
fs.writeFileSync(`${DIR}/${TAG}-report.json`, JSON.stringify({ passed, failed, results, report, errors }, null, 2));
console.log(`武器动作：${passed} 通过 / ${failed} 失败，控制台错误 ${errors.length}`);
if (errors.length) console.log(errors.join('\n'));
process.exit(errors.length || (failed && process.env.POSE_BASELINE !== '1') ? 1 : 0);
