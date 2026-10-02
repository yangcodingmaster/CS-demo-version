# 项目协作

## 开发边界

- 本仓库是 Yang 的 `yangcodingmaster/CS-demo-version`，只维护《穿越火线》运输船游戏。
- 后续游戏功能、样式、资源和构建改动只在 `cf-transport-ship/` 内进行，保持当前目录名。
- 不恢复 `pelican-bike/` 或 `qq-speed/`；根目录只维护与本项目相关的仓库说明和协作规则。
- 保留原项目来源说明，不把 fork 的改动提交到原作者仓库。

## 常用命令

在 `cf-transport-ship/` 中执行：

```bash
npm ci
npm run build
python3 -m http.server 8000 --bind 127.0.0.1 --directory dist
```

- 构建产物：`cf-transport-ship/dist/index.html`。
- `node build.mjs --dev` 只关闭压缩，不启动开发服务器。
- 不提交 `node_modules/` 或 `dist/`。

## 验证与资料

- 改动后先构建；网页改动按范围检查桌面和触屏布局，至少验证主菜单和进入对局。
- 项目介绍、操作和本地运行见 `README.md`；玩法代码入口为 `cf-transport-ship/src/main.js` 与 `src/game.js`。
- 游戏新功能按 `cf-transport-ship/AGENTS.md` 与 `cf-transport-ship/docs/game-design.md` 的阶段、分工和验收执行；这些规划不能视为已实现。
- `origin` 指向 Yang 的 fork，`upstream` 指向原仓库，仅用于获取原作者更新。
