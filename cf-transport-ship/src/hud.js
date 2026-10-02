// HUD 与菜单（DOM）
import { WEAPONS } from './weapons.js';

const TEAM_CN = { BL: '潜伏者', GR: '保卫者' };
const $ = (s, r = document) => r.querySelector(s);
const BOMB_PHASE_CN = { preparation: '回合准备', live: '回合进行', planted: 'C4 已安放', result: '回合结算', finished: '比赛结束' };
const BOMB_STATE_CN = { unplanted: '未安放', carried: '携带中', dropped: '已掉落', planted: '已安放', defused: '已拆除', exploded: '已爆炸' };
const clockText = (seconds) => {
  const t = Math.max(0, Math.ceil(Number(seconds) || 0));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
};

const HS_ICON = 'data:image/svg+xml;utf8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><g fill="none" stroke="#ff4030" stroke-width="3"><circle cx="20" cy="20" r="11"/><path d="M20 2v10M20 28v10M2 20h10M28 20h10"/></g><circle cx="20" cy="20" r="3.5" fill="#ff4030"/></svg>`);
const WB_ICON = 'data:image/svg+xml;utf8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect x="15" y="4" width="10" height="32" fill="#bbb"/><path d="M2 20h36" stroke="#ffd24a" stroke-width="3"/></svg>`);
const BADGE_SVG = (color, inner) => `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><defs><radialGradient id="bg" cx="50%" cy="45%"><stop offset="0" stop-color="${color}" stop-opacity=".95"/><stop offset="1" stop-color="#1a0a00" stop-opacity=".9"/></radialGradient></defs><polygon points="50,3 93,27 93,73 50,97 7,73 7,27" fill="url(#bg)" stroke="#ffd24a" stroke-width="3"/>${inner}</svg>`;
const SKULL = `<g fill="#fff"><path d="M50 22c-14 0-24 9-24 22 0 8 4 13 9 16v9h30v-9c5-3 9-8 9-16 0-13-10-22-24-22z"/><rect x="40" y="66" width="4" height="8"/><rect x="48" y="66" width="4" height="8"/><rect x="56" y="66" width="4" height="8"/></g><circle cx="41" cy="45" r="6" fill="#3a1500"/><circle cx="59" cy="45" r="6" fill="#3a1500"/>`;
const CROSSHAIR_B = `<g fill="none" stroke="#fff" stroke-width="4"><circle cx="50" cy="50" r="20"/><path d="M50 18v14M50 68v14M18 50h14M68 50h14"/></g><circle cx="50" cy="50" r="5" fill="#ff3020"/>`;

export class HUD {
  constructor(game) {
    this.g = game;
    this.root = $('#ui');
    this.root.innerHTML = TEMPLATE;
    this.el = {};
    for (const n of this.root.querySelectorAll('[id]')) this.el[n.id] = n;
    this.teamSetupDesc = this.el.setupDesc.innerHTML;
    this.icons = {};
    this.feedItems = [];
    this.dmgDirs = [];
    this.hitT = 0; this.toastT = 0;
    this.slotsT = 0;
    this.rosterDots = new Map();
    this.rosterLabels = {};
    this.personalStatsKey = null;
    this.radarCtx = this.el.radar.getContext('2d');
    const touch = matchMedia('(pointer:coarse)').matches;
    this.opts = { team: 'BL', primary: 'ak47', size: 6, diff: 'normal', goal: 50, tod: 'day', quality: touch ? 'low' : 'high', sens: 1.0, fov: 78, vol: 0.8 };
    try { Object.assign(this.opts, JSON.parse(localStorage.getItem('cf_ship_opts') || '{}')); } catch (e) { /* 忽略 */ }
    this.buildMenu();
  }
  saveOpts() { try { localStorage.setItem('cf_ship_opts', JSON.stringify(this.opts)); } catch (e) { /* 忽略 */ } }

