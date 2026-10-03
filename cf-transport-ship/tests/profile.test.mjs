// 本地档案模块的针对性检查：node tests/profile.test.mjs（无第三方依赖）
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  Profile, PROFILE_KEY, LEGACY_KEY, SCHEMA_VERSION, SLOTS, DEFAULT_NICKNAME,
  defaultProfile, slotOfWeapon, weaponsForSlot, isEquippable, readLegacyPrimary, normalizeProfile,
} from '../src/profile.js';
import { WEAPONS } from '../src/weapons.js';

// 可注入的假 storage：按 Map 存字符串，可模拟读写抛异常
class FakeStorage {
  constructor(init = {}, opts = {}) {
    this.map = new Map(Object.entries(init));
    this.failGet = !!opts.failGet;
    this.failSet = !!opts.failSet;
  }
  getItem(k) {
    if (this.failGet) throw new Error('getItem blocked');
    return this.map.has(k) ? this.map.get(k) : null;
  }
  setItem(k, v) {
    if (this.failSet) throw new Error('setItem blocked');
    this.map.set(String(k), String(v));
  }
  dump(k) { return this.map.get(k); }
}

const stored = (obj) => ({ [PROFILE_KEY]: JSON.stringify(obj) });
const open = (init, opts) => { const s = new FakeStorage(init, opts); const p = new Profile(s); p.load(); return { p, s }; };
const inWeapons = (id) => Object.prototype.hasOwnProperty.call(WEAPONS, id);

test('1. 空存储首次加载：3 个合法背包与默认主武器', () => {
  const { p, s } = open();
  assert.equal(p.available, true);
  assert.equal(p.data.schemaVersion, SCHEMA_VERSION);
  assert.equal(p.data.nickname, DEFAULT_NICKNAME);
  assert.deepEqual(p.data.backpacks.map((b) => b.id), ['bag-1', 'bag-2', 'bag-3']);
  assert.deepEqual(p.data.backpacks.map((b) => b.name), ['背包1', '背包2', '背包3']);
  assert.deepEqual(p.data.backpacks.map((b) => b.primary), ['ak47', 'm4a1', 'awm']);
  for (const b of p.data.backpacks) {
    assert.equal(b.secondary, 'deagle');
    assert.equal(b.melee, 'knife');
    assert.equal(b.throwable, 'he');
  }
  assert.equal(p.data.selectedBackpackId, 'bag-1');
  assert.equal(p.selectedBackpack.id, 'bag-1');
  assert.ok(s.dump(PROFILE_KEY).includes('bag-1'), '首次加载应把默认档案写回存储');
});

test("2. 旧 cf_ship_opts.primary='mp5' 迁移到 bag-1.primary", () => {
  const legacy = { primary: 'mp5', quality: 'low', vol: 0.5, tod: 'night' };
  const { p, s } = open({ [LEGACY_KEY]: JSON.stringify(legacy) });
  assert.equal(p.getBackpack('bag-1').primary, 'mp5');
  assert.equal(p.getBackpack('bag-2').primary, 'm4a1');
  assert.equal(p.getBackpack('bag-3').primary, 'awm');
  assert.ok(p.notes.some((n) => n.includes('mp5') && n.includes('bag-1.primary')), '迁移要记入 notes');
  assert.equal(readLegacyPrimary(s), 'mp5');
  assert.deepEqual(JSON.parse(s.dump(LEGACY_KEY)), legacy, 'cf_ship_opts 其它字段不动');

  // 已有可用档案时不再迁移
  const { p: again } = open({ [PROFILE_KEY]: JSON.stringify({ ...defaultProfile(), nickname: '老兵' }), [LEGACY_KEY]: JSON.stringify(legacy) });
  assert.equal(again.getBackpack('bag-1').primary, 'ak47');
  assert.equal(again.data.nickname, '老兵');

  // 旧值不可装备时不迁移，只记 notes（M3 的闪光弹尚未实现）
  const { p: bad } = open({ [LEGACY_KEY]: JSON.stringify({ primary: 'flash' }) });
  assert.equal(bad.getBackpack('bag-1').primary, 'ak47');
  assert.ok(bad.notes.some((n) => n.includes('flash')));
});

