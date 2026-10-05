// M1 界面层：主页 / 个人界面 / 背包 / 武器库 / 初始背包选择
// 契约：docs/m1-interfaces.md 的「src/screens.js 接口」与 context 语义。
// 只通过契约列出的 game.* 方法回调，只读 game.profile 的公开接口，
// 不直接改 game 的其它状态，也不依赖 hud.js / profile.js 的内部实现。
import { WEAPONS } from './weapons.js';
import { weaponsForSlot, slotOfWeapon } from './profile.js';
import { bombMapInfo } from './map-catalog.js';

const SCREEN_NAMES = ['home', 'personal', 'backpack', 'armory', 'bagSelect'];
const BAG_CONTEXTS = ['manage', 'select', 'match'];
const SLOTS = ['primary', 'secondary', 'melee', 'throwable'];
const SLOT_INDEX = { primary: 0, secondary: 1, melee: 2, throwable: 3 };
const SLOT_CN = { primary: '主武器', secondary: '副武器', melee: '近战', throwable: '投掷物' };
const DEFAULT_NICK = '我';
const NO_SAVE_TIP = '无法保存到本地，本次会话配置仍然有效';
// 未交付的战术投掷物不进列表：
// 列表只取 weaponsForSlot(slot)，再用 WEAPONS[id].slot 校验，WEAPONS 里不存在的 ID 一律跳过。
const USE_DESC = {
  scar: '精准点射 · 首发稳定，持续扫射与机动性有所取舍',
  qbz95: '机动步枪 · 短连发恢复快，后置弹匣',
  p90: '近距持续输出 · 大容量，远距离衰减明显',
  barrett: '重型狙击 · 穿透强，移动、切枪和射击恢复较慢',
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
<div class="m1Box m1HomeBox lobbyShell">
  <header class="lobbyHeader">
    <div class="lobbyBrand"><span class="lobbyLogo">CROSSFIRE</span><h1>作战大厅</h1></div>
    <div class="lobbyLocal"><span></span>本地档案</div>
  </header>
  <main class="lobbyBody">
    <section class="lobbyStage" data-role="lobbyStage" aria-label="当前角色与配装展示">
      <div class="lobbyStageLabel"><span>OPERATOR</span><small>准备就绪</small></div>
      <div class="lobbyIdentity">
        <div class="lobbyIdentityTop"><span class="lobbyCallsign">当前角色</span><strong data-role="who"></strong></div>
        <div class="lobbyLoadout"><span data-role="lobbyBagName"></span><span class="lobbySeparator"></span><strong data-role="lobbyPrimary"></strong></div>
        <div class="lobbyBagPicker" data-role="lobbyBagPicker" aria-label="选择大厅默认背包"></div>
      </div>
    </section>
    <section class="lobbyModes" aria-labelledby="lobbyModeTitle">
      <div class="lobbyModeHeading"><h2 id="lobbyModeTitle">选择模式</h2><span>人机对战</span></div>
      <div class="lobbyModeList" role="group" aria-label="作战模式">
        <button class="lobbyModeCard" data-act="team" aria-pressed="false">
          <span class="lobbyMapArt lobbyMapShip" aria-hidden="true">
            <svg viewBox="0 0 160 160" focusable="false"><path class="mapOutline" d="M17 137h129V63l-22-12V20H48v31L17 63z"/><path class="mapFloor" d="M20 115l54-36 68 37-54 35z"/><path class="mapCrate" d="M33 92l26-15 29 15-27 17zM33 92v25l28 17v-25M61 109l27-17v25l-27 17M95 62l22-12 24 12-23 14zM95 62v34l23 14V76M118 76l23-14v34l-23 14"/><path class="mapDetail" d="M75 23v52M98 24v33M21 68l20-12M57 90l17 10M115 56l17 7M38 103l14 8M104 78l7 5"/><path class="mapAccent" d="M47 141l29-18 19 11"/></svg>
            <span>TRANSPORT SHIP</span>
          </span>
          <span class="lobbyModeCopy"><span class="lobbyModeMeta">团队模式<span class="lobbyModeStatus" aria-hidden="true"></span></span><b>团队竞技</b><small>运输船</small><span class="lobbyModeRule">击杀得分，阵亡后复活</span></span>
        </button>
        <button class="lobbyModeCard" data-act="bomb" aria-pressed="false">
          <span class="lobbyMapArt lobbyMapDesert" aria-hidden="true">
            <svg viewBox="0 0 160 160" focusable="false"><path class="mapFloor" d="M12 116l67-40 68 41-68 36z"/><path class="mapOutline" d="M30 124V49l47-26 54 27v70M77 23v55"/><path class="mapCrate" d="M32 79l26-14 22 12-23 14zM32 79v38l25 16V91M57 91l23-14v21M105 99V73l22-10 18 10v37M105 73l21 11 19-11M126 84v37"/><path class="mapDetail" d="M95 98V69q0-20 17-19 17 1 17 24v38M85 35v30M42 48v24M39 55l20-11M90 42l32 17M66 120l18-10 14 8"/><path class="mapAccent" d="M80 138l21-13 14 8M14 119l16-10"/></svg>
            <span data-role="bombMapEnglish"></span>
          </span>
          <span class="lobbyModeCopy"><span class="lobbyModeMeta">回合模式<span class="lobbyModeStatus" aria-hidden="true"></span></span><b>爆破模式</b><small data-role="bombSummary"></small><span class="lobbyModeRule">攻守回合，安放或拆除 C4</span></span>
        </button>
      </div>
      <div class="lobbyLaunch">
        <div class="m1Notice" data-role="notice" role="status" aria-live="polite"></div>
        <button class="lobbyStart" data-act="lobbyStart"><span>开始作战</span><span aria-hidden="true">↗</span></button>
        <div class="lobbyLaunchNote" data-role="homeFoot"></div>
      </div>
    </section>
  </main>
  <nav class="lobbyFooter" aria-label="大厅功能">
    <button data-act="lobbyBag"><span aria-hidden="true">▣</span>背包</button>
    <button data-act="lobbyArmory"><span aria-hidden="true">⌁</span>武器库</button>
    <button data-act="personal"><span aria-hidden="true">◉</span>个人资料</button>
    <button data-act="settings"><span aria-hidden="true">⚙</span>设置</button>
    <div class="lobbyFooterNote">配装保存于当前浏览器</div>
  </nav>
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
<div class="m1Box armoryShell">
  <div class="m1Head">
    <button class="m1Back" data-act="back">返回背包</button>
    <div class="m1HeadTxt"><h2 class="m1H2">武器库</h2><div class="m1Sub" data-role="armSub"></div></div>
  </div>
  <div class="m1Notice" data-role="notice"></div>
  <div class="armoryToolbar"><div><span class="m1Lab">编辑背包</span><div data-role="armBags" class="armoryTabs" role="group" aria-label="编辑哪个背包"></div></div><small>浏览不会更改配装<br>装备后保存并返回背包</small></div>
  <div data-role="armSlots" class="armoryTabs armorySlots" role="group" aria-label="装备槽位"></div>
  <div class="armoryWorkspace"><section class="armoryCatalog" aria-label="可选武器"><div data-role="armFilters" class="armoryTabs" role="group" aria-label="主武器类型"></div><div class="m1ArmGrid" data-role="armCards"></div></section><section data-role="armDetail" class="armoryDetail" aria-label="武器详情"></section></div>
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
    this.armFilter = 'all';
    this.armPreview = null;
    this.armReturnCtx = 'manage';
    this.manageReturn = 'personal';
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
    this.armFilter = 'all';
    this.armPreview = null;
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
      ? e.target.closest('[data-act],[data-slot],[data-bag],[data-w],[data-lobby-bag],[data-preview],[data-filter],[data-arm-bag],[data-arm-slot]')
      : null;
    if (!t || !container.contains(t)) return;
    if (t.dataset.preview || t.dataset.filter || t.dataset.armBag || t.dataset.armSlot) {
      this._click();
      if (t.dataset.preview) this.armPreview = t.dataset.preview;
      if (t.dataset.filter) { this.armFilter = t.dataset.filter; this.armPreview = null; }
      if (t.dataset.armBag) this.armBagId = t.dataset.armBag;
      if (t.dataset.armSlot) { this.armSlot = t.dataset.armSlot; this.armFilter = 'all'; this.armPreview = null; }
      const key = ['preview', 'filter', 'armBag', 'armSlot'].find((key) => t.dataset[key]);
      const value = t.dataset[key];
      this.refresh();
      [...container.querySelectorAll('button')].find((button) => button.dataset[key] === value)?.focus({ preventScroll: true });
      return;
    }
    if (t.dataset.lobbyBag) { this._selectLobbyBag(t.dataset.lobbyBag); return; }
    if (t.dataset.act) return this._act(t.dataset.act);
    if (t.dataset.slot) return this._slotTap(t.dataset.bag, t.dataset.slot);
    if (t.dataset.bag) return this._bagTap(t.dataset.bag);
    if (t.dataset.w) return this._equip(t.dataset.w);
  }

  // ---------- 交互 ----------
  _act(act) {
    switch (act) {
      case 'team': this._click(); this._call('selectLobbyMode', 'team'); break;
      case 'bomb': this._click(); this._call('selectLobbyMode', 'bomb'); break;
      case 'lobbyStart': this._click('start'); this._call('openLobbySetup'); break;
      case 'lobbyBag': this._click(); this._call('openLobbyBackpack'); break;
      case 'lobbyArmory': this._click(); this._call('openLobbyArmory'); break;
      case 'personal': this._click(); this._call('showPersonal'); break;
      case 'settings': this._click(); this._call('showSettings'); break;
      case 'home': this._click(); this._call('showHome'); break;
      case 'manage': this._click(); this.openBackpack({ context: 'manage' }); break;
      case 'bag': this._click(); this.openBackpack({ context: 'manage' }); break;
      case 'saveNick': this._saveNick(); break;
      case 'back': this._back(); break;
      case 'start': this._click('start'); this._call('startSelectedMatch'); break;
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
      else this._call(this.manageReturn === 'home' ? 'showHome' : 'showPersonal');
    } else if (v === 'bagSelect') this._call('showSelectedSetup');
    else if (v === 'personal') this._call('showHome');
  }

  _selectLobbyBag(bagId) {
    this._click();
    const result = this._call('selectLobbyBackpack', bagId);
    if (result && result.ok && result.saved === false) this._notify(`${this._bagName(bagId)} 已应用，但${NO_SAVE_TIP}`, 'warn', 'home');
    else if (result && result.ok === false) this._notify(`无法选择${this._bagName(bagId)}`, 'bad', 'home');
    this.refresh();
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
      const bomb = this.g.mode === 'bomb';
      const preparation = bomb && this.g.bomb && this.g.bomb.phase === 'preparation';
      if (bomb && !preparation && this.g.player && this.g.player.alive) {
        this._notify('回合进行中不能更换背包，请在回合准备时或阵亡后选择', 'warn');
        return;
      }
      this._click();
      const active = this._playerBag('activeBagId');
      const res = this._call('requestBagChange', bagId);
      if (bomb && (res === false || (res && res.ok === false))) {
        this._notify('当前不能更换背包，请在回合准备时或阵亡后选择', 'warn');
      } else {
        const next = bomb ? '下一回合' : '下次复活';
        this._notify(preparation ? `${name} 已在本回合生效` : bagId === active ? `${name} 正在使用` : `已登记：${next}使用${name}`, bagId === active && !preparation ? 'warn' : 'ok');
      }
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
      else this._notify(`${WEAPONS[weaponId].name} 已装备到${name} · ${SLOT_CN[slot]}`, 'ok', target);
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
    const home = this.screens.home;
    if (!home) return;
    const map = bombMapInfo(this.g.bombMapId);
    home.querySelector('[data-role=bombSummary]').textContent = `${map.name} · 5v5`;
    home.querySelector('[data-role=bombMapEnglish]').textContent = map.english;
    const mode = this.g.selectedMode === 'bomb' ? 'bomb' : 'team';
    for (const button of home.querySelectorAll('.lobbyModeCard')) {
      const selected = button.dataset.act === mode;
      button.classList.toggle('selected', selected);
      button.setAttribute('aria-pressed', String(selected));
    }
    home.querySelector('[data-role=homeFoot]').textContent = `${mode === 'bomb' ? `爆破模式 · ${map.name}` : '团队竞技 · 运输船'} · 下一步选择阵营与难度`;
    const p = this.profile;
    const nick = (p && p.data && p.data.nickname) || DEFAULT_NICK;
    const bagId = p && p.data && p.data.selectedBackpackId;
    const bag = bagId ? this._backpackById(bagId) : null;
    const lo = bag ? this._loadout(bag) : null;
    const main = lo && lo.primary && lo.primary.got ? lo.primary.name : null;
    home.querySelector('[data-role=who]').textContent = nick;
    home.querySelector('[data-role=lobbyBagName]').textContent = bag ? this._bagName(bag.id) : '未设置背包';
    home.querySelector('[data-role=lobbyPrimary]').textContent = main || '未装备主武器';
    const picker = home.querySelector('[data-role=lobbyBagPicker]');
    const bags = this._bags();
    const existing = [...picker.querySelectorAll('[data-lobby-bag]')];
    if (existing.length !== bags.length || existing.some((button, i) => button.dataset.lobbyBag !== bags[i].id)) {
      picker.innerHTML = bags.map((item, i) => `<button data-lobby-bag="${esc(item.id)}"><span>${i + 1}</span></button>`).join('');
    }
    for (const button of picker.querySelectorAll('[data-lobby-bag]')) {
      button.setAttribute('aria-label', `选择${this._bagName(button.dataset.lobbyBag)}`);
      button.setAttribute('aria-pressed', String(button.dataset.lobbyBag === bagId));
      button.disabled = !p;
    }
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
    const bomb = ctx === 'match' ? this.g.mode === 'bomb' : this.g.selectedMode === 'bomb';
    const preparation = bomb && this.g.bomb && this.g.bomb.phase === 'preparation';
    const meta = {
      manage: ['背包', '管理背包 · 点槽位进入武器库', '「主页默认」是进入团队竞技时使用的背包；点某个槽位可以更换该槽位的装备。'],
      select: ['选择初始背包', `${bomb ? bombMapInfo(this.g.bombMapId).name : '团队竞技'} · 开局使用主页默认背包`, '点整张卡片把某个背包设为主页默认，然后进入对局。'],
      match: bomb
        ? ['更换背包', preparation ? '回合准备 · 立即生效' : '回合对局 · 阵亡后登记下一回合', '准备阶段可立即更换；存活且回合进行时锁定；阵亡后可登记下一回合的配装。']
        : ['更换背包', '局内更换 · 下次复活生效', '「当前使用」是本次出生已在用的背包；「下次复活生效」是已登记、复活时切换的背包。'],
    }[ctx] || ['背包', '', ''];
    if (title) title.textContent = meta[0];
    if (sub) sub.textContent = `${meta[1]} · 共 ${bags.length} 个背包`;
    if (state) state.textContent = meta[2];
    if (box) box.innerHTML = bags.length ? this._bagCards({ ctx, clickable: !!p }) : '<div class="m1Hint">档案尚未就绪，暂时读不到背包。</div>';
    if (foot) {
      if (ctx === 'manage') {
        foot.innerHTML = `<button class="m1Btn sec" data-act="back">${this.manageReturn === 'home' ? '返回大厅' : '返回个人界面'}</button>`;
      } else if (ctx === 'select') {
        foot.innerHTML = '<button class="m1Btn go" data-act="start">进入对局</button><button class="m1Btn sec" data-act="back">返回设置</button>';
      } else {
        foot.innerHTML = '<button class="m1Btn go" data-act="closeBag">关闭（B）</button>';
      }
    }
    if (note) {
      if (ctx === 'match') {
        const pend = this._playerBag('pendingBagId');
        note.textContent = bomb
          ? `${pend ? `已登记：下一回合使用${this._bagName(pend)}。` : ''}C4 为独立任务物品：按 5 选择，按住 E 安包或拆包；按 E 拾取掉落 C4。换包不补充弹药或投掷物。`
          : pend
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
    const grid = c.querySelector('[data-role=armCards]');
    const detail = c.querySelector('[data-role=armDetail]');
    const bag = this._backpackById(this.armBagId);
    const slot = this.armSlot;
    c.querySelector('[data-role=armSub]').textContent = bag && slot ? `${this._bagName(bag.id)} / ${SLOT_CN[slot]} · 选择武器查看详情` : '从背包选择装备槽位';
    if (!this.profile || !bag || !slot) {
      grid.innerHTML = '<div class="m1Hint">请返回背包选择一个槽位。</div>';
      detail.innerHTML = '';
      for (const role of ['armBags', 'armSlots', 'armFilters']) c.querySelector(`[data-role=${role}]`).innerHTML = '';
      return;
    }
    const tab = (attr, value, label, selected) => `<button ${attr}="${esc(value)}" aria-pressed="${selected}">${esc(label)}</button>`;
    c.querySelector('[data-role=armBags]').innerHTML = this._bags().map((b) => tab('data-arm-bag', b.id, this._bagName(b.id), b.id === bag.id)).join('');
    c.querySelector('[data-role=armSlots]').innerHTML = SLOTS.map((v) => tab('data-arm-slot', v, SLOT_CN[v], v === slot)).join('');
    const types = { rifle: '步枪', smg: '冲锋枪', sniper: '狙击枪', pistol: '手枪', melee: '近战', grenade: '投掷物' };
    const all = this._slotWeapons(slot);
    const filters = { all: '全部', rifle: '步枪', smg: '冲锋枪', sniper: '狙击枪' };
    c.querySelector('[data-role=armFilters]').innerHTML = slot === 'primary' ? Object.entries(filters).map(([value,label]) => tab('data-filter', value, `${label} ${all.filter((id) => value === 'all' || WEAPONS[id].type === value).length}`, this.armFilter === value)).join('') : '';
    const ids = all.filter((id) => slot !== 'primary' || this.armFilter === 'all' || WEAPONS[id].type === this.armFilter);
    const current = bag[slot];
    if (!ids.includes(this.armPreview)) this.armPreview = ids.includes(current) ? current : ids[0];
    grid.innerHTML = ids.map((id) => `<button class="m1Arm${id === this.armPreview ? ' selected' : ''}" data-preview="${esc(id)}" aria-pressed="${id === this.armPreview}">
      <span class="m1Thumb big"><img data-icon="${esc(id)}" alt=""></span><b class="m1ArmName">${esc(WEAPONS[id].name)}</b><small class="m1ArmDesc">${types[WEAPONS[id].type]}</small>${id === current ? '<span class="m1Tag on">已装备</span>' : ''}</button>`).join('');
    const w = WEAPONS[this.armPreview], equipped = WEAPONS[current];
    if (!w) { detail.innerHTML = '<p>该分类暂无武器。</p>'; return; }
    const gun = w.type !== 'grenade' && w.type !== 'melee';
    const metrics = gun ? [['dmg','基础伤害',''],['rpm','射速','发/分'],['mag','弹匣容量','发'],['reload','换弹','秒']] : w.type === 'melee' ? [['dmgLight','轻击伤害',''],['dmgHeavy','重击伤害',''],['speed','移动倍率','×']] : [['dmg','中心伤害',''],['radius','作用半径','米'],['fuse','引信','秒']];
    const format = (n) => Number(n.toFixed(2)).toString();
    const stats = metrics.map(([key,label,unit]) => {
      const value = w[key], other = equipped?.[key];
      if (!Number.isFinite(value)) return '';
      const delta = Number.isFinite(other) && w.id !== current ? Math.round((value - other) * 100) / 100 : 0;
      return `<div><dt>${label}</dt><dd>${format(value)}<small>${unit}</small>${delta ? `<span class="armoryDelta">${delta > 0 ? '+' : '−'}${format(Math.abs(delta))}</span>` : ''}</dd></div>`;
    }).join('');
    detail.innerHTML = `<div class="armoryEyebrow">${types[w.type]} / ${SLOT_CN[slot]}</div><h3>${esc(w.name)}</h3><div class="armoryHero"><img data-icon="${esc(w.id)}" alt="${esc(w.name)} 模型预览"></div><p>${esc(USE_DESC[w.id] || '现有装备')}</p><div class="armoryCompare">${w.id === current ? '当前装备' : `对比当前：${esc(equipped?.name || '未装备')}`}</div><dl class="armoryStats">${stats}</dl>${gun ? `<div class="armoryHandling">切枪 ${format(w.draw)} 秒 · 移动倍率 ${format(w.speed)}×</div>` : ''}<small class="armoryStatNote">${gun ? '伤害为基础值，实战受距离、护甲与命中部位影响。差值不代表整体强弱。' : '实际效果受距离与命中位置影响。'}</small><button class="m1Btn go armoryEquip" data-w="${esc(w.id)}" ${w.id === current ? 'disabled' : ''}>${w.id === current ? `已装备于${esc(this._bagName(bag.id))}` : `装备到${esc(this._bagName(bag.id))}`}</button><small class="armoryTarget">${SLOT_CN[slot]} · 不改变默认出战背包</small>`;
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
      if (pending && id === pending) out.push(['next', this.g.mode === 'bomb' ? '下一回合生效' : '下次复活生效']);
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
