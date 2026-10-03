# M1 接口与文件归属

本文件是 M1（主页、背包、运输船）并行开发的共享契约，先于编码确定。验收标准见 [game-design.md](game-design.md) 的 M1 段。基线与现状以提交 `8a263e6` 为准。

## 文件归属

| 文件 | 归属 | 说明 |
| --- | --- | --- |
| `src/profile.js`（新增） | 存储 Agent | 档案存储、校验、迁移、装备读写；不依赖 DOM 与 Three.js |
| `tests/profile.test.mjs`（新增） | 存储 Agent | Node 运行的针对性检查，无第三方依赖 |
| `src/screens.js`（新增） | 界面 Agent | 主页、个人界面、背包、武器库、初始背包选择 |
| `src/style.css` | 界面 Agent（唯一写者） | 新界面样式；同时修既有手机竖屏溢出 |
| `src/game.js` | 集成 Agent（唯一写者） | 流程、对局生命周期、输入屏蔽 |
| `src/hud.js` | 集成 Agent | 既有菜单模板与显示逻辑 |
| `src/actor.js`、`src/player.js`、`src/touch.js` | 集成 Agent | 配装装配、输入、触屏 |
| `package.json` | 集成 Agent | 增加 `test` 脚本 |
| 设计文档交付记录 | 集成 Agent | 阶段完成后更新 |

约定：界面 Agent 不改 `game.js`、`hud.js`、`actor.js`、`player.js`、`weapons.js`；集成 Agent 不改 `screens.js`、`profile.js`、`style.css`。跨文件需求通过本契约的接口提出。

## 共享数据

槽位顺序固定为 `['primary', 'secondary', 'melee', 'throwable']`，与 `WEAPONS[id].slot`（0/1/2/3）一致。

`cf_player_profile`（`localStorage`）结构：

```json
{
  "schemaVersion": 1,
  "nickname": "我",
  "selectedBackpackId": "bag-1",
  "backpacks": [
    { "id": "bag-1", "name": "背包1", "primary": "ak47", "secondary": "deagle", "melee": "knife", "throwable": "he" },
    { "id": "bag-2", "name": "背包2", "primary": "m4a1", "secondary": "deagle", "melee": "knife", "throwable": "he" },
    { "id": "bag-3", "name": "背包3", "primary": "awm", "secondary": "deagle", "melee": "knife", "throwable": "he" }
  ]
}
```

- 默认主武器取 `docs/design-data.json` 的 `defaultPrimaryIds`（`ak47`、`m4a1`、`awm`），其余槽取 `deagle`、`knife`、`he`。
- 只有 `WEAPONS` 中已存在的 ID 可装备。`usp`、`glock18`、`flash`、`smoke` 属于 M1B/M3，不出现在可装备列表，也不能写进档案。
- 长期档案只存配装与昵称；弹药、后坐、换弹、投掷倒计时仍由 `WeaponState` 持有，不落盘。
- 旧 `cf_ship_opts.primary` 有效时迁移到 `bag-1.primary`；`cf_ship_opts` 的其它字段（画质、音量、灵敏度、FOV、时间、阵营、规模、目标、难度）继续由 `HUD.opts` 读写，不迁移。

## `src/profile.js` 接口

```js
export const PROFILE_KEY = 'cf_player_profile';   // 档案键
export const LEGACY_KEY = 'cf_ship_opts';         // 旧设置键
export const SCHEMA_VERSION = 1;
export const SLOTS = ['primary', 'secondary', 'melee', 'throwable'];
export const DEFAULT_NICKNAME = '我';

// 纯函数
export function defaultProfile();                       // 返回默认档案（新对象）
export function slotOfWeapon(weaponId);                 // -> 'primary'|'secondary'|'melee'|'throwable'|null
export function weaponsForSlot(slot);                   // -> 已存在且可装备的 ID 数组，顺序稳定
export function isEquippable(weaponId, slot);           // -> boolean
export function readLegacyPrimary(storage);             // -> 旧 cf_ship_opts.primary 或 null
export function normalizeProfile(raw, legacyPrimary);   // 纯校验：-> { profile, changed, notes[] }

export class Profile {
  constructor(storage);      // storage 可注入：{ getItem(k), setItem(k,v) }；默认 localStorage
  data;                      // 校验后的档案对象
  available;                 // storage 是否可写；false 时本次会话仍可用，只是不能保存
  load();                    // 读键 -> normalizeProfile -> 必要时写回并记录迁移
  save();                    // -> boolean
  setNickname(name);         // -> boolean
  selectBackpack(bagId);     // -> boolean
  getBackpack(bagId);        // -> bag | null
  get selectedBackpack();    // -> bag
  equip(bagId, slot, weaponId);   // -> { ok, error? }；类别不符或 ID 不存在时 ok:false 且不写入
  getLoadout(bagId);         // -> { primary, secondary, melee, throwable }，全部为合法 ID
  get notes();               // 迁移与回退记录，供交付记录引用
}
```

