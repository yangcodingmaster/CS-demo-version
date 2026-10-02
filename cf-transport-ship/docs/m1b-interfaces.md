# M1B 接口与文件归属

M1B（枪械精修 + USP / Glock-18）的共享契约，先于编码确定。验收标准见 [game-design.md](game-design.md) 的 M1B 段与「枪械美术与新增副武器」。基线为 M1 分支 `feat/m1b-weapons` 起点 `834b26f`。手机端自 2026-10-02 起不作为开发与验收项。

后续精修补充（2026-10-02）：Yang 已授权进一步精修现有武器与动作，因此下文“旧动作保持不变”只描述 M1B 原阶段。本轮允许调整持枪构图、手套、检视和换弹轨迹，实际射击数值、视觉后坐幅度及动作总时长保持。当前实现与证据以 `game-design.md` 最新交付段为准。

- `mag` 可提供子锚点 `reloadGrip`，表示换弹时手掌应贴合的位置；缺失时 ViewModel 使用旧偏移回退。
- AWM 的 `bolt` 提供 `boltGrip` 与 `boltHandle`，手跟随当前帧的锚点变换，不能再依赖 `children[1]`。
- `buildGun()` 在同一静态层按材质合并无名网格，保留具名 Mesh、锚点及动作 Group。修改模型时不得将 `mag/slide/bolt/pin/lever` 合进根层。
- 逐件彩色预览与第一人称动作分别用 `tools/capture-weapon-studio.mjs` 和 `tools/verify-weapon-poses.mjs` 验证。前后面数计算见 `tools/summarize-weapon-polish.mjs`。

## 文件归属（并行前先定，避免互改）

| 文件 | 归属 | 说明 |
| --- | --- | --- |
| `src/guns.js` | 模型 Agent（唯一写者） | 两把新枪的 builder + 现有 7 件武器的精修 |
| `src/character.js` | 模型 Agent | 第三人称手枪持握改为类别判断 |
| `src/viewmodel.js` | 动作 Agent（唯一写者） | 第一人称位置、后坐、枪焰、套筒与空仓换弹 |
| `src/audio.js` | 动作 Agent | 两把新枪的合成音色与切枪手感音 |
| `src/weapons.js` | 集成 Agent | 最后一步写入两把新枪的数据，避免注册了没模型的武器 |
| `src/style.css`、`src/screens.js` | 不动 | M1 已交付，装备列表自动跟随 `weaponsForSlot()` |
| `tools/`、`docs/`、验收与交付记录 | 集成 Agent | 前后对比、性能记录、design-data.json 与计算脚本同步 |

**集成顺序（硬约束）**：先完成 `guns.js` / `viewmodel.js` / `character.js` / `audio.js`（此时 `WEAPONS` 尚未包含新 id，游戏仍可构建运行）；集成 Agent 再把 `usp`、`glock18` 写进 `WEAPONS`，然后构建与验收。`makeIcons()` 会遍历 `WEAPONS` 调 `buildGunMerged()`，注册了没有 builder 的武器会直接让游戏起不来。

## 新枪数据（集成 Agent 写入 `weapons.js`）

两把都是副武器、半自动（`auto: false`），`slot: 1`、`type: 'pistol'`，`sound` 与 `hudName` 见下表。参数是本项目设计值，集中列出，试玩后可调；**不得修改现有武器数值**（AK-47 伤害 36 等保持不变）。

| 项 | `usp` US | `glock18` Glock-18 |
| --- | --- | --- |
| 定位 | 平稳易控、精度好 | 容量与近距离节奏 |
| dmg / headMul / limbMul | 34 / 3.6 / 0.8 | 26 / 3.4 / 0.82 |
| rpm / mag / reserve | 300 / 12 / 48 | 420 / 17 / 51 |
| reload / draw | 2.0 / 0.5 | 2.05 / 0.48 |
| speed / range / falloff | 1.02 / 130 / 0.975 | 1.05 / 110 / 0.972 |
| pen / armorPen | 0.7 / 0.62 | 0.55 / 0.5 |
| spread | base 0.0032, move 0.045, air 0.17, crouch 0.65, perShot 0.011, max 0.05, recover 6.5 | base 0.0042, move 0.03, air 0.15, crouch 0.7, perShot 0.0075, max 0.055, recover 8 |
| recoil | up 0.017, upMax 0.055, side 0.005, sideStart 2, recover 6 | up 0.0095, upMax 0.045, side 0.0042, sideStart 3, recover 8.5 |

## 模型契约（`src/guns.js`）

沿用现有约定：`builders[id](m)` 返回 `THREE.Group`，`m = gunMaterials()`，只用现有材质键（`metal`、`black`、`steel`、`wood`、`bakelite`、`olive`、`tan`、`rubber`、`brass`、`glass`、`blade`、`red`），用 `part(parent, geo, mat, x, y, z, rx, ry, rz, name)` 加零件。局部坐标：枪口朝 -Z、上 +Y、右 +X，原点在握把上方。

