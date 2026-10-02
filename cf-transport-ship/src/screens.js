// M1 界面层：主页 / 个人界面 / 背包 / 武器库 / 初始背包选择
// 契约：docs/m1-interfaces.md 的「src/screens.js 接口」与 context 语义。
// 只通过契约列出的 game.* 方法回调，只读 game.profile 的公开接口，
// 不直接改 game 的其它状态，也不依赖 hud.js / profile.js 的内部实现。
import { WEAPONS } from './weapons.js';
import { weaponsForSlot, slotOfWeapon } from './profile.js';

const SCREEN_NAMES = ['home', 'personal', 'backpack', 'armory', 'bagSelect'];
const BAG_CONTEXTS = ['manage', 'select', 'match'];
const SLOTS = ['primary', 'secondary', 'melee', 'throwable'];
const SLOT_INDEX = { primary: 0, secondary: 1, melee: 2, throwable: 3 };
const SLOT_CN = { primary: '主武器', secondary: '副武器', melee: '近战', throwable: '投掷物' };
const DEFAULT_NICK = '我';
const NO_SAVE_TIP = '无法保存到本地，本次会话配置仍然有效';
// 未交付装备（M1B / M3 的副武器与战术投掷物）不进列表的保证：
// 列表只取 weaponsForSlot(slot)，再用 WEAPONS[id].slot 校验，WEAPONS 里不存在的 ID 一律跳过。
const USE_DESC = {
  ak47: '潜伏者经典步枪 · 单发伤害高，连射上跳明显',
  m4a1: '保卫者经典步枪 · 后坐温和，适合压枪连点',
  awm: '重型狙击枪 · 开镜一枪致命，拉栓间隔长',
  mp5: '紧凑冲锋枪 · 射速快、移动灵活，远距离衰减明显',
  deagle: '大威力手枪 · 近距两枪致命，后坐与射速代价高',
  usp: '标准手枪 · 后坐平稳、精度好，适合点射',
  glock18: '大容量手枪 · 射速快，近距离节奏好',
  knife: '军刀 · 轻击出手快，重击绕后一刀致命',
  he: '高爆手雷 · 范围伤害，每次出生携带一枚',
};

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const HOME_HTML = `
<div class="m1Box m1HomeBox">
  <div class="m1Hero">
    <div class="m1Logo">CROSSFIRE</div>
    <h1 class="m1H1">运输船</h1>
    <div class="m1En">TRANSPORT SHIP</div>
    <div class="m1Who" data-role="who"></div>
  </div>
  <div class="m1Notice" data-role="notice"></div>
  <div class="m1Menu">
    <button class="m1Btn go" data-act="team"><b>团队竞技</b><small>运输船 · 选择初始背包后进入对局</small></button>
    <button class="m1Btn off" data-act="bomb" aria-disabled="true"><b>爆破模式</b><small>沙漠灰 · 开发中</small></button>
    <button class="m1Btn" data-act="personal"><b>个人界面</b><small>昵称 · 三个背包 · 武器库</small></button>
    <button class="m1Btn" data-act="settings"><b>设置</b><small>灵敏度 · FOV · 音量 · 画质</small></button>
  </div>
  <div class="m1Foot">M1 交付主页、个人界面、背包与武器库；爆破模式与战术投掷物按后续阶段加入。</div>
</div>`;