  // ---------- 菜单 ----------
  buildMenu() {
    const o = this.opts;
    const segs = this.root.querySelectorAll('.seg[data-k]');
    for (const s of segs) {
      const k = s.dataset.k;
      for (const b of s.querySelectorAll('button')) {
        if (String(o[k]) === b.dataset.v) b.classList.add('on');
        b.addEventListener('click', () => {
          for (const x of s.querySelectorAll('button')) x.classList.remove('on');
          b.classList.add('on');
          o[k] = isNaN(+b.dataset.v) ? b.dataset.v : +b.dataset.v;
          this.saveOpts();
          this.g.onOption?.(k, o[k]);
          this.g.audio?.playUI('click');
        });
      }
    }
    for (const sl of this.root.querySelectorAll('.slider[data-k]')) {
      const k = sl.dataset.k, inp = sl.querySelector('input'), sp = sl.querySelector('span');
      inp.value = o[k]; sp.textContent = (+o[k]).toFixed(k === 'fov' ? 0 : 2);
      inp.addEventListener('input', () => {
        o[k] = +inp.value; sp.textContent = (+inp.value).toFixed(k === 'fov' ? 0 : 2); this.saveOpts();
        this.g.onOption?.(k, o[k]);
      });
    }
    $('#btnStart').addEventListener('click', () => this.g.showBagSelect());
    $('#btnMenuBack').addEventListener('click', () => this.g.onMenuBack?.());
    $('#btnResume').addEventListener('click', () => this.g.resume());
    $('#btnQuit').addEventListener('click', () => this.g.quitToMenu());
    $('#btnAgain').addEventListener('click', () => this.g.restartMatch());
    $('#btnMenu').addEventListener('click', () => this.g.quitToMenu());
    if (matchMedia('(pointer:coarse)').matches) $('#touchNote').classList.remove('hidden');
    for (const a of this.root.querySelectorAll('#clinks a, .mlinks a'))
      a.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
  }
  setIcons(icons) { this.icons = icons; }
  syncControls() {
    const o = this.opts;
    for (const s of this.root.querySelectorAll('.seg[data-k]')) for (const b of s.querySelectorAll('button')) b.classList.toggle('on', String(o[s.dataset.k]) === b.dataset.v);
    for (const sl of this.root.querySelectorAll('.slider[data-k]')) {
      const k = sl.dataset.k; sl.querySelector('input').value = o[k]; sl.querySelector('span').textContent = (+o[k]).toFixed(k === 'fov' ? 0 : 2);
    }
    this.syncModeMenu();
  }
  syncModeMenu() {
    const bomb = this.g.selectedMode === 'bomb';
    const e = this.el;
    e.setupLogo.textContent = `CROSSFIRE · ${bomb ? '爆破模式' : '团队竞技'}`;
    e.setupTitle.textContent = bomb ? '爆破测试场' : '运输船设置';
    e.setupEn.textContent = bomb ? 'BOMB TEST ARENA' : 'TRANSPORT SHIP';
    if (bomb) e.setupDesc.textContent = '在通用 A/B 测试场进行 5v5 爆破对局。潜伏者首轮进攻，保卫者首轮防守；完成第 4 回合后交换攻守，队伍与累计得分保持不变。CF 沙漠灰参考尚未提供，当前场景用于验证爆破玩法。';
    else e.setupDesc.innerHTML = this.teamSetupDesc;
    e.teamRules.classList.toggle('hidden', bomb);
    e.bombRules.classList.toggle('hidden', !bomb);
    for (const node of this.root.querySelectorAll('[data-bomb-key]')) node.classList.toggle('hidden', !bomb);
    e.setupBagHelp.textContent = bomb ? '选择背包（准备期可换；阵亡后登记下一回合）' : '选择背包（下次复活生效）';
    for (const b of this.root.querySelectorAll('#menu .seg[data-k=team] button')) {
      b.querySelector('small').textContent = b.dataset.v === 'BL'
        ? `Black List${bomb ? ' · 首轮进攻' : ''}`
        : `Global Risk${bomb ? ' · 首轮防守' : ''}`;
    }
    e.loadingTitle.textContent = bomb ? '爆破测试场' : '运 输 船';
    e.loadingTip.textContent = bomb ? '携包者按 5 选择 C4，再按住 E 安包；守方按住 E 拆包。阵亡后等待下一回合。' : '小提示：蹲下再跳（蹲跳）可以跳得更高，踩着木箱就能爬上对面集装箱的二楼。';
  }
  show(name, opts = {}) {
    if (name === 'menu' || name === 'pause') this.syncControls();
    if (name === 'loading') this.syncModeMenu();
    for (const n of ['menu', 'pause', 'end', 'loading']) this.el[n].classList.toggle('hidden', n !== name);
    // 主页、个人界面、背包等非对局屏由 screens.js 管理，这里只负责隐藏对局 HUD
    const hideHud = opts.hideHud === true || name === 'menu' || name === 'loading' || name === 'end';
    this.el.hud.classList.toggle('hidden', hideHud);
  }
  loading(p, text) { this.el.loadBar.style.width = (p * 100).toFixed(0) + '%'; if (text) this.el.loadTxt.textContent = text; }