命名与锚点要求（与 `viewmodel.js` 的 `partRest`、`character.js` 的 `anchors` 对齐）：

- 必须有名为 `slide` 的子 `Group`（套筒主体、准星、后照门、防滑纹都挂在它下面），供滑套后坐与空仓挂机动画使用。
- 必须有名为 `mag` 的子 `Group`，位置为弹匣静止位置，供换弹动画使用。
- 必须提供锚点：`grip`、`fore`、`muzzle`、`eject`、`magwell`（`anchor(g, name, x, y, z)`）。
- 造型量级对齐 `deagle`：整枪长度约 0.20–0.24 m，`muzzle` 在 z ≈ -0.19 ~ -0.21，枪口高度 y ≈ 0.05–0.07。
- **USP**：细长套筒、独立扳机护圈、无消音器；套筒用 `metal`，下机匣用 `black`，握把用 `rubber` 并加防滑纹；轮廓比 deagle 窄、比 Glock 长。
- **Glock-18**：短方套筒、深色聚合物握把；套筒更短更方、机匣更厚，与 USP、deagle 一眼可分；默认无消音器、无连发模式。
- **现有 7 件精修**（AK-47 / M4A1 / AWM / MP5 / 沙漠之鹰 / 军刀 / 高爆手雷）：按规格处理枪口、准星、护木、握把、弹匣底板与衔接处的比例和少量倒角，改善"方块拼装感"；材质分层遵守"涂层哑光、裸钢少量高光、木质暖棕、聚合物粗糙"，整枪不能全黑一块或全银发亮。
- **不得改动**：锚点名称、锚点语义位置（允许 < 2 cm 微调）、`slide`/`mag` 组名；现有武器的几何三角面数每件不超过基线的 1.3 倍。

## 动作契约（`src/viewmodel.js`）

- `HIP` 与 `KICK` 新增两条，量级同 `deagle`（`usp` 后坐略小、`glock18` 更小更快）。
- `fire()` 中 `if (this.id === 'deagle' && this.parts.slide) this.slideT = 0.09;` 改为按**能力**判断（有 `slide` 部件的手枪都触发），不许继续按 id 硬编码。
- `fire()` 的枪口火焰缩放改为集中的类别表：手枪 1.2 / deagle 保持 1.2，`usp`、`glock18` 用 1.0 与 0.95，其余类别维持现状（`awm` 1.6、`mp5` 0.8、其它 1）。
- 换弹分支中 `if (id === 'deagle' && P.slide && a.empty ...)` 改为 `a.empty && P.slide`：空仓换弹末尾有套筒释放动作，幅度按类别（手枪 0.03）。
- 普通换弹、空仓换弹、检视、切枪中断、拔枪、抛壳、左手/右手 IK 对两把新枪都要成立，手不能明显悬空或穿枪。
- **现有武器表现不得回归**：AK/M4/AWM/MP5/刀/雷的动作与节奏保持不变。

## 第三人称契约（`src/character.js`）

- `const sniper = ..., pistol = this.gunType === 'deagle', ...` 改为按武器类别判断（`WEAPONS[this.gunType]?.type === 'pistol'` 或等价集合），使 `usp`、`glock18` 使用手枪持握（`gx 0.03 / gy 0.14 / gz -0.42`），不要把新枪套用步枪姿势。
- 步枪、狙击、刀、手雷的现有持握与手臂 IK 保持不变。

## 音效契约（`src/audio.js`）

- `GUNS` 表新增 `usp`、`glock18` 两套参数，字段与现有条目一致（`gain/drive/wet/crack/body/mid/punch/tail/mech/echo`，可选 `sub`）。USP 偏清脆明亮、Glock-18 更干更尖，两者都比 deagle 轻，且彼此可区分。
- `WEIGHT` 新增两条（操作手感音高）。
- `playWeaponSwitch(weaponId)` 新增两个 case，做出套筒/扳机护圈的金属手感；**不能落到 default 的步枪音**。
- 不修改现有武器的音色参数。

## 集成 Agent 的验收点

1. `npm run build` 通过，`npm test` 与 `node tools/verify-game.mjs` 保持全绿（M1 功能不回归）。
2. 武器库副武器从 1 件变 3 件，两把新枪可装备、保存、刷新后恢复；未交付装备仍不出现（现只剩闪光弹与烟雾弹）。
3. 局内：开局与复活带新枪；开火、空仓换弹、检视、切枪、换包不刷弹；第三人称能看到手枪持握而不是步枪姿势。
4. 现有武器数值不变（AK-47 dmg 36 等断言保持）。
5. 性能前后对照：同视口与画质下记录 FPS、`renderer.info.render.calls` / `triangles`、geometry 与 texture 数量，反复换枪与开局不持续增长。
6. 视觉对照截图：两把新枪的侧面预览与第一人称、现有武器精修前后各一张。