const PERSONAL_HTML = `
<div class="m1Box">
  <div class="m1Head">
    <button class="m1Back" data-act="home">返回主页</button>
    <div class="m1HeadTxt"><h2 class="m1H2">个人界面</h2><div class="m1Sub">本地档案 · 昵称与三个背包</div></div>
  </div>
  <div class="m1Notice" data-role="notice"></div>
  <div class="m1Card">
    <div class="m1Lab">本地昵称</div>
    <div class="m1NameRow">
      <input class="m1Input" data-role="nick" type="text" maxlength="12" placeholder="我" autocomplete="off" spellcheck="false" aria-label="本地昵称">
      <button class="m1Btn small" data-act="saveNick">保存昵称</button>
    </div>
    <div class="m1Hint" data-role="nickHint"></div>
  </div>
  <div class="m1Lab">背包（点卡片进入背包管理）</div>
  <div class="m1BagGrid" data-role="bagCards"></div>
  <div class="m1Row">
    <button class="m1Btn go" data-act="manage">管理背包</button>
    <button class="m1Btn sec" data-act="settings">设置</button>
    <button class="m1Btn sec" data-act="home">返回主页</button>
  </div>
  <div class="m1Foot">昵称与配装只保存在这台设备的浏览器里，不需要账号或联网。</div>
</div>`;

// 背包屏（#backpack / #bagSelect 共用骨架，按 context 渲染）
const BAG_HTML = `
<div class="m1Box">
  <div class="m1Head">
    <button class="m1Back" data-act="back">返回</button>
    <div class="m1HeadTxt"><h2 class="m1H2" data-role="bagTitle">背包</h2><div class="m1Sub" data-role="bagSub"></div></div>
  </div>
  <div class="m1Notice" data-role="notice"></div>
  <div class="m1State" data-role="stateBar"></div>
  <div class="m1BagGrid" data-role="bagCards"></div>
  <div class="m1Row" data-role="bagFoot"></div>
  <div class="m1Foot" data-role="bagNote"></div>
</div>`;

const ARMORY_HTML = `
<div class="m1Box">
  <div class="m1Head">
    <button class="m1Back" data-act="back">返回背包</button>
    <div class="m1HeadTxt"><h2 class="m1H2">武器库</h2><div class="m1Sub" data-role="armSub"></div></div>
  </div>
  <div class="m1Notice" data-role="notice"></div>
  <div class="m1ArmGrid" data-role="armCards"></div>
  <div class="m1Foot">点击装备立即保存到该背包的该槽位，然后回到背包界面。</div>
</div>`;

const TEMPLATES = [
  ['home', HOME_HTML],
  ['personal', PERSONAL_HTML],
  ['backpack', BAG_HTML],
  ['armory', ARMORY_HTML],
  ['bagSelect', BAG_HTML],
];

export class Screens {
  constructor(game) {
    this.g = game || {};
    this.root = document.getElementById('ui') || document.body;
    this.icons = {};
    this.bagCtx = 'manage';        // 'manage' | 'select' | 'match'
    this.armBagId = null;
    this.armSlot = null;
    this.armReturnCtx = 'manage';
    this.notice = null;
    this._noticeTimer = 0;
    this._visible = null;
    this.screens = {};
    this._build();
  }

  // ---------- 契约接口 ----------
  show(name) {
    if (name === 'bagSelect') this.bagCtx = 'select';
    if (name === 'backpack' && this.bagCtx === 'select') this.bagCtx = 'manage';
    const target = SCREEN_NAMES.includes(name) ? name : null;
    const prev = this._visible;
    this._visible = target;
    for (const n of SCREEN_NAMES) {
      const el = this.screens[n];
      if (el) el.classList.toggle('hidden', n !== target);
    }
    if (target) {
      this.refresh();
      const el = this.screens[target];
      if (el && prev !== target) el.scrollTop = 0;
    }
  }

  get visible() { return this._visible; }

  setIcons(icons) {
    this.icons = icons || {};
    this._applyIcons();
  }

  refresh() {
    if (!this.icons) this.icons = {};
    this._renderHome();
    this._renderPersonal();
    this._renderBag('backpack', this.bagCtx);
    this._renderBag('bagSelect', 'select');
    this._renderArmory();
    this._applyIcons();
    this._paintNotice();
  }

  openBackpack({ context } = {}) {
    this.bagCtx = BAG_CONTEXTS.includes(context) ? context : 'manage';
    this.show(this.bagCtx === 'select' ? 'bagSelect' : 'backpack');
  }

