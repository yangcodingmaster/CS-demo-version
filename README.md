# CS-demo-version

基于 [riba2534/claude-opus-5-5-demo](https://github.com/riba2534/claude-opus-5-5-demo) 的个人 fork，保留《穿越火线》运输船网页游戏，用于后续修改与开发。

本仓库只维护 `cf-transport-ship/`。原仓库中的鹈鹕骑行与 QQ 飞车工程已移除，后续游戏改动都在 CF 目录内进行。

## 本地运行

需要 Node.js、npm；以下静态预览命令还需要 Python 3。

```bash
cd cf-transport-ship
npm ci
npm run build
python3 -m http.server 8000 --bind 127.0.0.1 --directory dist
```

打开 <http://127.0.0.1:8000/>。源码修改后重新运行 `npm run build`，再刷新浏览器。

构建会把 JavaScript、Three.js 和 CSS 内联到 `cf-transport-ship/dist/index.html`，游戏运行不依赖另外两个工程。也可以直接用浏览器打开该 HTML 文件。

## 游戏操作

| 操作 | 按键 |
| --- | --- |
| 移动 / 静步 | WASD / Shift |
| 跳跃 / 蹲下 | 空格 / C |
| 开火 / 狙击开镜或刀重击 | 鼠标左键 / 右键 |
| 主武器、副武器、刀、投掷物 | 1、2、3、4 |
| 切换武器 | Q / 鼠标滚轮 |
| 换弹 / 检视武器 / 选择背包 | R / F / B |
| 爆破：选择 C4 / 安放、拆除、拾取 | 5 / E（安拆按住，拾取单按） |
| 爆破：阵亡后切换队友观战 | Q |
| 计分板 / 暂停 | Tab / Esc |

触屏设备支持虚拟摇杆与操作按钮，电脑与鼠标体验更完整。

主页提供团队竞技、爆破模式、个人界面与设置入口。团队竞技使用运输船，爆破默认进入“沙城”，采用沙漠灰风格的原创单层布局，包含 A/B 包点、长短进攻路线与回防通路。爆破采用 5v5、最多 8 回合、先 5 胜、第 4 回合后换边、4:4 平局，不含买枪经济或回合内复活。

现有九款装备保持程序化简化 3D 风格，已精修枪身、材质、持握与换弹动作。地图俯视图见 [沙城布局](cf-transport-ship/docs/desert-layout.svg)，由实际碰撞与导航数据生成。通用测试场保留供回归验证，可用 `?bombMap=bomb-test` 进入。

个人界面可以改昵称、管理三个四槽背包并进入武器库，配装保存在浏览器的 `cf_player_profile` 里，旧的 `cf_ship_opts.primary` 会迁移到首个背包。团队换包下次复活生效；爆破准备阶段可立即换包，存活且回合进行时锁定，阵亡后可登记下一回合背包。C4 独立携带，不占装备槽。

对局顶部的阵营圆点显示存活人数，阵亡变灰、复活或新回合重新点亮。普通准星带固定中心点；左下角显示自己的整场击杀、死亡和 KD，零死亡时 KD 显示 `—`，观战不会切换成队友战绩。

## 仓库结构

```text
cf-transport-ship/
  src/                  游戏逻辑、地图、角色、武器、界面和样式
    profile.js          本地档案：校验、迁移、背包与装备读写
    screens.js          主页、个人界面、背包、武器库界面
    bomb-rules.js       爆破回合、计时与胜负（纯逻辑）
    bomb-tactics.js     爆破任务负责人、独立守点与安拆判断
    bomb-map.js         通用爆破测试场（不是沙漠灰）
    desert-layout.js    沙城路线、出生点、包点及碰撞配置
    desert-map.js       沙城建筑、材质、标识与资源管理
    map-catalog.js      爆破地图名称、说明与默认选择
  docs/                 开发规格、装备数据与计算脚本
  tests/                档案、爆破规则和模拟时钟检查
  tools/                浏览器验收脚本（截图输出不提交）
  build.mjs             单文件 HTML 构建脚本
  package.json          依赖、构建与测试命令
  package-lock.json     锁定依赖版本
README.md               项目说明
AGENTS.md               开发边界与验证约定
.gitignore              忽略依赖、构建产物与验收截图
```

`node_modules/`、`dist/` 与 `cf-transport-ship/tools/shots/` 不提交到 Git。

## 检查与验收

```bash
cd cf-transport-ship
npm test                      # 档案、爆破规则、模拟时钟、人机与地图通路
node tools/verify-game.mjs      # 需要 8000 端口的静态预览在运行
node tools/verify-bomb.mjs      # 爆破交互、整场机器人对局与模式切换
node tools/verify-hud-bots.mjs  # 存活灯、个人 KD、桌面布局与人机基础行为
node tools/verify-desert.mjs    # 沙城入口、A/B 安包、人机对局、切图资源
node tools/verify-weapon-poses.mjs # 九款武器持握、检视、换弹及画面边界
node tools/describe-desert-map.mjs # 从实际地图生成俯视图与路线统计
```

`tools/verify-game.mjs` 用 playwright-core 驱动本机 Chrome，覆盖主页到对局的界面链路、输入屏蔽、换包不刷弹、团队规则回归。自 2026-10-02 起手机端不作为开发与验收项，脚本默认跳过手机分段，需要时用 `M1_MOBILE=1` 打开；截图落在 `tools/shots/`。

## 开发规划

已确认方向及验收见 [游戏开发规格](cf-transport-ship/docs/game-design.md)。主页、背包、运输船、九款装备、爆破规则与原创沙城地图已实现。沙城尚需真人试玩校准路线平衡；闪光弹与烟雾弹待后续制作。沙城按用户授权设计原创路线，未按引用对话中无法取得的图片还原，也不代表官方地图复刻。爆破模块的接口见 [爆破接入说明](cf-transport-ship/docs/bomb-interfaces.md)。

交给开发 Agent 时，从 [CF 开发协作说明](cf-transport-ship/AGENTS.md) 开始；装备与项目默认参数见 [设计数据](cf-transport-ship/docs/design-data.json)。

## 原始来源

- 本仓库：[yangcodingmaster/CS-demo-version](https://github.com/yangcodingmaster/CS-demo-version)。
- 原始工程：[riba2534/claude-opus-5-5-demo](https://github.com/riba2534/claude-opus-5-5-demo)。
- 原仓库将该游戏描述为 Claude Opus 5.5 的代码生成能力测试。本 fork 后续会修改代码，不再沿用“源码零人工改动”的描述。
- 游戏为致敬作品，与《穿越火线》原厂无关。
