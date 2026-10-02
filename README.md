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
| 换弹 / 检视武器 / 选择背包（下次复活生效） | R / F / B |
| 计分板 / 暂停 | Tab / Esc |

触屏设备支持虚拟摇杆与操作按钮，电脑与鼠标体验更完整。

主页提供团队竞技、个人界面与设置入口，个人界面里可以改昵称、管理三个背包并进入武器库；爆破模式入口当前标注为开发中。三个背包各有主武器、副武器、近战、投掷物四个槽位，配装保存在浏览器的 `cf_player_profile` 里，旧的 `cf_ship_opts.primary` 会迁移到首个背包。

## 仓库结构

```text
cf-transport-ship/
  src/                  游戏逻辑、地图、角色、武器、界面和样式
    profile.js          本地档案：校验、迁移、背包与装备读写
    screens.js          主页、个人界面、背包、武器库界面
  docs/                 开发规格、装备数据与计算脚本
  tests/                Node 运行的存储与迁移检查
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
npm test                      # 档案校验、迁移与回退（node:test，无第三方依赖）
node tools/verify-m1.mjs      # 需要 8000 端口的静态预览在运行
```

`tools/verify-m1.mjs` 用 playwright-core 驱动本机 Chrome，覆盖主页到对局的界面链路、输入屏蔽、换包不刷弹、团队规则回归。自 2026-10-02 起手机端不作为开发与验收项，脚本默认跳过手机分段，需要时用 `M1_MOBILE=1` 打开；截图落在 `tools/shots/`。

## 开发规划

主页、武器库与三背包、CF 沙漠灰爆破、枪械精修和新增装备的已确认方向及分阶段验收，见 [游戏开发规格](cf-transport-ship/docs/game-design.md)。M1（主页、背包、运输船）已实现并验收，爆破模式、新增副武器与战术投掷物仍待后续阶段实施。

交给开发 Agent 时，从 [CF 开发协作说明](cf-transport-ship/AGENTS.md) 开始；装备与项目默认参数见 [设计数据](cf-transport-ship/docs/design-data.json)。

## 原始来源

- 本仓库：[yangcodingmaster/CS-demo-version](https://github.com/yangcodingmaster/CS-demo-version)。
- 原始工程：[riba2534/claude-opus-5-5-demo](https://github.com/riba2534/claude-opus-5-5-demo)。
- 原仓库将该游戏描述为 Claude Opus 5.5 的代码生成能力测试。本 fork 后续会修改代码，不再沿用“源码零人工改动”的描述。
- 游戏为致敬作品，与《穿越火线》原厂无关。