  openArmory({ bagId, slot } = {}) {
    this.armBagId = typeof bagId === 'string' && bagId ? bagId : null;
    this.armSlot = SLOTS.includes(slot) ? slot : null;
    this.armReturnCtx = BAG_CONTEXTS.includes(this.bagCtx) ? this.bagCtx : 'manage';
    this.show('armory');
  }

  closeAll() { this.show(null); }

  // ---------- DOM 骨架 ----------
  _build() {
    const frag = document.createElement('div');
    frag.innerHTML = TEMPLATES.map(([id, html]) => `<div id="${id}" class="screen m1 hidden">${html}</div>`).join('');
    while (frag.firstChild) this.root.appendChild(frag.firstChild);
    for (const n of SCREEN_NAMES) {
      const el = this.root.querySelector('#' + n);
      this.screens[n] = el;
      if (!el) continue;
      el.addEventListener('click', (e) => this._onClick(el, e));
    }
    const per = this.screens.personal;
    if (per) {
      per.addEventListener('focusout', (e) => {
        const t = e.target;
        if (t && t.dataset && t.dataset.role === 'nick') this._saveNick();
      });
      per.addEventListener('keydown', (e) => {
        const t = e.target;
        if (!t || !t.dataset || t.dataset.role !== 'nick') return;
        e.stopPropagation();
        if (e.key === 'Enter') { e.preventDefault(); this._saveNick(); if (t.blur) t.blur(); }
      });
    }
    this.refresh();
  }

  _onClick(container, e) {
    const t = e.target && e.target.closest
      ? e.target.closest('[data-act],[data-slot],[data-bag],[data-w]')
      : null;
    if (!t || !container.contains(t)) return;
    if (t.dataset.act) return this._act(t.dataset.act);
    if (t.dataset.slot) return this._slotTap(t.dataset.bag, t.dataset.slot);
    if (t.dataset.bag) return this._bagTap(t.dataset.bag);
    if (t.dataset.w) return this._equip(t.dataset.w);
  }

  // ---------- 交互 ----------
  _act(act) {
    switch (act) {
      case 'team': this._click(); this._call('showTeamSetup'); break;
      case 'bomb':
        this._click();
        this._notify('爆破模式仍在开发中，M1 只开放团队竞技', 'warn');
        break;
      case 'personal': this._click(); this._call('showPersonal'); break;
      case 'settings': this._click(); this._call('showSettings'); break;
      case 'home': this._click(); this._call('showHome'); break;
      case 'manage': this._click(); this.openBackpack({ context: 'manage' }); break;
      case 'bag': this._click(); this.openBackpack({ context: 'manage' }); break;
      case 'saveNick': this._saveNick(); break;
      case 'back': this._back(); break;
      case 'start': this._click('start'); this._call('startTeamMatch'); break;
      case 'closeBag': this._click(); this._call('closeBagPanel'); break;
      default: break;
    }
  }

  _back() {
    const v = this._visible;
    this._click();
    if (v === 'armory') this.openBackpack({ context: this.armReturnCtx });
    else if (v === 'backpack') {
      if (this.bagCtx === 'match') this._call('closeBagPanel');
      else this._call('showPersonal');
    } else if (v === 'bagSelect') this._call('showTeamSetup');
    else if (v === 'personal') this._call('showHome');
  }

  _slotTap(bagId, slot) {
    const ctx = this._bagScreenCtx();
    if (ctx === 'manage' && slot) { this._click(); this.openArmory({ bagId, slot }); return; }
    this._bagTap(bagId);
  }

  // 当前背包屏的 context；不在背包屏（如个人界面摘要卡）时返回 null
  _bagScreenCtx() {
    if (this._visible === 'bagSelect') return 'select';
    if (this._visible !== 'backpack') return null;
    return BAG_CONTEXTS.includes(this.bagCtx) && this.bagCtx !== 'select' ? this.bagCtx : 'manage';
  }

