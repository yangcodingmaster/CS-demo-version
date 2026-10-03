// 本地档案：昵称、三套背包配装、校验、旧数据迁移与保存
// 只依赖 ./weapons.js；不依赖 DOM 与 Three.js；storage 可注入，默认才用 window.localStorage
import { WEAPONS } from './weapons.js';

export const PROFILE_KEY = 'cf_player_profile';
export const LEGACY_KEY = 'cf_ship_opts';
export const SCHEMA_VERSION = 1;
export const SLOTS = ['primary', 'secondary', 'melee', 'throwable'];
export const DEFAULT_NICKNAME = '我';

const BAG_COUNT = 3;   // 与 design-data.json 的 backpackCount 一致
const SLOT_CN = { primary: '主武器', secondary: '副武器', melee: '近战', throwable: '投掷物' };
// 默认主武器取 design-data.json 的 defaultPrimaryIds，其余槽取默认副武器、近战、投掷物
const DEFAULT_PRIMARY_IDS = ['ak47', 'm4a1', 'awm'];
const DEFAULT_SLOT_ID = { secondary: 'deagle', melee: 'knife', throwable: 'he' };

const isPlainObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

function text(v) {
  if (typeof v === 'string') return v;
  try { return JSON.stringify(v) ?? String(v); } catch (e) { return String(v); }
}

// 默认 storage：拿不到 localStorage（含隐私模式直接抛异常）就当不可用
function defaultStorage() {
  try { return typeof window !== 'undefined' && window.localStorage ? window.localStorage : null; } catch (e) { return null; }
}

// ---------- 纯函数 ----------

// 装备所属槽位名；未实现或槽位非法时返回 null
export function slotOfWeapon(weaponId) {
  if (typeof weaponId !== 'string' || !Object.prototype.hasOwnProperty.call(WEAPONS, weaponId)) return null;
  const slot = WEAPONS[weaponId].slot;
  return Number.isInteger(slot) && SLOTS[slot] ? SLOTS[slot] : null;
}

// 该槽位已实现且可装备的 ID，顺序与 WEAPONS 定义一致（稳定）
export function weaponsForSlot(slot) {
  const index = SLOTS.indexOf(slot);
  if (index < 0) return [];
  return Object.keys(WEAPONS).filter((id) => WEAPONS[id] && WEAPONS[id].slot === index);
}

export function isEquippable(weaponId, slot) {
  return SLOTS.includes(slot) && slotOfWeapon(weaponId) === slot;
}

// 槽位默认装备：主武器按 defaultPrimaryIds 顺序；万一默认 ID 缺失，退回该槽第一个可用装备
function slotDefault(slot, index = 0) {
  const preferred = slot === 'primary' ? DEFAULT_PRIMARY_IDS[index] : DEFAULT_SLOT_ID[slot];
  if (isEquippable(preferred, slot)) return preferred;
  return weaponsForSlot(slot)[0] || '';
}

function defaultBag(index, id) {
  return {
    id,
    name: `背包${index + 1}`,
    primary: slotDefault('primary', index),
    secondary: slotDefault('secondary'),
    melee: slotDefault('melee'),
    throwable: slotDefault('throwable'),
  };
}

// 返回默认档案（每次都是新对象）
export function defaultProfile() {
  const backpacks = [];
  for (let i = 0; i < BAG_COUNT; i++) backpacks.push(defaultBag(i, `bag-${i + 1}`));
  return { schemaVersion: SCHEMA_VERSION, nickname: DEFAULT_NICKNAME, selectedBackpackId: backpacks[0].id, backpacks };
}

// 读旧 cf_ship_opts.primary 原值；是否可装备由 normalizeProfile 判断
export function readLegacyPrimary(storage) {
  const s = storage === undefined ? defaultStorage() : storage;
  if (!s || typeof s.getItem !== 'function') return null;
  let raw = null;
  try { raw = s.getItem(LEGACY_KEY); } catch (e) { return null; }
  if (typeof raw !== 'string' || !raw) return null;
  try {
    const opts = JSON.parse(raw);
    return opts && typeof opts.primary === 'string' && opts.primary ? opts.primary : null;
  } catch (e) { return null; }
}

// 纯校验：坏数据逐项回退并保留其余可用数据；不抛异常、不改动入参
export function normalizeProfile(raw, legacyPrimary) {
  const notes = [];
  const src = isPlainObject(raw) ? raw : null;
  const list = src && Array.isArray(src.backpacks) ? src.backpacks : null;
  const legacyId = isEquippable(legacyPrimary, 'primary') ? legacyPrimary : null;
  const profile = list && list.some(isPlainObject)
    ? salvageProfile(src, list, notes)
    : freshProfile(src, list, legacyId, legacyPrimary, notes);
  return { profile, changed: !sameJSON(profile, raw), notes };
}