  // ---------- 局内 ----------
  update(dt, s, bomb = s.bomb || null) {
    const e = this.el;
    // 比分与时间
    const score = bomb && bomb.score ? bomb.score : s.score;
    e.sBL.textContent = score.BL; e.sGR.textContent = score.GR;
    const tl = Math.max(0, s.timeLeft), mm = (tl / 60) | 0, ss = (tl % 60) | 0;
    e.sTime.textContent = bomb ? clockText(bomb.deadlineLeft) : `${mm}:${ss < 10 ? '0' : ''}${ss}`;
    e.sGoal.textContent = bomb ? `第 ${bomb.round}/${bomb.maxRounds || 8} 回合` : `团队竞技 · 目标 ${s.goal}`;
    this.updateRoster(s.roster, s.myId);
    this.updatePersonalStats(s.personalStats);
    this.updateBomb(bomb, s);
    e.tBL.classList.toggle('mine', s.myTeam === 'BL'); e.tGR.classList.toggle('mine', s.myTeam === 'GR');
    // 生命护甲
    e.hpVal.textContent = Math.max(0, Math.ceil(s.hp));
    e.arVal.textContent = Math.max(0, Math.ceil(s.armor));
    e.hpBox.classList.toggle('low', s.hp <= 30 && s.alive);
    // 弹药
    const w = s.weapon;
    if (w) {
      const d = w.def;
      e.wName.textContent = d.hudName;
      if (d.type === 'melee') { e.aMag.textContent = '∞'; e.aRes.textContent = ''; }
      else if (d.type === 'grenade') { e.aMag.textContent = w.mag; e.aRes.textContent = ''; }
      else { e.aMag.textContent = w.mag; e.aRes.textContent = '/ ' + w.reserve; }
      e.aMag.classList.toggle('low', d.mag > 1 && w.mag <= Math.ceil(d.mag * 0.2));
      if (this.icons[d.id] && e.wIcon.dataset.id !== d.id) { e.wIcon.src = this.icons[d.id]; e.wIcon.dataset.id = d.id; }
      e.aHint.textContent = w.reloading ? '换弹中…' : (d.mag > 1 && w.mag === 0 && w.reserve === 0 ? '弹药耗尽' : (d.mag > 1 && w.mag === 0 ? '按 R 换弹' : ''));
    }
    const c4Selected = !!bomb && !!s.c4Selected;
    e.wIcon.style.display = c4Selected ? 'none' : '';
    if (c4Selected) {
      e.wName.textContent = 'C4 · 任务物品';
      e.aMag.textContent = 'C4'; e.aRes.textContent = '';
      e.aMag.classList.remove('low');
      e.aHint.textContent = '5 选择 C4 · 按住 E 交互 · Q 返回武器';
    }
    // 准星
    const showX = s.alive && !s.scoped && (c4Selected || (w && w.def.type !== 'sniper'));
    e.cross.style.display = showX ? '' : 'none';
    if (showX) {
      const gap = c4Selected ? 4 : 4 + s.spreadPx;
      e.cT.style.top = -(gap + 9) + 'px'; e.cB.style.top = gap + 'px';
      e.cL.style.left = -(gap + 9) + 'px'; e.cR.style.left = gap + 'px';
    }
    e.scope.classList.toggle('on', !!s.scoped && s.alive && !c4Selected);
    // 命中标记
    if (this.hitT > 0) { this.hitT -= dt; e.hit.style.opacity = Math.min(1, this.hitT * 5); } else e.hit.style.opacity = 0;
    // 受击方向
    for (const d of this.dmgDirs) {
      d.t -= dt;
      const rel = d.ang - s.yaw;
      d.el.style.transform = `rotate(${-rel}rad)`;
      d.el.style.opacity = Math.max(0, Math.min(1, d.t));
      if (d.t <= 0) d.el.remove();
    }
    this.dmgDirs = this.dmgDirs.filter((d) => d.t > 0);
    // 击杀信息淡出
    const now = performance.now();
    this.feedItems = this.feedItems.filter((f) => { if (now - f.t > 7000) { f.el.remove(); return false; } return true; });
    // 提示
    if (this.toastT > 0) { this.toastT -= dt; if (this.toastT <= 0) e.toast.style.opacity = 0; }
    // 中央信息
    if (bomb && !s.alive) {
      e.center.classList.remove('hidden');
      e.cBig.textContent = '你阵亡了';
      e.cSmall.textContent = `等待下一回合 · ${bomb.spectatingName ? `观战：${bomb.spectatingName}` : '固定场景观战'} · Q 切换存活队友 · B 选择下轮背包`;
    } else if (bomb && (bomb.phase === 'preparation' || bomb.phase === 'result')) {
      e.center.classList.remove('hidden');
      e.cBig.textContent = BOMB_PHASE_CN[bomb.phase];
      e.cSmall.textContent = bomb.phase === 'preparation' ? '按 B 选择本回合背包 · 准备结束后行动' : (bomb.hint || '等待下一回合');
    } else if (!s.alive && s.respawnIn > 0) {
      e.center.classList.remove('hidden');
      e.cBig.innerHTML = s.killedBy || '你阵亡了';
      e.cSmall.textContent = `${s.respawnIn.toFixed(1)} 秒后复活 · 按 B 更换武器`;
    } else e.center.classList.add('hidden');
    e.protect.textContent = !bomb && s.protect > 0 && s.alive ? `出生保护 ${s.protect.toFixed(1)}s（开火即解除）` : '';
    e.nameTip.textContent = bomb && !s.alive ? '' : s.aimName || ''; e.nameTip.className = bomb && !s.alive ? '' : s.aimTeam || '';
    if (this.slotsT > 0) { this.slotsT -= dt; e.slots.style.opacity = Math.min(1, this.slotsT * 2); } else e.slots.style.opacity = 0;
  }
  updateRoster(roster, myId) {
    const rows = { BL: this.el.aliveBL, GR: this.el.aliveGR };
    const counts = { BL: { total: 0, alive: 0 }, GR: { total: 0, alive: 0 } };
    const seen = new Set();
    // 每名角色只创建一次节点；死亡、重生、换边和观战只更新状态。
    for (const actor of Array.isArray(roster) ? roster : []) {
      if (!actor || actor.id == null || !rows[actor.team] || seen.has(actor.id)) continue;
      seen.add(actor.id);
      const row = rows[actor.team], count = counts[actor.team];
      let cached = this.rosterDots.get(actor.id);
      if (!cached) {
        const node = document.createElement('i');
        node.className = 'aliveDot';
        node.dataset.actorId = String(actor.id);
        node.setAttribute('aria-hidden', 'true');
        cached = { node, alive: null, self: null };
        this.rosterDots.set(actor.id, cached);
      }
      const alive = actor.alive === true, self = actor.id === myId;
      if (cached.alive !== alive || cached.self !== self) {
        cached.node.classList.toggle('alive', alive);
        cached.node.classList.toggle('dead', !alive);
        cached.node.classList.toggle('self', self);
        cached.node.dataset.alive = String(alive);
        cached.node.title = `${self ? '自己 · ' : ''}${alive ? '存活' : '阵亡'}`;
        cached.alive = alive; cached.self = self;
      }
      if (row.children[count.total] !== cached.node) row.insertBefore(cached.node, row.children[count.total] || null);
      count.total++;
      if (alive) count.alive++;
    }
    for (const [id, cached] of this.rosterDots) {
      if (!seen.has(id)) { cached.node.remove(); this.rosterDots.delete(id); }
    }
    for (const team of ['BL', 'GR']) {
      const count = counts[team];
      const label = `${TEAM_CN[team]}：存活 ${count.alive}/${count.total}`;
      if (this.rosterLabels[team] !== label) {
        rows[team].setAttribute('aria-label', label);
        rows[team].title = label;
        this.rosterLabels[team] = label;
      }
    }
  }
  updatePersonalStats(stats) {
    // stats 始终来自本人的整场累计数据，观战队友不会替换这里的数值。
    const kills = Number.isFinite(stats?.kills) ? Math.max(0, Math.floor(stats.kills)) : 0;
    const deaths = Number.isFinite(stats?.deaths) ? Math.max(0, Math.floor(stats.deaths)) : 0;
    const key = `${kills}/${deaths}`;
    if (this.personalStatsKey === key) return;
    this.el.statKills.textContent = kills;
    this.el.statDeaths.textContent = deaths;
    this.el.statKD.textContent = deaths === 0 ? '—' : (kills / deaths).toFixed(2);
    this.personalStatsKey = key;
  }
  updateBomb(bomb, s) {
    const e = this.el;
    e.hud.classList.toggle('bomb-mode', !!bomb);
    e.bombHud.classList.toggle('hidden', !bomb);
    e.bombAction.classList.toggle('hidden', !bomb || !s.alive || (!bomb.hint && !bomb.interaction));
    e.radarLabel.textContent = bomb ? '爆破测试场' : '运输船';
    if (!bomb) return;
    const attack = bomb.attackTeam === s.myTeam;
    e.bombPhase.textContent = BOMB_PHASE_CN[bomb.phase] || bomb.phase;
    e.bombRole.textContent = `${TEAM_CN[s.myTeam] || ''} · 本回合${attack ? '进攻' : '防守'}`;
    const objective = `C4 · ${BOMB_STATE_CN[bomb.bombState] || bomb.bombState || '等待发放'}${bomb.carrierName ? ` · ${bomb.carrierName}` : ''}${bomb.siteId ? ` · ${bomb.siteId} 点` : ''}`;
    e.bombObjective.textContent = objective;
    e.bombObjective.title = objective;
    e.bombHud.classList.toggle('planted', bomb.phase === 'planted');
    e.bombHint.textContent = bomb.hint || '';
    const interaction = bomb.interaction;
    e.bombProgressWrap.classList.toggle('hidden', !interaction);
    if (interaction) {
      const progress = Math.max(0, Math.min(1, Number(interaction.progress) || 0));
      const percent = Math.round(progress * 100);
      e.bombProgressLabel.textContent = `${interaction.kind === 'plant' ? '安包' : interaction.kind === 'defuse' ? '拆包' : '交互'}中 · ${percent}% · 松开 E 取消`;
      e.bombProgress.style.width = `${percent}%`;
      e.bombProgressWrap.setAttribute('aria-valuenow', percent);
    }
  }
  slots(inv, cur) {
    const e = this.el.slots;
    e.innerHTML = '';
    ['主武器', '副武器', '近身', '投掷'].forEach((lab, i) => {
      const w = inv[i];
      if (!w) return;
      const d = document.createElement('div');
      d.className = 's' + (i === cur ? ' on' : '');
      d.innerHTML = `<span>${w.def.name}</span><img src="${this.icons[w.id] || ''}"><b>${i + 1}</b>`;
      e.appendChild(d);
    });
    this.slotsT = 2.2;
  }
  killFeed(k, v, wid, hs, wb, mine) {
    const d = document.createElement('div');
    d.className = 'kf' + (mine ? ' me' : '');
    const icon = this.icons[wid] ? `<img src="${this.icons[wid]}">` : `<span>[${WEAPONS[wid]?.name || wid}]</span>`;
    d.innerHTML = (k ? `<span class="k ${k.team}">${esc(k.name)}</span>` : '') + icon + (wb ? `<img class="hs" src="${WB_ICON}">` : '') + (hs ? `<img class="hs" src="${HS_ICON}">` : '') + `<span class="v ${v.team}">${esc(v.name)}</span>`;
    this.el.feed.prepend(d);
    this.feedItems.push({ el: d, t: performance.now() });
    while (this.feedItems.length > 6) { const f = this.feedItems.shift(); f.el.remove(); }
  }
  hitmarker(hs, kill) {
    this.el.hit.className = kill ? 'kill' : hs ? 'hs' : '';
    this.hitT = kill ? 0.45 : 0.22;
  }
  damageFrom(ang) {
    const d = document.createElement('div'); d.className = 'dd';
    this.el.dmgDirs.appendChild(d);
    this.dmgDirs.push({ el: d, ang, t: 1.4 });
  }
  badge(text, sub, headshot) {
    const b = this.el.badge;
    b.classList.remove('show'); void b.offsetWidth;
    b.querySelector('.ico').innerHTML = BADGE_SVG(headshot ? '#c0301a' : '#b8860b', headshot ? CROSSHAIR_B : SKULL);
    b.querySelector('.txt').textContent = text;
    b.querySelector('.sub').textContent = sub || '';
    b.classList.add('show');
  }
  toast(text, dur = 2.5) { const t = this.el.toast; t.innerHTML = text; t.style.opacity = 1; this.toastT = dur; }
  scoreboard(show, actors, myId, score) {
    this.el.board.classList.toggle('hidden', !show);
    if (!show) return;
    this.el.boardTitle.textContent = this.g.mode === 'bomb' ? '爆破测试场 · 回合比分' : '运输船 · 团队竞技';
    const rows = (team) => actors.filter((a) => a.team === team).sort((a, b) => b.stats.k - a.stats.k || a.stats.d - b.stats.d)
      .map((a) => `<tr class="${a.id === myId ? 'me' : ''} ${a.alive ? '' : 'dead'}"><td>${esc(a.name)}</td><td>${a.stats.k}</td><td>${a.stats.d}</td><td>${a.stats.hs}</td><td>${a.ping}</td></tr>`).join('');
    const tbl = (team) => `<table class="t${team}"><tr><th class="team">${TEAM_CN[team]} · ${score[team]}</th><th>击杀</th><th>死亡</th><th>爆头</th><th>延迟</th></tr>${rows(team)}</table>`;
    this.el.boardBody.innerHTML = `<div class="cols">${tbl('BL')}${tbl('GR')}</div>`;
  }
  endScreen(win, score, actors, myId, bomb = null) {
    this.show('end');
    const r = this.el.endRes;
    r.textContent = win === null ? '平局' : win ? '胜利' : '失败';
    r.className = 'res ' + (win === null ? 'draw' : win ? 'win' : 'lose');
    this.el.endSc.textContent = `${bomb ? '回合比分 · ' : ''}潜伏者 ${score.BL} : ${score.GR} 保卫者${bomb && win === null ? ' · 无加时' : ''}`;
    const mvp = [...actors].sort((a, b) => (b.stats.k * 2 - b.stats.d + b.stats.hs) - (a.stats.k * 2 - a.stats.d + a.stats.hs))[0];
    this.el.endMvp.textContent = mvp ? `MVP：${mvp.name}（${mvp.stats.k} 杀 / ${mvp.stats.hs} 爆头）` : '';
    const me = actors.find((a) => a.id === myId);
    const acc = me && me.stats.shots ? ((me.stats.hits / me.stats.shots) * 100).toFixed(1) : '0';
    this.el.endMe.textContent = me ? `你的战绩：${me.stats.k} 击杀 · ${me.stats.d} 死亡 · ${me.stats.hs} 爆头 · 命中率 ${acc}%` : '';
    const rows = (team) => actors.filter((a) => a.team === team).sort((a, b) => b.stats.k - a.stats.k)
      .map((a) => `<tr class="${a.id === myId ? 'me' : ''}"><td>${esc(a.name)}</td><td>${a.stats.k}</td><td>${a.stats.d}</td><td>${a.stats.hs}</td></tr>`).join('');
    const tbl = (team) => `<table class="t${team}"><tr><th class="team">${TEAM_CN[team]}</th><th>击杀</th><th>死亡</th><th>爆头</th></tr>${rows(team)}</table>`;
    this.el.endTable.innerHTML = `<div class="cols">${tbl('BL')}${tbl('GR')}</div>`;
  }
  // ---------- 小地图 ----------
  buildRadar(world, map = null) {
    const S = 8; // px/m
    const bounds = map && map.radarBounds ? map.radarBounds : { minX: -37, maxX: 37, minZ: -13, maxZ: 13 };
    this.radarBounds = bounds;
    this.radarSites = map && Array.isArray(map.sites) ? map.sites : [];
    const W = Math.ceil((bounds.maxX - bounds.minX) * S), H = Math.ceil((bounds.maxZ - bounds.minZ) * S);
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const x = c.getContext('2d');
    x.fillStyle = 'rgba(70,80,84,0.95)'; x.fillRect(0, 0, W, H);
    const cols = [...world.colliders].filter((k) => k.solid && k.top > 0.3 && k.bottom < 2 && ((map && map.radarBounds) || k.hx < 30) && k.tag !== 'deck').sort((a, b) => a.top - b.top);
    for (const k of cols) {
      if (k.bullet === 'pass' && k.mat !== 'mesh') continue;
      x.save();
      x.translate((k.x - bounds.minX) * S, (k.z - bounds.minZ) * S);
      x.rotate(-k.yaw);
      const hgt = k.top;
      x.fillStyle = k.mat === 'mesh' ? 'rgba(200,200,190,.5)' : hgt > 4 ? '#1d2327' : hgt > 2 ? '#2d353a' : hgt > 1.3 ? '#3b454b' : '#56616a';
      x.fillRect(-k.hx * S, -k.hz * S, k.hx * 2 * S, k.hz * 2 * S);
      x.strokeStyle = 'rgba(0,0,0,.5)'; x.lineWidth = 1;
      x.strokeRect(-k.hx * S, -k.hz * S, k.hx * 2 * S, k.hz * 2 * S);
      x.restore();
    }
    this.radarImg = c; this.radarS = S;
    // 运输船管道顶棚的虚线只属于团队地图。
    if (this.g.mode !== 'bomb' && !this.radarSites.length) {
      x.strokeStyle = 'rgba(245,179,33,.35)'; x.setLineDash([6, 4]);
      x.strokeRect((-29.5 - bounds.minX) * S, (9.4 - bounds.minZ) * S, 36.6 * S, 2.44 * S);
      x.strokeRect((29.5 - 36.6 - bounds.minX) * S, (-11.84 - bounds.minZ) * S, 36.6 * S, 2.44 * S);
      x.setLineDash([]);
    }
    this.drawRadarSites(x, this.radarSites);
  }
  drawRadarSites(ctx, sites) {
    const S = this.radarS, bounds = this.radarBounds;
    for (const site of sites || []) {
      if (!Number.isFinite(site.x) || !Number.isFinite(site.z)) continue;
      const x = (site.x - bounds.minX) * S, z = (site.z - bounds.minZ) * S;
      ctx.save();
      ctx.fillStyle = 'rgba(245,179,33,.16)'; ctx.strokeStyle = '#f5b321'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, z, (site.radius || 3) * S, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ffe19a'; ctx.font = 'bold 21px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(site.id || site.label || '', x, z);
      ctx.restore();
    }
  }
  drawRadar(me, actors, t, options = {}) {
    const ctx = this.radarCtx, cv = this.el.radar;
    const W = cv.width = cv.clientWidth * 1.5 | 0, H = cv.height = cv.clientHeight * 1.5 | 0;
    ctx.clearRect(0, 0, W, H);
    if (!this.radarImg || !me || !me.pos) return;
    const S = this.radarS, zoom = 0.55 * (W / 294);
    const bounds = this.radarBounds;
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.rotate(me.yaw);
    ctx.scale(zoom, zoom);
    ctx.translate(-(me.pos.x - bounds.minX) * S, -(me.pos.z - bounds.minZ) * S);
    ctx.globalAlpha = 0.95;
    ctx.drawImage(this.radarImg, 0, 0);
    ctx.globalAlpha = 1;
    if (options.sites && options.sites !== this.radarSites) this.drawRadarSites(ctx, options.sites);
    const c4 = options.c4;
    // 携带中的 C4 不额外暴露携包者坐标；只标记公共任务位置。
    if (c4 && c4.pos && (c4.state === 'dropped' || c4.state === 'planted') && Number.isFinite(c4.pos.x) && Number.isFinite(c4.pos.z)) {
      const px = (c4.pos.x - bounds.minX) * S, pz = (c4.pos.z - bounds.minZ) * S;
      ctx.fillStyle = c4.state === 'planted' ? '#ff6650' : '#ffd24a';
      ctx.strokeStyle = '#111'; ctx.lineWidth = 2;
      ctx.fillRect(px - 8, pz - 8, 16, 16); ctx.strokeRect(px - 8, pz - 8, 16, 16);
    }
    for (const a of actors) {
      if (a === me) continue;
      if (options.hideEnemies && a.team !== me.team) continue;
      const seen = a.team === me.team || (a.radarT > 0);
      if (!seen) continue;
      const px = (a.pos.x - bounds.minX) * S, pz = (a.pos.z - bounds.minZ) * S;
      if (!a.alive) {
        if (a.team !== me.team || a.deadT > 5) continue;
        ctx.strokeStyle = '#9aa'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(px - 8, pz - 8); ctx.lineTo(px + 8, pz + 8); ctx.moveTo(px + 8, pz - 8); ctx.lineTo(px - 8, pz + 8); ctx.stroke();
        continue;
      }
      ctx.fillStyle = a.team === me.team ? '#4fb0ff' : '#ff4a3a';
      if (a.team === me.team) {
        ctx.save(); ctx.translate(px, pz); ctx.rotate(-a.yaw);
        ctx.beginPath(); ctx.moveTo(0, -12); ctx.lineTo(8, 9); ctx.lineTo(0, 4); ctx.lineTo(-8, 9); ctx.closePath(); ctx.fill();
        ctx.restore();
      } else {
        ctx.globalAlpha = Math.min(1, a.radarT);
        ctx.beginPath(); ctx.arc(px, pz, 9, 0, 7); ctx.fill();
        ctx.globalAlpha = 1;
      }
    }
    ctx.restore();
    // 自己
    ctx.fillStyle = '#ffd24a';
    ctx.beginPath(); ctx.moveTo(W / 2, H / 2 - 10); ctx.lineTo(W / 2 + 7, H / 2 + 8); ctx.lineTo(W / 2, H / 2 + 4); ctx.lineTo(W / 2 - 7, H / 2 + 8); ctx.closePath(); ctx.fill();
    // 视野扇形
    const g = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W * 0.45);
    g.addColorStop(0, 'rgba(255,255,255,.18)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(W / 2, H / 2); ctx.arc(W / 2, H / 2, W * 0.45, -Math.PI / 2 - 0.6, -Math.PI / 2 + 0.6); ctx.closePath(); ctx.fill();
  }
}