  _bagTap(bagId) {
    if (!bagId) return;
    const ctx = this._bagScreenCtx();
    if (!ctx) { this._click(); this.openBackpack({ context: 'manage' }); return; }
    const p = this.profile;
    if (!p) { this._notify('档案尚未就绪，请稍后再试', 'bad'); return; }
    const name = this._bagName(bagId);
    if (ctx === 'manage') {
      this._notify('点背包里的槽位进入武器库更换装备', 'warn');
      return;
    }
    if (ctx === 'match') {
      this._click();
      const active = this._playerBag('activeBagId');
      this._call('requestBagChange', bagId);
      this._notify(bagId === active ? `${name} 正在使用` : `已登记：下次复活使用${name}`, bagId === active ? 'warn' : 'ok');
      this.refresh();
      return;
    }
    // select：设为主页默认背包（存储不可用时仍在本次会话内生效，但要如实提示）
    this._click();
    const res = this._try(() => p.selectBackpack(bagId), { ok: false, saved: false });
    if (res && res.ok && res.saved === false) this._notify(`主页默认：${name}（本次会话有效，${NO_SAVE_TIP}）`, 'warn');
    else if (res && res.ok) this._notify(`主页默认：${name}`, 'ok');
    else this._notify(`无法把${name}设为主页默认`, 'bad');
    this.refresh();
  }

  _equip(weaponId) {
    const p = this.profile;
    const bagId = this.armBagId;
    const slot = this.armSlot || slotOfWeapon(weaponId);
    if (!p || !bagId || !slot) {
      this._notify('装备上下文已失效，请返回背包重新选择槽位', 'bad');
      return;
    }
    const name = this._bagName(bagId);
    const res = this._try(() => p.equip(bagId, slot, weaponId), { ok: false, error: '装备接口不可用' });
    if (res && res.ok) {
      this._click('buy');
      // 提示打在即将返回的背包屏上（装备成功后会立即切屏）；写盘失败必须如实说明，不能报绿色成功
      const target = this.armReturnCtx === 'select' ? 'bagSelect' : 'backpack';
      if (res.saved === false) this._notify(`已装备到${name}，但${NO_SAVE_TIP}`, 'warn', target);
      else this._notify(`已装备到${name}`, 'ok', target);
      this.openBackpack({ context: this.armReturnCtx });
      return;
    }
    this._notify(`装备失败：${(res && res.error) || '该槽位不接受这件装备'}`, 'bad');
  }

  _saveNick() {
    const p = this.profile;
    const input = this.screens.personal && this.screens.personal.querySelector('[data-role=nick]');
    if (!p) { this._notify('档案尚未就绪，请稍后再试', 'bad'); return; }
    const name = String((input && input.value) || '').trim() || DEFAULT_NICK;
    const res = this._try(() => p.setNickname(name), { ok: false, saved: false });
    if (input && input.value !== name) input.value = name;
    if (res && res.ok && res.saved === false) this._notify(`${name} 已应用，但${NO_SAVE_TIP}`, 'warn');
    else if (res && res.ok) this._notify(`昵称已保存：${name}`, 'ok');
    else if (res && res.error) this._notify(`昵称保存失败：${res.error}`, 'bad');
    else this._notify('昵称保存失败', 'bad');
    this.refresh();
  }

  // ---------- 渲染 ----------
  _renderHome() {
    const el = this.screens.home && this.screens.home.querySelector('[data-role=who]');
    if (!el) return;
    const p = this.profile;
    const nick = (p && p.data && p.data.nickname) || DEFAULT_NICK;
    const bagId = p && p.data && p.data.selectedBackpackId;
    const bag = bagId ? this._backpackById(bagId) : null;
    const lo = bag ? this._loadout(bag) : null;
    const main = lo && lo.primary && lo.primary.got ? lo.primary.name : null;
    const bits = [`昵称：${esc(nick)}`];
    bits.push(bag ? `主页默认：${esc(this._bagName(bag.id))}${main ? '（' + esc(main) + '）' : ''}` : '主页默认：未设置');
    el.innerHTML = bits.join(' · ');
  }