回退要求：JSON 损坏、版本不符、背包数量或 ID 异常、装备 ID 未知、槽位类别不符时，逐项回退到默认值并保留其余可用数据；不得抛出异常、不得整体清空、不得让调用方拿到 `undefined` 装备 ID。存储不可用（隐私模式、抛异常）时不阻断开局，`save()` 返回 `false`。

## `src/screens.js` 接口

```js
export class Screens {
  constructor(game);          // 读取 game.profile / game.opts / game.hud；只调用下列 game 方法
  show(name);                 // 'home'|'personal'|'backpack'|'armory'|'bagSelect'|null
  get visible();              // 当前屏名或 null
  setIcons(icons);            // { weaponId: dataURL }，用于卡片缩略图
  refresh();                  // 依 game.profile 重绘昵称、三背包槽位、武器库与选中态
  openBackpack({ context });  // context: 'manage' | 'select' | 'match'
  openArmory({ bagId, slot });// 进入武器库；点选装备后自动 equip 并返回背包
  closeAll();                 // 隐藏所有屏
}
```

只允许调用这些 `game` 方法（由集成 Agent 实现，签名固定）：

```js
game.startTeamMatch();          // 按 profile 选中的背包开始运输船对局
game.showHome();                // 回主页
game.showPersonal();            // 个人界面
game.showTeamSetup();           // 运输船设置（复用既有 #menu）
game.showBagSelect();           // 开始前的初始背包选择
game.showSettings();            // 设置（复用既有 #menu）
game.requestBagChange(bagId);   // 局内 B 面板：登记下次复活生效的背包
game.closeBagPanel();           // 局内 B 面板关闭
game.audio;                     // 既有音效对象，可调用 playUI('click')
```

`context` 语义：

- `manage`：个人界面进入，点槽位 → 武器库 → 点装备立即保存，提示「已装备到背包N」；返回保留选择上下文。
- `select`：团队模式开始前的初始背包选择，点卡片设为主页默认背包（`profile.selectBackpack`），底部「进入对局」调用 `game.startTeamMatch()`。
- `match`：局内 B 面板，点卡片调用 `game.requestBagChange(bagId)`；显示当前与待生效标记；关闭调用 `game.closeBagPanel()`。

界面要求：深色底、装备卡片、克制黄色强调（沿用 `style.css` 现有色板与字体）；中文正文不用斜体；按钮点击区域不小于 40px；`360px` 宽竖屏不得出现横向溢出（`document.documentElement.scrollWidth <= window.innerWidth`），触屏可滚动区域不得被 `#ui` 的 `pointer-events` 规则吃掉。武器库只列 `weaponsForSlot(slot)` 返回的装备，并可用 `docs/design-data.json` 的中文名与用途描述；未交付装备不得出现为可点卡片。

## 集成 Agent 的改动点

- `Actor.giveLoadout(loadout)`：接受 `{primary, secondary, melee, throwable}`，兼容旧的字符串参数。
- `Player`：`activeBagId`、`pendingBagId`、`activeLoadout`、`nextLoadout` 四个字段分开保存，不用一个变量混合表示。
- 出生与复活只在此处生成弹药与投掷物；开背包、选同一背包、切武器都不刷新补给。
- B 面板打开时阻断移动、开火、切枪与视角输入，关闭后不残留按键或鼠标状态；原先「出生点内立即更换主武器」的入口取消，统一为下次复活生效。
- `hud.show(name, { hideHud })`：新增 `hideHud` 选项，用于主页、个人界面、背包等非对局屏隐藏对局 HUD。

## 实现说明（M1 交付后补充）

- 待生效背包字段名固定为 `pendingBagId`；`Player` 另有 `activeBagId`（当前生效）、`loadout`（当前配装）、`nextLoadout`（下次出生待生效）。
- `game.startBagId` 是一次性覆盖位：初始背包选择屏直接写 `profile.selectedBackpackId`，此字段当前无人写入，开局背包由档案的 `selectedBackpackId` 决定。
- 对局内 `hud.show(null)` 显示对局 HUD；主页等非对局屏必须传 `{ hideHud: true }`。
- 槽位在背包卡片内整行排布（桌面与竖屏一致），装备名一行显示、过长才省略号，避免窄卡把中文逐字折行。
- 验收脚本：`npm test`（档案）与 `node tools/verify-game.mjs`（浏览器，需要 8000 端口静态预览）。