function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

const TEMPLATE = `
<div id="hud" class="hidden">
  <div id="matchHeader">
    <div id="score">
      <div class="team bl" id="tBL"><div class="teamScore"><span class="nm">潜伏者</span><span class="pts" id="sBL">0</span></div><div class="teamAlive" id="aliveBL" role="img" aria-label="潜伏者存活人数"></div></div>
      <div class="mid"><div class="time" id="sTime">10:00</div><div class="goal" id="sGoal"></div></div>
      <div class="team gr" id="tGR"><div class="teamScore"><span class="pts" id="sGR">0</span><span class="nm">保卫者</span></div><div class="teamAlive" id="aliveGR" role="img" aria-label="保卫者存活人数"></div></div>
    </div>
    <div id="bombHud" class="hidden"><div class="bombHead"><b id="bombPhase"></b><span id="bombRole"></span></div><div id="bombObjective"></div></div>
  </div>
  <div id="bombAction" class="hidden"><div id="bombHint"></div><div id="bombProgressWrap" class="hidden" role="progressbar" aria-label="C4 交互进度" aria-valuemin="0" aria-valuemax="100"><div id="bombProgressLabel"></div><div class="bombTrack"><i id="bombProgress"></i></div></div></div>
  <div id="radarWrap"><canvas id="radar"></canvas><div class="lbl" id="radarLabel">运输船</div></div>
  <div id="clinks"><a href="https://github.com/riba2534/claude-opus-5-5-demo" target="_blank" rel="noopener noreferrer" title="GitHub 源码" aria-label="GitHub 源码"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/></svg></a><a href="https://x.com/riba2534" target="_blank" rel="noopener noreferrer" title="X @riba2534" aria-label="X @riba2534"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z"/></svg></a></div>
  <div id="feed"></div>
  <div id="vitals">
    <div id="personalStats" role="group" aria-label="整场个人战绩"><span><small>K</small><b id="statKills">0</b></span><span><small>D</small><b id="statDeaths">0</b></span><span><small>KD</small><b id="statKD">—</b></span></div>
    <div class="vbox" id="hpBox"><div class="ic">✚</div><div class="val" id="hpVal">100</div></div>
    <div class="vbox" id="arBox"><div class="ic">⛨</div><div class="val" id="arVal">100</div></div>
  </div>
  <div id="slots"></div>
  <div id="ammo"><div class="wname" id="wName"></div><div class="row"><img class="wicon" id="wIcon" alt=""><span class="mag" id="aMag">30</span><span class="res" id="aRes">/ 90</span></div><div class="hint" id="aHint"></div></div>
  <div id="cross"><i class="t" id="cT"></i><i class="b" id="cB"></i><i class="l" id="cL"></i><i class="r" id="cR"></i><i class="d" id="cDot"></i></div>
  <div id="hit"><i></i><i></i><i></i><i></i></div>
  <div id="dmgDirs"></div>
  <div id="scope"><div class="ring"></div><div class="h"></div><div class="v"></div><div class="h2 l"></div><div class="h2 r"></div><div class="v2"></div><div class="dot"></div></div>
  <div id="badge"><div class="ico"></div><div class="txt"></div><div class="sub"></div></div>
  <div id="center" class="hidden"><div class="big" id="cBig"></div><div class="small" id="cSmall"></div></div>
  <div id="toast"></div>
  <div id="protect"></div>
  <div id="nameTip"></div>
  <div id="board" class="hidden tbl"><h3><span id="boardTitle">运输船 · 团队竞技</span><span>Tab</span></h3><div id="boardBody"></div></div>
  <div id="touch" class="hidden"></div>
</div>

<div id="loading" class="screen"><div class="t" id="loadingTitle">运 输 船</div><div class="s" id="loadTxt">LOADING</div><div class="bar"><i id="loadBar"></i></div><div class="tip" id="loadingTip">小提示：蹲下再跳（蹲跳）可以跳得更高，踩着木箱就能爬上对面集装箱的二楼。</div></div>

<div id="menu" class="screen hidden">
  <div class="menuBox">
    <div class="title">
      <div class="logo" id="setupLogo">CROSSFIRE · 团队竞技</div>
      <h1 id="setupTitle">运输船设置</h1>
      <div class="en" id="setupEn">TRANSPORT SHIP</div>
      <p id="setupDesc">联合国维和行动在监视非法军火出口时，发现一艘从俄罗斯驶往尼日利亚的可疑货轮。保卫者（Global Risk）奉命登船突击检查，却遭到潜伏者（Black List）伏击。<br>船头船尾两个船舱出生，中路 V 形斜放集装箱、两侧 L 形箱堆，左右各有一条只能从己方出生点进入的集装箱管道，管道顶上就是可以架枪的二楼。</p>
      <div class="keys">
        <kbd>W A S D</kbd><span>移动　<kbd>Shift</kbd> 静步　<kbd>空格</kbd> 跳　<kbd>C</kbd> 蹲</span>
        <kbd>鼠标左键</kbd><span>开火　<kbd>右键</kbd> 狙击开镜 / 刀重击</span>
        <kbd>1 2 3 4</kbd><span>主武器 / 副武器 / 刀 / 投掷物　<kbd>Q</kbd> 快切　<kbd>滚轮</kbd> 切换</span>
        <kbd>R</kbd><span>换弹　<kbd>F</kbd> 检视武器　<kbd>B</kbd> <span id="setupBagHelp">选择背包（下次复活生效）</span></span>
        <kbd data-bomb-key class="hidden">5 / E</kbd><span data-bomb-key class="hidden">5 选择 C4；按住 E 安包 / 拆包，松开取消；单按 E 拾取掉落 C4</span>
        <kbd>Tab</kbd><span>计分板　<kbd>Esc</kbd> 暂停 / 设置</span>
      </div>
      <div class="note hidden" id="touchNote">检测到触屏设备：已启用虚拟摇杆（左侧移动、右侧滑动视角）。电脑 + 鼠标体验最佳。</div>
    </div>
    <div class="opts">
      <div class="opt"><div class="lab">阵营</div><div class="seg team" data-k="team"><button data-v="BL">潜伏者<small>Black List</small></button><button data-v="GR">保卫者<small>Global Risk</small></button></div></div>
      <div class="row2" id="teamRules">
        <div class="opt"><div class="lab">对战规模</div><div class="seg" data-k="size"><button data-v="4">4v4</button><button data-v="6">6v6</button><button data-v="8">8v8</button></div></div>
        <div class="opt"><div class="lab">目标击杀</div><div class="seg" data-k="goal"><button data-v="30">30</button><button data-v="50">50</button><button data-v="100">100</button></div></div>
      </div>
      <div id="bombRules" class="hidden"><b>5v5 · 最多 8 回合 · 先 5 胜</b><p>4:4 平局，无加时；第 4 回合结束后交换攻守。没有经济，使用自己的四槽背包，C4 独立携带。</p><p>准备 8 秒 · 进行 90 秒 · 安包后 40 秒<br>安包 3 秒 · 拆包 5 秒 · 回合结算 4 秒</p><p>阵亡后等待下一回合，可观战存活队友；本回合不会复活。Esc 暂停会同时停止机器人与全部计时。</p></div>
      <div class="opt"><div class="lab">电脑难度</div><div class="seg" data-k="diff"><button data-v="easy">简单</button><button data-v="normal">普通</button><button data-v="hard">困难</button><button data-v="hell">地狱</button></div></div>
      <div class="row2">
        <div class="opt"><div class="lab">时间</div><div class="seg" data-k="tod"><button data-v="day">白天</button><button data-v="dusk">黄昏</button></div></div>
        <div class="opt"><div class="lab">画质</div><div class="seg" data-k="quality"><button data-v="low">流畅</button><button data-v="medium">均衡</button><button data-v="high">极致</button></div></div>
      </div>
      <div class="row3">
        <div class="opt"><div class="lab">灵敏度</div><div class="slider" data-k="sens"><input type="range" min="0.2" max="3" step="0.05"><span></span></div></div>
        <div class="opt"><div class="lab">视野 FOV</div><div class="slider" data-k="fov"><input type="range" min="65" max="100" step="1"><span></span></div></div>
        <div class="opt"><div class="lab">音量</div><div class="slider" data-k="vol"><input type="range" min="0" max="1" step="0.05"><span></span></div></div>
      </div>
      <button class="go" id="btnStart">下一步：选择背包</button>
      <button class="go sec" id="btnMenuBack" style="margin-top:10px">返回主页</button>
      <div class="note">装备与配装在主页的个人界面 → 背包中调整。点击进入对局后鼠标将被锁定，按 Esc 暂停。画质切换会重新加载页面。</div>
      <div class="mlinks"><a href="https://github.com/riba2534/claude-opus-5-5-demo" target="_blank" rel="noopener noreferrer">GitHub 源码</a><span>·</span><a href="https://x.com/riba2534" target="_blank" rel="noopener noreferrer">X @riba2534</a></div>
    </div>
  </div>
</div>

<div id="pause" class="screen hidden"><div class="pauseBox"><h2>暂停</h2>
  <div class="opt"><div class="lab">鼠标灵敏度</div><div class="slider" data-k="sens"><input type="range" min="0.2" max="3" step="0.05"><span></span></div></div>
  <div class="opt"><div class="lab">视野 FOV</div><div class="slider" data-k="fov"><input type="range" min="65" max="100" step="1"><span></span></div></div>
  <div class="opt"><div class="lab">音量</div><div class="slider" data-k="vol"><input type="range" min="0" max="1" step="0.05"><span></span></div></div>
  <div class="opt"><div class="lab">时间</div><div class="seg" data-k="tod"><button data-v="day">白天</button><button data-v="dusk">黄昏</button></div></div>
  <button class="go" id="btnResume">继 续</button><button class="go sec" id="btnQuit" style="margin-top:10px">退出到主页</button>
</div></div>

<div id="end" class="screen hidden"><div class="endBox">
  <div class="res" id="endRes">胜利</div><div class="sc" id="endSc"></div><div class="mvp" id="endMvp"></div><div class="mvp" id="endMe" style="color:#dfe4e8"></div>
  <div id="endTable" class="tbl"></div>
  <div style="display:flex;gap:10px;margin-top:16px"><button class="go" id="btnAgain">再 来 一 局</button><button class="go sec" id="btnMenu">主菜单</button></div>
</div></div>
`;