  _renderPersonal() {
    const c = this.screens.personal;
    if (!c) return;
    const p = this.profile;
    const nick = (p && p.data && p.data.nickname) || DEFAULT_NICK;
    const input = c.querySelector('[data-role=nick]');
    if (input && document.activeElement !== input && input.value !== nick) input.value = nick;
    const hint = c.querySelector('[data-role=nickHint]');
    if (hint) {
      const off = !p || p.available === false;
      hint.textContent = off ? NO_SAVE_TIP : '昵称与配装保存在这台设备的浏览器里。';
      hint.classList.toggle('warn', off);
    }
    const box = c.querySelector('[data-role=bagCards]');
    if (box) box.innerHTML = this._bagCards({ ctx: 'summary', clickable: !!p });
  }

  _renderBag(name, ctx) {
    const c = this.screens[name];
    if (!c) return;
    const p = this.profile;
    const bags = this._bags();
    const sel = (p && p.data && p.data.selectedBackpackId) || null;
    const title = c.querySelector('[data-role=bagTitle]');
    const sub = c.querySelector('[data-role=bagSub]');
    const state = c.querySelector('[data-role=stateBar]');
    const box = c.querySelector('[data-role=bagCards]');
    const foot = c.querySelector('[data-role=bagFoot]');
    const note = c.querySelector('[data-role=bagNote]');
    const meta = {
      manage: ['背包', '管理背包 · 点槽位进入武器库', '「主页默认」是进入团队竞技时使用的背包；点某个槽位可以更换该槽位的装备。'],
      select: ['选择初始背包', '团队竞技 · 开局使用主页默认背包', '点整张卡片把某个背包设为主页默认，然后进入对局。'],
      match: ['更换背包', '局内更换 · 下次复活生效', '「当前使用」是本次出生已在用的背包；「下次复活生效」是已登记、复活时切换的背包。'],
    }[ctx] || ['背包', '', ''];
    if (title) title.textContent = meta[0];
    if (sub) sub.textContent = `${meta[1]} · 共 ${bags.length} 个背包`;
    if (state) state.textContent = meta[2];
    if (box) box.innerHTML = bags.length ? this._bagCards({ ctx, clickable: !!p }) : '<div class="m1Hint">档案尚未就绪，暂时读不到背包。</div>';
    if (foot) {
      if (ctx === 'manage') {
        foot.innerHTML = '<button class="m1Btn sec" data-act="back">返回个人界面</button>';
      } else if (ctx === 'select') {
        foot.innerHTML = '<button class="m1Btn go" data-act="start">进入对局</button><button class="m1Btn sec" data-act="back">返回设置</button>';
      } else {
        foot.innerHTML = '<button class="m1Btn go" data-act="closeBag">关闭（B）</button>';
      }
    }
    if (note) {
      if (ctx === 'match') {
        const pend = this._playerBag('pendingBagId');
        note.textContent = pend
          ? `已登记：下次复活使用${this._bagName(pend)}。换包不会补充弹药或投掷物。`
          : '还没有登记更换：点卡片登记「下次复活生效」的背包。换包不会补充弹药或投掷物。';
      } else {
        note.textContent = '弹药与投掷物只在新出生时生成；换武器、开面板都不会补给。';
      }
    }
  }

