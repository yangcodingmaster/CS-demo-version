import test from 'node:test';
import assert from 'node:assert/strict';
import { Actor } from '../src/actor.js';
import { WEAPONS, WeaponState } from '../src/weapons.js';
import { Profile } from '../src/profile.js';

function actor(id) {
  const a = Object.create(Actor.prototype);
  Object.assign(a, { inv: [new WeaponState(id)], slot: 0, isPlayer: true, readyAt: 0, scoped: 1, scopeT: 0, reScope: 0, scopeReady: true, speed: 0, onGround: true, crouch: false, punchP: 0, punchY: 0, aimPunch: 0, stats: { shots: 0 }, protectT: 0 });
  a.game = { time: 1, shots: 0, fireWeapon() { this.shots++; }, onScope() {}, onReloadStart() {}, onReloadDone() {} };
  return a;
}
for (const id of ['scar', 'qbz95', 'p90', 'barrett']) {
  test(`${id} 档案保存、重新加载与换弹保持弹药守恒`, () => {
    const data = new Map();
    const storage = { getItem: (k) => data.get(k) ?? null, setItem: (k,v) => data.set(k,v) };
    const p = new Profile(storage); p.load();
    assert.equal(p.equip('bag-2', 'primary', id).ok, true);
    const reloaded = new Profile(storage); reloaded.load();
    assert.equal(reloaded.getLoadout('bag-2').primary, id);
    const a = actor(id); a.weaponUpdate(.016, { fire: true, firePressed: true });
    assert.equal(a.game.shots, 1);
    assert.equal(a.weapon.mag, WEAPONS[id].mag - 1);
    const total = a.weapon.mag + a.weapon.reserve;
    a.startReload(); a.game.time = a.weapon.reloadUntil; a.weaponUpdate(.016, {});
    assert.equal(a.weapon.mag + a.weapon.reserve, total);
    assert.equal(a.weapon.mag, WEAPONS[id].mag);
    assert.ok([a.weapon.boltUntil,a.weapon.nextFire,a.punchP,a.punchY].every(Number.isFinite));
  });
}
test('巴雷特保持开镜，半自动和射击恢复限制真实触发', () => {
  const a = actor('barrett');
  a.weaponUpdate(.016, { fire: true, firePressed: true });
  assert.equal(a.scoped, 1); assert.equal(a.reScope, 0);
  a.game.time += .5; a.weaponUpdate(.016, { fire: true, firePressed: true });
  assert.equal(a.game.shots, 1);
  a.game.time = 4; a.weaponUpdate(.016, { fire: true, firePressed: false });
  assert.equal(a.game.shots, 1);
  a.weaponUpdate(.016, { fire: true, firePressed: true });
  assert.equal(a.game.shots, 2);
});
test('AWM 保留拉栓退镜与完成后回镜', () => {
  const a = actor('awm'); a.weaponUpdate(.016, { firePressed: true });
  assert.equal(a.scoped, 0); assert.equal(a.reScope, 1);
  a.game.time = a.weapon.boltUntil; a.weaponUpdate(.016, {});
  assert.equal(a.scoped, 1); assert.equal(a.reScope, 0);
});

test('切枪取消 AWM 待回镜状态，切回后不会自动开镜', () => {
  const a = actor('awm'); a.inv.push(new WeaponState('deagle'));
  a.soldier = { setWeapon() {} }; a.game.onSwitch = () => {};
  a.weaponUpdate(.016, { firePressed: true });
  assert.equal(a.reScope, 1);
  a.weaponUpdate(.016, { sw: 1 });
  assert.equal(a.reScope, 0);
  a.game.time = 4; a.weaponUpdate(.016, { sw: 0 });
  a.game.time = a.readyAt; a.weaponUpdate(.016, {});
  assert.equal(a.scoped, 0);
});