// 没有可用背包数据：整体用默认档案，只尽量保留旧主武器与昵称
function freshProfile(src, list, legacyId, legacyPrimary, notes) {
  const profile = defaultProfile();
  if (legacyId) {
    profile.backpacks[0].primary = legacyId;
    notes.push(`已从 ${LEGACY_KEY}.primary 迁移 ${legacyId} 到 ${profile.backpacks[0].id}.primary`);
  } else if (typeof legacyPrimary === 'string' && legacyPrimary) {
    notes.push(`旧主武器 ${legacyPrimary} 不可装备，未迁移`);
  }
  if (src) {
    if (typeof src.nickname === 'string' && src.nickname.trim()) profile.nickname = src.nickname.trim();
    if (src.schemaVersion !== undefined && src.schemaVersion !== SCHEMA_VERSION) {
      notes.push(`档案版本 ${text(src.schemaVersion)} 不符，已按版本 ${SCHEMA_VERSION} 迁移`);
    }
  }
  notes.unshift(list ? '背包列表无效，已使用默认档案'
    : src ? '档案结构损坏，已使用默认档案' : '未找到本地档案，已初始化默认档案');
  return profile;
}

// 有可用背包数据：逐项修复背包 ID、数量、槽位与选中项
function salvageProfile(src, list, notes) {
  const used = new Set();
  const bags = [];
  const idMap = new Map();   // 原始 ID -> 修复后的 ID，让选中背包跟着同一件背包走
  if (list.length > BAG_COUNT) notes.push(`背包数量 ${list.length} 超过 ${BAG_COUNT} 个，已保留前 ${BAG_COUNT} 个`);
  const keep = Math.min(list.length, BAG_COUNT);
  for (let i = 0; i < keep; i++) {
    const rb = isPlainObject(list[i]) ? list[i] : null;
    if (!rb) notes.push(`第 ${i + 1} 个背包数据无效，已用默认背包替代`);
    const rawId = rb && typeof rb.id === 'string' && rb.id.trim() !== '' ? rb.id : null;
    const id = takeBagId(rb && rb.id, i, used, notes);
    if (rawId && !idMap.has(rawId)) idMap.set(rawId, id);
    bags.push(repairBag(rb, i, id, notes));
  }
  if (list.length < BAG_COUNT) notes.push(`背包数量不足，已补足 ${BAG_COUNT} 个`);
  while (bags.length < BAG_COUNT) {
    const i = bags.length;
    const id = freeBagId(i, used);
    used.add(id);
    bags.push(defaultBag(i, id));
  }
  const ids = bags.map((b) => b.id);
  let selected = src.selectedBackpackId;
  // ID 被修复过的背包：选中项跟着这件背包走，不要跳到占据同名 ID 的另一件背包
  if (typeof selected === 'string' && idMap.has(selected)) {
    const mapped = idMap.get(selected);
    if (mapped !== selected) notes.push(`selectedBackpackId ${selected} 随背包 ID 修复改为 ${mapped}`);
    selected = mapped;
  }
  if (typeof selected !== 'string' || !ids.includes(selected)) {
    notes.push(`selectedBackpackId ${text(selected)} 无效，改用 ${ids[0]}`);
    selected = ids[0];
  }
  const nickname = typeof src.nickname === 'string' && src.nickname.trim() ? src.nickname.trim() : DEFAULT_NICKNAME;
  if (nickname === DEFAULT_NICKNAME && src.nickname !== DEFAULT_NICKNAME) notes.push(`昵称无效，已用默认昵称 ${DEFAULT_NICKNAME}`);
  if (src.schemaVersion !== SCHEMA_VERSION) {
    notes.push(`档案版本 ${text(src.schemaVersion)} 不符，已按版本 ${SCHEMA_VERSION} 迁移`);
  }
  return { schemaVersion: SCHEMA_VERSION, nickname, selectedBackpackId: selected, backpacks: bags };
}

// 单个背包：ID/名称/四槽逐个校验，坏值只回退该槽
function repairBag(rawBag, index, id, notes) {
  const bag = defaultBag(index, id);
  if (!rawBag) return bag;
  if (typeof rawBag.name === 'string' && rawBag.name.trim()) bag.name = rawBag.name.trim();
  else notes.push(`${id} 名称无效，已用 ${bag.name}`);
  for (const slot of SLOTS) {
    const v = rawBag[slot];
    if (v === undefined) continue;   // 缺失槽位保留默认装备
    if (isEquippable(v, slot)) bag[slot] = v;
    else notes.push(slotNote(id, slot, v, bag[slot]));
  }
  return bag;
}

function slotNote(bagId, slot, value, fallback) {
  const actual = slotOfWeapon(value);
  if (actual) return `${bagId}.${slot} 类别不符 ${text(value)}（${SLOT_CN[actual]}），回退 ${fallback}`;
  return `${bagId}.${slot} 未知 ID ${text(value)}，回退 ${fallback}`;
}

// 稳定 ID 优先保留；缺失或重复时按位置分配 bag-N
function takeBagId(rawId, index, used, notes) {
  const named = typeof rawId === 'string' && rawId.trim() !== '';
  if (named && !used.has(rawId)) { used.add(rawId); return rawId; }
  const id = freeBagId(index, used);
  used.add(id);
  notes.push(named ? `背包 ID ${rawId} 重复，已改用 ${id}` : `第 ${index + 1} 个背包缺少 ID，已改用 ${id}`);
  return id;
}