test('3. 损坏 JSON 回退默认且不抛异常', () => {
  const p = new Profile(new FakeStorage({ [PROFILE_KEY]: '{ 这不是 JSON' }));
  assert.doesNotThrow(() => p.load());
  assert.equal(p.available, true);
  assert.equal(p.data.backpacks.length, 3);
  assert.equal(p.getBackpack('bag-1').primary, 'ak47');
  assert.ok(p.notes.length > 0);

  for (const broken of ['3', '"字符串"', '[]', 'null', '{"backpacks":"坏"}']) {
    const q = new Profile(new FakeStorage({ [PROFILE_KEY]: broken }));
    assert.doesNotThrow(() => q.load(), `不应因 ${broken} 抛异常`);
    assert.deepEqual(q.data.backpacks.map((b) => b.id), ['bag-1', 'bag-2', 'bag-3']);
    assert.deepEqual(Object.values(q.getLoadout('bag-1')), ['ak47', 'deagle', 'knife', 'he']);
  }
});

test('4. 未知武器 ID 只回退该槽，其它槽保留原值', () => {
  const raw = {
    schemaVersion: 1, nickname: '我', selectedBackpackId: 'bag-1',
    backpacks: [
      { id: 'bag-1', name: '背包1', primary: 'flash', secondary: 'deagle', melee: 'knife', throwable: 'he' },
      { id: 'bag-2', name: '背包2', primary: 'mp5', secondary: 'deagle', melee: 'knife', throwable: 'flash' },
      { id: 'bag-3', name: '背包3', primary: 'awm', secondary: 'deagle', melee: 'knife', throwable: 'smoke' },
    ],
  };
  const snapshot = JSON.stringify(raw);
  const { profile, changed, notes } = normalizeProfile(raw, null);
  assert.equal(changed, true);
  assert.equal(JSON.stringify(raw), snapshot, 'normalizeProfile 不能改动入参');
  assert.equal(profile.backpacks[0].primary, 'ak47');
  assert.equal(profile.backpacks[0].secondary, 'deagle');
  assert.equal(profile.backpacks[0].melee, 'knife');
  assert.equal(profile.backpacks[1].primary, 'mp5', '合法主武器必须保留');
  assert.equal(profile.backpacks[1].throwable, 'he');
  assert.equal(profile.backpacks[2].primary, 'awm');
  assert.equal(profile.backpacks[2].throwable, 'he');
  assert.ok(notes.includes('bag-1.primary 未知 ID flash，回退 ak47'));
  assert.ok(notes.some((n) => n.includes('bag-2.throwable') && n.includes('flash')));
  assert.ok(notes.some((n) => n.includes('bag-3.throwable') && n.includes('smoke')));
  const dump = JSON.stringify(profile);
  for (const id of ['flash', 'smoke']) assert.ok(!dump.includes(id), `${id} 不得写进档案`);

  const { p } = open(stored(raw));
  assert.equal(p.getBackpack('bag-1').primary, 'ak47');
  assert.equal(p.getBackpack('bag-2').primary, 'mp5');
  assert.equal(p.getBackpack('bag-2').throwable, 'he');
});