  _renderArmory() {
    const c = this.screens.armory;
    if (!c) return;
    const p = this.profile;
    const sub = c.querySelector('[data-role=armSub]');
    const grid = c.querySelector('[data-role=armCards]');
    if (!grid) return;
    const slot = this.armSlot;
    const bagId = this.armBagId;
    if (sub) sub.textContent = slot ? `${bagId ? this._bagName(bagId) : '未选择背包'} · ${SLOT_CN[slot]}` : '未选择槽位';
    if (!p || !slot) {
      grid.innerHTML = '<div class="m1Hint">请先从背包里点一个槽位，再选择要装备的武器。</div>';
      return;
    }
    const bag = bagId ? this._backpackById(bagId) : null;
    const lo = bag ? this._loadout(bag) : {};
    const cur = lo[slot] && lo[slot].got ? lo[slot].id : null;
    const ids = this._slotWeapons(slot);
    grid.innerHTML = ids.length ? ids.map((id) => {
      const w = WEAPONS[id];
      const wname = (w && w.name) || id;
      const desc = USE_DESC[id] || '现有装备';
      return `<div class="m1Arm${id === cur ? ' on' : ''}" data-w="${esc(id)}">
        <span class="m1Thumb big"><img data-icon="${esc(id)}" alt=""></span>
        <b class="m1ArmName">${esc(wname)}</b>
        <small class="m1ArmDesc">${esc(desc)}</small>
        ${id === cur ? '<span class="m1Tag on">已装备</span>' : ''}
      </div>`;
    }).join('') : '<div class="m1Hint">该槽位当前没有可装备的武器。</div>';
  }

  _bagCards({ ctx, clickable }) {
    const p = this.profile;
    const sel = (p && p.data && p.data.selectedBackpackId) || null;
    const active = ctx === 'match' ? this._playerBag('activeBagId') : null;
    const pending = ctx === 'match' ? this._playerBag('pendingBagId') : null;
    return this._bags().map((bag, i) => {
      const id = bag.id;
      const name = bag.name || `背包${i + 1}`;
      const lo = this._loadout(bag);
      const tags = this._tags(id, ctx, sel, active, pending);
      const slots = SLOTS.map((slot) => {
        const cell = lo[slot] || {};
        const thumb = cell.got ? `<span class="m1Thumb"><img data-icon="${esc(cell.id)}" alt=""></span>` : '<span class="m1Thumb"></span>';
        const go = ctx === 'manage' ? '<span class="m1SlotGo">更换</span>' : '';
        // 摘要卡（个人界面）上的槽位不单独响应，点整张卡片进入背包管理
        const hit = ctx === 'summary' ? '' : ` data-bag="${esc(id)}" data-slot="${slot}"`;
        return `<div class="m1Slot${cell.got ? '' : ' bad'}"${hit}>
          <span class="m1SlotLab">${SLOT_CN[slot]}</span>${thumb}
          <span class="m1SlotName">${esc(cell.name || '未装备')}</span>${go}
        </div>`;
      }).join('');
      const act = ctx === 'summary' ? ' data-act="bag"' : '';
      return `<div class="m1Bag${ctx === 'manage' ? '' : ' pick'}${clickable ? '' : ' off'}" data-bag="${esc(id)}"${act}>
        <div class="m1BagTop"><b class="m1BagName">${esc(name)}</b><span class="m1Tags">${tags}</span></div>
        <div class="m1Slots">${slots}</div>
        ${ctx === 'summary' ? '<div class="m1Hint">点击进入背包管理</div>' : ''}
      </div>`;
    }).join('');
  }

  _tags(id, ctx, sel, active, pending) {
    const out = [];
    if (ctx === 'match') {
      if (active && id === active) out.push(['on', '当前使用']);
      if (pending && id === pending) out.push(['next', '下次复活生效']);
      if (!out.length && !active && !pending && id === sel) out.push(['home', '主页默认']);
    } else if (id === sel) out.push(['home', '主页默认']);
    return out.map(([k, t]) => `<span class="m1Tag ${k}">${t}</span>`).join('');
  }

