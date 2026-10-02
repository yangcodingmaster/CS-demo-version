# 爆破接入说明

当前可玩地图是通用爆破测试场。CF 沙漠灰的路线、尺寸、出生区、包点和高低差尚未核定，不得把测试场改名后当作地图还原交付。

## 模块与入口

- `Game.showBombSetup()`、`showSelectedSetup()` 负责设置路径；`startSelectedMatch()` 按主页选择启动，`restartMatch()` 保留当前比赛模式。`startBombMatch(options = {})` 创建规则和角色，可覆盖规则默认值用于测试；`startTeamMatch()` 保留团队规则。主页 `selectedMode` 表示待进入模式，`mode` 表示当前比赛模式。
- `bomb-rules.js` 是纯逻辑，`BOMB_DEFAULTS` 是实际运行默认值，单元测试逐字段比对 `design-data.json.bombDefaults`。修改默认参数时同步二者并运行设计计算脚本。
- `bomb-map.js` 的 `buildBombMap(scene, T, world)` 返回地图配置；`Game.loadMap(mode)` 管理场景根节点、碰撞、导航、雷达与环境切换。地图独占资源由 `dispose()` 释放，运输船的自有甲板 AO 声明在 `ownedTextures` 中，借用纹理不释放。
- `bomb-visual.js` 持有复用的世界与第一人称 C4 模型，任务物品不进入 `WEAPONS` 或四槽背包。
- `bomb-tactics.js` 管理公开任务，`Game.getBombTask(bot)` 返回 `{ goal, lookAt?, interact?, siteId?, urgent }`；`lookAt` 为静态地图入口方向。守点位置按导航和碰撞校验、彼此分开，缓存按规则实例与回合重置。
- 拾包、拆包按实际路径长度选机器人，负责人保持到死亡或 `reportBombTaskBlocked(bot, task)` 报告阻塞。阻塞者短暂退出候选，玩家仅站在附近不占任务；玩家正在安拆时机器人掩护。换边时阵营身份不变，任务根据 `attackTeam` 重建。
- `Game.shouldBotInteract(bot, task)` 统一决定站定与交互。当前近处可见威胁会延后安拆，短暂确认安全后重试；剩余路程与安拆用时触发紧迫任务，即将完成的安拆也会坚持。判断不读取遮挡敌人实时位置，瞄准与反应难度未改变。
- `updateBotObjective()` 校验安拆和拾取。`Bot.update()` 先更新当次思考的感知，再更新任务；交互期间禁止攻击、切枪和投掷，既有换弹和武器恢复继续走模拟时间。队友提前让开安拆空间，实际实体碰撞位移仍取消交互。

## 地图契约

```js
{
  id: 'bomb-test',
  name: '爆破测试场',
  spawns: {
    attack: [{ x, y, z, yaw }],
    defend: [{ x, y, z, yaw }],
  },
  sites: [{ id: 'A', label: 'A区', x, y, z, radius }],
  navBounds: [minX, minZ, maxX, maxZ],
  radarBounds: { minX, minZ, maxX, maxZ },
  spectator: { x, y, z, lookX, lookY, lookZ },
  lampSpots: [],
  funnelTop: null,
  update(dt, time) {},
  dispose() {},
}
```

出生按攻守角色取点，队伍身份 BL/GR 与比分不随换边改变。渲染实体与碰撞来自同一配置；导航和雷达使用当前地图边界。现有 `NavGrid` 为单层网格，仅满足测试场，真实沙漠灰若有多层路线，须实现高度和连接关系后再验收。

## 时钟与同刻事件

规则只读取模拟秒。暂停时 `simulate()` 不推进，准备、进行、炸弹、交互与回合结算共同冻结。`Game.simulate()` 按 `nextEventTime()`、延时动作和手雷绝对 `explodeAt` 切分，每段限制物理步长。

每段先收集全部射击和爆炸伤害，再归并死亡及掉包，校验交互，调用 `BombRules.advance()`，最后消费规则事件。同刻截止优先于安拆完成；完成者同刻死亡时交互无效。较早安包先提交，较晚死亡不撤销已提交的安包。

新回合清空输入、弹药动作、投掷物、延时动作、特效、目标与观战引用，再重置角色、满血护甲与四槽弹药，最后选出携包者。击杀只计个人战绩，回合结果只加一次队伍分数。

## 输入与可见信息

5 选择自己携带的 C4；在 A/B 区站定，按住 E 安放。防守方靠近已安放 C4 后按住 E 拆除；松开、移动、蹲下、跳跃、离开范围、遮挡或死亡取消并清零。受伤本身不取消。掉落 C4 由活进攻方靠近单按 E 拾取，拾取和拆除都检查距离及视线。

准备阶段 B 可立即换包；进行阶段存活玩家不能换；阵亡可以登记下轮。安拆期间不射击、投掷或切枪，Q 和滚轮回到普通武器时仍只使用四槽。

阵亡只跟随存活队友，可按 Q 切换；无队友时使用固定场景镜头。阵亡雷达隐藏全部敌人，姓名标记检查遮挡，不跟随击杀者，不显示准星敌人姓名。未安包的防守方看不到携包者姓名或掉落 C4 雷达坐标，已安放包点属于公开目标。

HUD 的 `update(dt, state)` 读取 `state.bomb`（回合、身份、目标、进度、观战）与 `state.c4Selected`。未安包防守方的公开 `bombState` 为 `unplanted`；根 Game 在传入第四参数 `drawRadar(me, actors, time, { hideEnemies, c4 })` 前过滤未知 C4 坐标，不能直接传实际敌方任务位置。`endScreen(..., bomb)` 使用回合比分。

`state.roster` 为 `{ id, team, alive }` 数组，`state.myId` 标出自己。存活点按真实人数生成、按 ID 缓存，`team` 始终为阵营身份。`state.personalStats` 为 `{ kills, deaths }`，必须从本人的整场统计传入；观战不可改成被观战角色。KD 为击杀除以死亡，保留两位小数；零死亡显示 `—`。普通准星中心点沿用原准星的显示条件，未开镜狙击不增加腰射准星。

## 验证命令

运行 `npm test`、`npm run build`，启动 README 的本地静态服务，然后运行 `node tools/verify-game.mjs`、`node tools/verify-bomb.mjs` 与 `node tools/verify-hud-bots.mjs`。截图输出在 `tools/shots/`，不提交；脚本输出当前通过数、回合原因与资源测量，验收记录写入 `game-design.md`。