test('5. 背包数量不足 / ID 重复 / selectedBackpackId 无效都被修复', () => {
  const raw = {
    schemaVersion: 1, nickname: '我', selectedBackpackId: 'bag-9',
    backpacks: [
      { id: 'bag-1', name: '一号', primary: 'mp5', secondary: 'deagle', melee: 'knife', throwable: 'he' },
      { id: 'bag-1', name: '重复', primary: 'm4a1', secondary: 'deagle', melee: 'knife', throwable: 'he' },
    ],
  };
  const { profile, notes } = normalizeProfile(raw, null);
  assert.equal(profile.backpacks.length, 3);
  assert.deepEqual(profile.backpacks.map((b) => b.id), ['bag-1', 'bag-2', 'bag-3']);
  assert.equal(new Set(profile.backpacks.map((b) => b.id)).size, 3, 'ID 必须唯一');
  assert.equal(profile.selectedBackpackId, 'bag-1');
  assert.equal(profile.backpacks[0].name, '一号');
  assert.equal(profile.backpacks[0].primary, 'mp5', '原背包可用数据保留');
  assert.equal(profile.backpacks[1].primary, 'm4a1');
  assert.equal(profile.backpacks[2].primary, 'awm');
  assert.ok(notes.some((n) => n.includes('重复')));
  assert.ok(notes.some((n) => n.includes('selectedBackpackId')));
  assert.ok(notes.some((n) => n.includes('补足')));

  // 缺 ID + 超量：只保留前 3 个且 ID 唯一、选中项合法
  const raw2 = { schemaVersion: 1, nickname: '我', selectedBackpackId: 'x', backpacks: [{ name: 'a' }, {}, {}, { id: 'bag-9' }] };
  const r2 = normalizeProfile(raw2, null);
  assert.deepEqual(r2.profile.backpacks.map((b) => b.id), ['bag-1', 'bag-2', 'bag-3']);
  assert.equal(r2.profile.selectedBackpackId, 'bag-1');
  const { p } = open(stored(raw2));
  assert.equal(p.getBackpack(p.data.selectedBackpackId).id, 'bag-1');
  assert.ok(p.notes.some((n) => n.includes('超过')));
});

test('6. 类别不符时 equip 返回 ok:false 且不改动数据', () => {
  const { p, s } = open();
  const before = JSON.stringify(p.data);
  const wrongSlot = p.equip('bag-1', 'primary', 'knife');
  assert.equal(wrongSlot.ok, false);
  assert.ok(wrongSlot.error);
  assert.equal(p.equip('bag-1', 'primary', 'deagle').ok, false, '副武器不能装主武器槽');
  assert.equal(p.equip('bag-1', 'secondary', 'awm').ok, false);
  assert.equal(p.equip('bag-1', 'melee', 'he').ok, false);
  assert.equal(p.equip('bag-1', 'primary', 'usp').ok, false, '副武器不能装主武器槽');
  assert.equal(p.equip('bag-1', 'throwable', 'flash').ok, false, '未实现装备不能装备');
  assert.equal(p.equip('bag-9', 'primary', 'ak47').ok, false, '背包不存在');
  assert.equal(p.equip('bag-1', 'bad', 'ak47').ok, false, '槽位无效');
  assert.equal(JSON.stringify(p.data), before, '失败调用不得改动数据');
  assert.equal(JSON.parse(s.dump(PROFILE_KEY)).backpacks[0].primary, 'ak47');

  assert.equal(p.equip('bag-1', 'primary', 'mp5').ok, true);
  assert.equal(p.getBackpack('bag-1').primary, 'mp5');
  assert.equal(JSON.parse(s.dump(PROFILE_KEY)).backpacks[0].primary, 'mp5', '成功装备立即保存');
  assert.equal(p.equip('bag-1', 'secondary', 'deagle').ok, true, '同值重复装备也算成功');
  assert.equal(p.equip('bag-1', 'secondary', 'usp').ok, true, 'M1B 新枪可以装备');
  assert.equal(p.getBackpack('bag-1').secondary, 'usp');
  assert.equal(p.equip('bag-1', 'secondary', 'glock18').ok, true);
  assert.equal(p.getBackpack('bag-1').secondary, 'glock18');
  assert.deepEqual(p.equip('bag-1', 'melee', 'knife'), { ok: true, saved: true, changed: false }, '同值装备：应用成功且无需改写');
});

