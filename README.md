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
| 主武器、手枪、刀、手雷 | 1、2、3、4 |
| 切换武器 | Q / 鼠标滚轮 |
| 换弹 / 检视武器 / 更换主武器 | R / F / B |
| 计分板 / 暂停 | Tab / Esc |

触屏设备支持虚拟摇杆与操作按钮，电脑与鼠标体验更完整。

当前手机竖屏菜单存在横向溢出，触屏交互尚未完成验证，后续需要单独适配。

## 仓库结构

```text
cf-transport-ship/
  src/                  游戏逻辑、地图、角色、武器、界面和样式
  build.mjs             单文件 HTML 构建脚本
  package.json          依赖与构建命令
  package-lock.json     锁定依赖版本
README.md               项目说明
AGENTS.md               开发边界与验证约定
.gitignore              忽略依赖与构建产物
```

`node_modules/` 和 `dist/` 不提交到 Git。

## 原始来源

- 本仓库：[yangcodingmaster/CS-demo-version](https://github.com/yangcodingmaster/CS-demo-version)。
- 原始工程：[riba2534/claude-opus-5-5-demo](https://github.com/riba2534/claude-opus-5-5-demo)。
- 原仓库将该游戏描述为 Claude Opus 5.5 的代码生成能力测试。本 fork 后续会修改代码，不再沿用“源码零人工改动”的描述。
- 游戏为致敬作品，与《穿越火线》原厂无关。