function freeBagId(index, used) {
  const first = `bag-${index + 1}`;
  if (!used.has(first)) return first;
  for (let n = 1; n <= BAG_COUNT; n++) if (!used.has(`bag-${n}`)) return `bag-${n}`;
  return `bag-${index + 1}-${used.size}`;
}

// 结构比较：判断规范化结果是否与原始数据一致（供 changed 使用）
function sameJSON(a, b) {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((v, i) => sameJSON(v, b[i]));
  if (isPlainObject(a) && isPlainObject(b)) {
    const ka = Object.keys(a);
    return ka.length === Object.keys(b).length
      && ka.every((k) => Object.prototype.hasOwnProperty.call(b, k) && sameJSON(a[k], b[k]));
  }
  return false;
}

// ---------- 档案对象 ----------

export class Profile {
  // storage 可注入：{ getItem(k), setItem(k, v) }；不传时用 window.localStorage
  constructor(storage) {
    this.storage = storage === undefined ? defaultStorage() : storage;
    this.available = !!(this.storage && typeof this.storage.getItem === 'function' && typeof this.storage.setItem === 'function');
    this.data = defaultProfile();   // load() 之前也保证有合法档案可读
    this._notes = [];
  }

  // 读键 -> normalizeProfile -> 必要时写回
  load() {
    const raw = this._read(PROFILE_KEY);
    let parsed = null, corrupt = false;
    if (typeof raw === 'string' && raw.trim()) {
      try { parsed = JSON.parse(raw); } catch (e) { corrupt = true; }
    }
    const { profile, changed, notes } = normalizeProfile(parsed, readLegacyPrimary(this.storage));
    this.data = profile;
    this._notes = notes;
    if (corrupt) this._notes.unshift('档案 JSON 损坏，已回退默认档案');
    if (changed) this.save();
    if (!this.available) this._notes.push('本地存储不可用，本次会话的改动无法保存');
    return this.data;
  }

  save() {
    return this._write(PROFILE_KEY, JSON.stringify(this.data));
  }

  // 返回 { ok, saved }：ok 表示数据已应用，saved 表示是否成功写入本地存储
  setNickname(name) {
    const v = typeof name === 'string' ? name.trim() : '';
    if (!v) return { ok: false, saved: false, error: '昵称不能为空' };
    this.data.nickname = v;
    return { ok: true, saved: this.save() };
  }

  selectBackpack(bagId) {
    if (!this.getBackpack(bagId)) return { ok: false, saved: false, error: `背包不存在：${text(bagId)}` };
    this.data.selectedBackpackId = bagId;
    return { ok: true, saved: this.save() };
  }

  getBackpack(bagId) {
    return this._bags().find((b) => b.id === bagId) || null;
  }

  get selectedBackpack() {
    const bags = this._bags();
    const id = this.data ? this.data.selectedBackpackId : null;
    return bags.find((b) => b.id === id) || bags[0] || null;
  }

  // 类别不符或 ID 不存在时 ok:false 且不写入
  equip(bagId, slot, weaponId) {
    const bag = this.getBackpack(bagId);
    if (!bag) return { ok: false, error: `背包不存在：${text(bagId)}` };
    if (!SLOTS.includes(slot)) return { ok: false, error: `槽位无效：${text(slot)}` };
    if (!isEquippable(weaponId, slot)) {
      const actual = slotOfWeapon(weaponId);
      return {
        ok: false,
        error: actual
          ? `类别不符：${text(weaponId)} 属于${SLOT_CN[actual]}，不能装备到${SLOT_CN[slot]}`
          : `装备不存在：${text(weaponId)}`,
      };
    }
    const changed = bag[slot] !== weaponId;
    if (changed) bag[slot] = weaponId;
    // saved=false 表示只改了内存档案、没写进本地存储，界面需要如实提示
    return { ok: true, saved: this.save(), changed };
  }

  // 四槽都返回合法 ID；bagId 无效时退回当前背包
  getLoadout(bagId) {
    const bag = (bagId === undefined ? null : this.getBackpack(bagId)) || this.selectedBackpack;
    const out = {};
    for (const slot of SLOTS) {
      const v = bag ? bag[slot] : undefined;
      out[slot] = isEquippable(v, slot) ? v : slotDefault(slot);
    }
    return out;
  }

  // 迁移与回退记录（副本），供交付记录引用
  get notes() { return this._notes.slice(); }

  _bags() {
    return this.data && Array.isArray(this.data.backpacks) ? this.data.backpacks : [];
  }

  _read(key) {
    const s = this.storage;
    if (!s || typeof s.getItem !== 'function') { this.available = false; return null; }
    try {
      const v = s.getItem(key);
      return typeof v === 'string' ? v : null;
    } catch (e) { this.available = false; return null; }
  }

  // 写入后读回校验：隐私模式下 setItem 可能静默失败
  _write(key, value) {
    const s = this.storage;
    if (!s || typeof s.setItem !== 'function') { this.available = false; return false; }
    try {
      s.setItem(key, value);
      if (s.getItem(key) == null) { this.available = false; return false; }
      this.available = true;
      return true;
    } catch (e) { this.available = false; return false; }
  }
}