test('7. 存档 -> 重新加载 -> 数据一致', () => {
  const s = new FakeStorage();
  const a = new Profile(s);
  a.load();
  assert.deepEqual(a.setNickname('老兵'), { ok: true, saved: true });
  assert.deepEqual(a.selectBackpack('bag-2'), { ok: true, saved: true });
  assert.equal(a.equip('bag-3', 'primary', 'mp5').ok, true);
  assert.equal(a.setNickname('   ').ok, false, '空昵称不写入');
  assert.equal(a.selectBackpack('bag-9').ok, false);
  assert.equal(a.data.nickname, '老兵');

  const b = new Profile(s);
  b.load();
  assert.deepEqual(b.data, a.data);
  assert.deepEqual(b.notes, [], '合法档案二次加载不产生修复记录');
  assert.equal(b.selectedBackpack.id, 'bag-2');
  assert.equal(b.getLoadout('bag-3').primary, 'mp5');
  assert.deepEqual(b.getLoadout(), b.getLoadout('bag-2'));
});

test('8. setItem 抛异常（隐私模式）：available=false、save()=false、仍可用', () => {
  const s = new FakeStorage({}, { failSet: true });
  const p = new Profile(s);
  assert.equal(p.available, true, '构造时函数存在');
  p.load();
  assert.equal(p.available, false);
  assert.equal(p.save(), false);
  assert.equal(p.data.backpacks.length, 3);
  assert.equal(p.equip('bag-1', 'primary', 'mp5').ok, true, '存储不可用也不阻断本次会话');
  assert.equal(p.getBackpack('bag-1').primary, 'mp5');
  const eqRes = p.equip('bag-2', 'primary', 'mp5');
  assert.equal(eqRes.ok, true, '存储不可用也不阻断本次会话');
  assert.equal(eqRes.saved, false, '装备写盘失败必须如实返回 saved=false，界面才能提示');
  assert.equal(eqRes.changed, true);
  assert.equal(p.getBackpack('bag-2').primary, 'mp5', '内存档案仍然生效');
  const nickRes = p.setNickname('无法保存');
  assert.equal(nickRes.ok, true, '存储不可用也不阻断本次会话');
  assert.equal(nickRes.saved, false, 'saved=false 让界面能如实提示没有落盘');
  assert.equal(p.data.nickname, '无法保存');
  assert.deepEqual(Object.values(p.getLoadout('bag-1')), ['mp5', 'deagle', 'knife', 'he']);
  assert.ok(p.notes.some((n) => n.includes('存储不可用')));

  const q = new Profile(new FakeStorage({}, { failGet: true }));
  assert.doesNotThrow(() => q.load());
  assert.equal(q.available, false);
  assert.equal(q.data.backpacks.length, 3);
  assert.equal(q.save(), false);
  assert.ok(q.notes.some((n) => n.includes('存储不可用')));

  const broken = new Profile({ getItem: () => null });
  assert.doesNotThrow(() => broken.load());
  assert.equal(broken.available, false);
  assert.equal(broken.save(), false);
  assert.deepEqual(Object.values(broken.getLoadout()), ['ak47', 'deagle', 'knife', 'he']);

  const none = new Profile(null);
  assert.equal(none.available, false);
  assert.doesNotThrow(() => none.load());
  assert.equal(none.getLoadout('bag-1').primary, 'ak47');
});