  _slotWeapons(slot) {
    const idx = SLOT_INDEX[slot];
    let ids = [];
    try { ids = weaponsForSlot(slot) || []; } catch (e) { ids = []; }
    const out = [];
    for (const id of ids) {
      const w = WEAPONS[id];
      if (!w || w.slot !== idx || out.includes(id)) continue;
      out.push(id);
    }
    return out;
  }

  _applyIcons() {
    const icons = this.icons || {};
    for (const img of this.root.querySelectorAll('img[data-icon]')) {
      const src = icons[img.dataset.icon];
      if (src) {
        if (img.getAttribute('src') !== src) img.setAttribute('src', src);
        img.classList.add('ready');
      } else {
        img.removeAttribute('src');
        img.classList.remove('ready');
      }
    }
  }

  _paintNotice() {
    const n = this.notice;
    for (const el of this.root.querySelectorAll('.m1Notice')) {
      const scr = el.closest ? el.closest('.screen') : null;
      const on = !!n && (!n.screen || (scr && scr.id === n.screen));
      el.textContent = on ? n.text : '';
      el.className = 'm1Notice' + (on ? ' show ' + (n.kind || 'ok') : '');
    }
  }

  // ---------- 工具 ----------
  get profile() { return this.g ? this.g.profile : null; }

  _bags() {
    const p = this.profile;
    const list = p && p.data && Array.isArray(p.data.backpacks) ? p.data.backpacks : [];
    return list.filter((b) => b && typeof b.id === 'string' && b.id);
  }

  _backpackById(id) {
    const p = this.profile;
    if (p && typeof p.getBackpack === 'function') {
      const bag = this._try(() => p.getBackpack(id), null);
      if (bag && typeof bag === 'object') return bag;
    }
    return this._bags().find((b) => b.id === id) || null;
  }

  _bagName(id) {
    const bags = this._bags();
    const i = bags.findIndex((b) => b.id === id);
    if (i < 0) return '该背包';
    return (bags[i] && bags[i].name) || `背包${i + 1}`;
  }

  _loadout(bag) {
    const p = this.profile;
    let lo = null;
    if (p && typeof p.getLoadout === 'function' && bag && bag.id) lo = this._try(() => p.getLoadout(bag.id), null);
    if (!lo || typeof lo !== 'object') lo = bag && typeof bag === 'object' ? bag : {};
    const out = {};
    for (const slot of SLOTS) {
      const raw = lo[slot];
      const w = typeof raw === 'string' ? WEAPONS[raw] : null;
      const declared = typeof raw === 'string' ? slotOfWeapon(raw) : null;
      const got = !!w && w.slot === SLOT_INDEX[slot] && (declared === null || declared === slot);
      out[slot] = got
        ? { id: raw, name: w.name || raw, got: true }
        : { id: null, name: raw ? `未知装备（${raw}）` : '未装备', got: false };
    }
    return out;
  }

  _playerBag(key) {
    const pl = this.g && this.g.player;
    const v = pl ? pl[key] : null;
    return typeof v === 'string' && v ? v : null;
  }

  _notify(text, kind = 'ok', screen = this._visible) {
    this.notice = { text, kind, screen: screen || null };
    this._paintNotice();
    clearTimeout(this._noticeTimer);
    this._noticeTimer = setTimeout(() => { this.notice = null; this._paintNotice(); }, 2800);
  }

  _click(kind = 'click') {
    const a = this.g && this.g.audio;
    if (!a || typeof a.playUI !== 'function') return;
    try { a.playUI(kind); } catch (e) { /* 音效失败不影响界面 */ }
  }

  _call(name, ...args) {
    const fn = this.g ? this.g[name] : null;
    if (typeof fn !== 'function') {
      this._notify(`入口尚未接入（${name}）`, 'bad');
      return undefined;
    }
    try { return fn.apply(this.g, args); } catch (e) {
      this._notify(`操作失败：${(e && e.message) || e}`, 'bad');
      return undefined;
    }
  }

  _try(fn, fallback) {
    try { return fn(); } catch (e) { return fallback; }
  }
}