test('9. getLoadout 四个值都在 WEAPONS 里且槽位类别正确', () => {
  const { p } = open();
  for (const bag of p.data.backpacks) {
    const lo = p.getLoadout(bag.id);
    assert.deepEqual(Object.keys(lo), SLOTS);
    for (const slot of SLOTS) {
      assert.notEqual(lo[slot], undefined);
      assert.ok(inWeapons(lo[slot]), `${lo[slot]} 必须是已实现武器`);
      assert.equal(slotOfWeapon(lo[slot]), slot);
      assert.equal(isEquippable(lo[slot], slot), true);
    }
  }
  assert.deepEqual(p.getLoadout(), p.getLoadout(p.data.selectedBackpackId));
  assert.deepEqual(weaponsForSlot('primary'), ['ak47', 'm4a1', 'awm', 'mp5']);
  assert.deepEqual(weaponsForSlot('secondary'), ['deagle', 'usp', 'glock18']);
  assert.deepEqual(weaponsForSlot('melee'), ['knife']);
  assert.deepEqual(weaponsForSlot('throwable'), ['he']);
  assert.deepEqual(weaponsForSlot('nope'), []);
  // M1B 之后副武器有三件，且只能装在副武器槽
  for (const id of ['usp', 'glock18']) {
    assert.equal(slotOfWeapon(id), 'secondary');
    assert.equal(isEquippable(id, 'secondary'), true);
    assert.equal(isEquippable(id, 'primary'), false);
    assert.equal(isEquippable(id, 'throwable'), false);
  }
  // 闪光弹与烟雾弹属 M3，仍未实现
  for (const id of ['flash', 'smoke']) {
    assert.equal(slotOfWeapon(id), null, `${id} 尚未实现`);
    assert.equal(isEquippable(id, 'secondary'), false);
    assert.equal(isEquippable(id, 'primary'), false);
    assert.equal(isEquippable(id, 'throwable'), false);
  }
  assert.equal(slotOfWeapon(undefined), null);
  assert.equal(slotOfWeapon('toString'), null);
});

test('10. 合法档案不改写，版本不符按 1 迁移', () => {
  const raw = defaultProfile();
  const { profile, changed, notes } = normalizeProfile(raw, null);
  assert.equal(changed, false);
  assert.deepEqual(notes, []);
  assert.deepEqual(profile, raw);

  const older = { ...defaultProfile(), schemaVersion: 0 };
  const r = normalizeProfile(older, null);
  assert.equal(r.profile.schemaVersion, SCHEMA_VERSION);
  assert.equal(r.changed, true);
  assert.ok(r.notes.some((n) => n.includes('版本')));
  assert.ok(r.profile.backpacks.every((b) => isEquippable(b.primary, 'primary')));
});

test('11. 缺失 ID 不抢占后续合法 ID，配装与选中背包保持不变', () => {
  const raw = {
    schemaVersion: 1, nickname: '我', selectedBackpackId: 'bag-1',
    backpacks: [
      { id: '', name: '待修复', primary: 'mp5' },
      { id: 'bag-1', name: '狙击配置', primary: 'awm', secondary: 'usp', melee: 'knife', throwable: 'he' },
      { id: 'bag-3', name: '步枪配置', primary: 'm4a1', secondary: 'glock18', melee: 'knife', throwable: 'he' },
    ],
  };
  const before = JSON.stringify(raw);
  const { profile, notes } = normalizeProfile(raw, null);
  assert.deepEqual(profile.backpacks.map((b) => b.id), ['bag-2', 'bag-1', 'bag-3']);
  assert.deepEqual(profile.backpacks[1], raw.backpacks[1], '原合法 bag-1 的 ID、名称与四槽配装完整保留');
  assert.deepEqual(profile.backpacks[2], raw.backpacks[2], '原合法 bag-3 不因前面的坏数据改名');
  assert.equal(profile.backpacks[0].primary, 'mp5', '缺失 ID 只修 ID，不丢配装');
  assert.equal(profile.selectedBackpackId, 'bag-1');
  assert.equal(JSON.stringify(raw), before, '修复不改动输入档案');
  assert.ok(notes.some((n) => n.includes('缺少 ID')));

  const { p, s } = open(stored(raw));
  assert.deepEqual(p.getLoadout('bag-1'), { primary: 'awm', secondary: 'usp', melee: 'knife', throwable: 'he' });
  assert.deepEqual(JSON.parse(s.dump(PROFILE_KEY)), profile, '写回的档案也保留合法稳定 ID');
  const reloaded = new Profile(s);
  reloaded.load();
  assert.deepEqual(reloaded.data, profile, '刷新后配装仍按原合法 ID 读取');
  assert.deepEqual(reloaded.notes, [], '修复后的档案再次加载不再改名');
});

test('12. 选中项无法映射时退回第一个背包', () => {
  const raw = {
    schemaVersion: 1, nickname: '我', selectedBackpackId: '不存在',
    backpacks: [{ id: 'bag-1', primary: 'ak47' }, { id: 'bag-2', primary: 'mp5' }],
  };
  const { profile, notes } = normalizeProfile(raw, null);
  assert.equal(profile.selectedBackpackId, 'bag-1');
  assert.ok(notes.some((n) => n.includes('无效')));
});

test('13. 重复 ID 保留第一件，替代 ID 不抢占后续合法背包', () => {
  const raw = {
    schemaVersion: 1, nickname: '我', selectedBackpackId: 'bag-3',
    backpacks: [
      { id: 'bag-3', name: '第一件', primary: 'mp5', secondary: 'usp', melee: 'knife', throwable: 'he' },
      { id: 'bag-3', name: '重复件', primary: 'awm', secondary: 'glock18', melee: 'knife', throwable: 'he' },
      { id: 'bag-2', name: '后续合法件', primary: 'ak47', secondary: 'deagle', melee: 'knife', throwable: 'he' },
    ],
  };
  const { profile, notes } = normalizeProfile(raw, null);
  assert.deepEqual(profile.backpacks.map((b) => b.id), ['bag-3', 'bag-1', 'bag-2']);
  assert.deepEqual(profile.backpacks[0], raw.backpacks[0], '同名 ID 保留首次出现的背包');
  assert.deepEqual(profile.backpacks[1], { ...raw.backpacks[1], id: 'bag-1' }, '重复件只改 ID，保留其配装');
  assert.deepEqual(profile.backpacks[2], raw.backpacks[2], '修复重复件前先保留后续合法 bag-2');
  assert.equal(profile.selectedBackpackId, 'bag-3', '重复 ID 无法区分原对象时，选中项固定指向第一件');
  assert.equal(profile.backpacks.find((b) => b.id === profile.selectedBackpackId).primary, 'mp5');
  assert.ok(notes.some((n) => n.includes('bag-3 重复，已改用 bag-1')));
  assert.equal(normalizeProfile(profile, null).changed, false);
});

test('14. 无效背包项也避让合法 ID，超出保留范围的 ID 不参与预留', () => {
  const malformed = {
    schemaVersion: 1, nickname: '我', selectedBackpackId: 'bag-1',
    backpacks: [null, { id: 'bag-1', primary: 'mp5' }, { id: 'bag-2', primary: 'awm' }],
  };
  const fixed = normalizeProfile(malformed, null).profile;
  assert.deepEqual(fixed.backpacks.map((b) => b.id), ['bag-3', 'bag-1', 'bag-2']);
  assert.equal(fixed.backpacks[1].primary, 'mp5');
  assert.equal(fixed.backpacks[2].primary, 'awm');
  assert.equal(fixed.selectedBackpackId, 'bag-1');

  const excess = {
    schemaVersion: 1, nickname: '我', selectedBackpackId: '不存在',
    backpacks: [{ primary: 'mp5' }, { primary: 'awm' }, { primary: 'm4a1' }, { id: 'bag-1', primary: 'ak47' }],
  };
  const trimmed = normalizeProfile(excess, null).profile;
  assert.deepEqual(trimmed.backpacks.map((b) => b.id), ['bag-1', 'bag-2', 'bag-3']);
  assert.deepEqual(trimmed.backpacks.map((b) => b.primary), ['mp5', 'awm', 'm4a1']);
  assert.equal(trimmed.selectedBackpackId, 'bag-1');
});
