// 原创单层沙城布局。项目比例，不是 CF 官方沙漠灰的复刻或考据尺寸。
// 所有实体都从这些盒体生成几何、碰撞和雷达；通行地面统一为 y=0。
const block = (id, x, z, sx, sz, height = 6, kind = 'sandstone') => ({
  id,
  kind,
  x,
  y: height / 2,
  z,
  sx,
  sy: height,
  sz,
  yaw: 0,
});

export const DESERT_LAYOUT = {
  id: 'desert-gray',
  name: '沙城',
  description: '沙漠灰风格的原创布局，非官方地图复刻。',
  bounds: {
    minX: -38,
    maxX: 38,
    minZ: -32,
    maxZ: 32,
  },
  floor: {
    id: 'floor',
    kind: 'floor',
    x: 0,
    y: -0.3,
    z: 0,
    sx: 78,
    sy: 0.6,
    sz: 66,
    yaw: 0,
  },
  blocks: [
    block('boundary-west', -38.5, 0, 1, 66, 6),
    block('boundary-east', 38.5, 0, 1, 66, 6),
    block('boundary-south', 0, 32.5, 76, 1, 6),
    block('boundary-north', 0, -32.5, 76, 1, 6),

    // 南侧庭院有三路出口。中门配错位遮挡，保持出生区视线安全。
    block('attack-front-west', -8.5, 20, 11, 1, 5.4),
    block('attack-front-east', 8.5, 20, 11, 1, 5.4),
    block('attack-entry-screen', 0, 24, 12, 1, 3.5),
    block('attack-west-front', -14, 21.5, 1, 3, 5.4),
    block('attack-west-back', -14, 29.5, 1, 5, 5.4),
    block('attack-east-front', 14, 21.5, 1, 3, 5.4),
    block('attack-east-back', 14, 29.5, 1, 5, 5.4),
    block('southwest-building', -28, 24, 16, 12, 7),
    block('southeast-building', 28, 24, 16, 12, 7),

    // 北侧防守出生庭院与横向回防路。两侧建筑下缘留出回防通道。
    block('defend-front', 0, -20, 24, 1, 5.4),
    block('defend-west-back', -12, -29, 1, 6, 5.4),
    block('defend-west-front', -12, -21, 1, 2, 5.4),
    block('defend-east-back', 12, -29, 1, 6, 5.4),
    block('defend-east-front', 12, -21, 1, 2, 5.4),
    block('northwest-building', -25, -28, 20, 7, 7),
    block('northeast-building', 25, -28, 20, 7, 7),

    // A 长道绕过东侧街区；两段遮挡迫使路线在包点前转折。
    block('east-market', 25, 8, 12, 10, 6.2),
    block('a-long-bend', 33, -1, 10, 1, 4.8),
    block('a-south-west', 20.5, -6, 5, 1, 5.8),
    block('a-south-east', 33, -6, 8, 1, 5.8),
    block('a-west-north', 18, -18, 1, 4, 5.8),
    block('a-west-south', 18, -8.25, 1, 4.5, 5.8),
    block('a-north-west', 20, -20, 4, 1, 5.8),
    block('a-north-east', 33, -20, 8, 1, 5.8),

    // B 外侧为弯折街道，另一个入口接中路小巷。
    block('west-market', -24, 8, 12, 10, 6.2),
    block('b-long-bend', -33, -1, 10, 1, 4.8),
    block('b-south-west', -33, -6, 8, 1, 5.8),
    block('b-south-east', -20.5, -6, 5, 1, 5.8),
    block('b-east-north', -18, -18, 1, 4, 5.8),
    block('b-east-south', -18, -8.25, 1, 4.5, 5.8),
    block('b-north-west', -33, -20, 8, 1, 5.8),
    block('b-north-east', -20, -20, 4, 1, 5.8),

    // 中路双门错位。两扇门和街区产生转折，不能从出生直望包点。
    block('mid-gate-south-west', -13, 10, 16, 1, 6),
    block('mid-gate-south-east', 13, 10, 16, 1, 6),
    block('mid-gate-north-west-end', -20.25, 2, 1.5, 1, 6),
    block('mid-gate-north-west', -5.75, 2, 15.5, 1, 6),
    block('mid-gate-north-east', 15, 2, 12, 1, 6),
    block('mid-citadel', 1, -12, 10, 12, 7),
    block('b-short-building', -10, -8, 8, 12, 6.5),
    block('a-short-building', 13, -1, 6, 10, 6.5),

    // 街角箱体有实体遮挡；箱子不是必经跳跃路线。
    block('south-market-crates', -4, 17.9, 2.5, 2.3, 1.8, 'wood'),
    block('a-long-crates', 32.2, 9, 2.3, 3, 2.1, 'wood'),
    block('b-long-crates', -31.4, 7, 2.6, 2.8, 2.1, 'wood'),
    block('mid-crates', -5, 7.8, 2.4, 2.4, 1.8, 'wood'),
    block('a-cover', 33, -15.5, 2.8, 2.8, 2.2, 'wood'),
    block('b-cover', -33, -10.5, 2.8, 2.8, 2.2, 'wood'),
    block('north-crates-east', 9, -29.9, 2.3, 2.3, 1.6, 'wood'),
    block('north-crates-west', -9, -29.9, 2.3, 2.3, 1.6, 'wood'),
    block('north-rotation-screen', 0, -23.7, 8, 1.3, 2.5),
  ],
  spawns: {
    attack: [-8, -4, 0, 4, 8].map((x) => ({
      x,
      y: 0.02,
      z: 28,
      yaw: 0,
    })),
    defend: [-8, -4, 0, 4, 8].map((x) => ({
      x,
      y: 0.02,
      z: -28,
      yaw: Math.PI,
    })),
  },
  sites: [
    {
      id: 'A',
      label: 'A区',
      x: 25,
      y: 0,
      z: -13,
      radius: 3,
    },
    {
      id: 'B',
      label: 'B区',
      x: -25,
      y: 0,
      z: -13,
      radius: 3,
    },
  ],
  // 用于检验不同通道的连续性，不是给 Bot 增加隐藏敌人信息。
  routes: {
    aLong: [[16, 24.5], [16, 15.5], [34.5, 15.5], [34.5, 1], [26, 1], [26, -13], [25, -13]],
    aShort: [[7, 25.5], [7, 22], [0, 21.5], [0, 14], [0, 6], [5.5, 6], [7.5, -4], [10, -10], [20, -13], [25, -13]],
    bLong: [[-16, 24.5], [-16, 15.5], [-34, 15.5], [-34, 1], [-26, 1], [-26, -13]],
    bShort: [[-7, 25.5], [-7, 22], [0, 21.5], [0, 14], [0, 6], [-16.5, 6], [-16.5, -13], [-25, -13]],
    northRotate: [[-25, -13], [-25, -22.5], [-14, -23.5], [-6, -26.5], [6, -26.5], [14, -23.5], [25, -22.5], [25, -13]],
  },
  // 弯顶门洞上方的每块石体有相同的渲染和碰撞尺寸，脚下没有高低层。
  gates: [
    {
      id: 'attack-entry',
      axis: 'x',
      x: 0,
      z: 20,
      width: 6,
      top: 5.4,
      depth: 1,
    },
    {
      id: 'mid-south',
      axis: 'x',
      x: 0,
      z: 10,
      width: 10,
      top: 6,
      depth: 1,
    },
    {
      id: 'mid-north',
      axis: 'x',
      x: 5.5,
      z: 2,
      width: 7,
      top: 6,
      depth: 1,
    },
    {
      id: 'b-mid',
      axis: 'x',
      x: -16.5,
      z: 2,
      width: 6,
      top: 6,
      depth: 1,
    },
    {
      id: 'a-long',
      axis: 'x',
      x: 26,
      z: -6,
      width: 6,
      top: 5.8,
      depth: 1,
    },
    {
      id: 'a-short',
      axis: 'z',
      x: 18,
      z: -13.25,
      width: 5.5,
      top: 5.8,
      depth: 1,
    },
    {
      id: 'a-back',
      axis: 'x',
      x: 25.5,
      z: -20,
      width: 7,
      top: 5.8,
      depth: 1,
    },
    {
      id: 'b-long',
      axis: 'x',
      x: -26,
      z: -6,
      width: 6,
      top: 5.8,
      depth: 1,
    },
    {
      id: 'b-short',
      axis: 'z',
      x: -18,
      z: -13.25,
      width: 5.5,
      top: 5.8,
      depth: 1,
    },
    {
      id: 'b-back',
      axis: 'x',
      x: -25.5,
      z: -20,
      width: 7,
      top: 5.8,
      depth: 1,
    },
  ],
  // 贴墙木门为封闭建筑表面；真正可走入口始终是上述门洞。
  doors: [
    {
      id: 'attack-door',
      x: -8,
      y: 1.5,
      z: 20.54,
      sx: 3,
      sy: 3,
      sz: 0.12,
    },
    {
      id: 'defend-door',
      x: 0,
      y: 1.5,
      z: -20.54,
      sx: 3,
      sy: 3,
      sz: 0.12,
    },
    {
      id: 'east-market-door',
      x: 31.06,
      y: 1.4,
      z: 11,
      sx: 0.12,
      sy: 2.8,
      sz: 1.8,
    },
    {
      id: 'west-market-door',
      x: -30.06,
      y: 1.4,
      z: 11,
      sx: 0.12,
      sy: 2.8,
      sz: 1.8,
    },
  ],
  awnings: [
    {
      id: 'east-market-shade',
      x: 32.35,
      y: 3.7,
      z: 5.5,
      sx: 2.7,
      sz: 5,
      color: 'clothRed',
    },
    {
      id: 'west-market-shade',
      x: -31.35,
      y: 3.7,
      z: 5.5,
      sx: 2.7,
      sz: 5,
      color: 'clothBlue',
    },
  ],
  signs: [
    {
      text: 'A',
      x: 33,
      y: 2.7,
      z: -19.44,
      yaw: 0,
      width: 2.6,
      height: 2.2,
    },
    {
      text: 'B',
      x: -33,
      y: 2.7,
      z: -19.44,
      yaw: 0,
      width: 2.6,
      height: 2.2,
    },
    {
      text: '进攻出生',
      x: 0,
      y: 5,
      z: 20.53,
      yaw: 0,
      width: 4.3,
      height: 1.1,
    },
    {
      text: '防守出生',
      x: 0,
      y: 4,
      z: -20.63,
      yaw: Math.PI,
      width: 4.3,
      height: 1.1,
    },
    {
      text: 'A 长道 →',
      x: 25,
      y: 2.8,
      z: 13.07,
      yaw: 0,
      width: 4.5,
      height: 1.1,
    },
    {
      text: '← B 街道',
      x: -24,
      y: 2.8,
      z: 13.07,
      yaw: 0,
      width: 4.5,
      height: 1.1,
    },
    {
      text: '中路双门',
      x: -12,
      y: 3,
      z: 10.58,
      yaw: 0,
      width: 4.2,
      height: 1.1,
    },
    {
      text: 'A 小道 →',
      x: 0,
      y: 2.8,
      z: 2.58,
      yaw: 0,
      width: 3.5,
      height: 1.1,
    },
    {
      text: '← B 小巷',
      x: -10,
      y: 2.8,
      z: -1.94,
      yaw: 0,
      width: 3.5,
      height: 1.1,
    },
    {
      text: '回防通路',
      x: 22,
      y: 2.8,
      z: -24.44,
      yaw: 0,
      width: 3.5,
      height: 1.1,
    },
    {
      text: '回防通路',
      x: -22,
      y: 2.8,
      z: -24.44,
      yaw: 0,
      width: 3.5,
      height: 1.1,
    },
    {
      text: '沙城',
      x: 0,
      y: 2.5,
      z: 24.53,
      yaw: 0,
      width: 3.2,
      height: 1.1,
    },
  ],
  spectator: {
    x: 0,
    y: 15,
    z: 7,
    lookX: 0,
    lookY: 1.5,
    lookZ: -12,
  },
  shadowBounds: [[-38, 38], [-1, 9], [-32, 32]],
};

// 细节也由同一盒体清单驱动。无碰撞的部分只有贴面文字和地面油漆。
export function desertBoxes(data = DESERT_LAYOUT) {
  const boxes = [data.floor, ...data.blocks];
  for (const gate of data.gates) {
    const parts = Math.ceil(gate.width / 0.5);
    const segment = gate.width / parts;
    for (let i = 0; i < parts; i++) {
      const offset = (i + 0.5) * segment - gate.width / 2;
      const arch = Math.sqrt(Math.max(0, 1 - (offset / (gate.width / 2)) ** 2));
      const bottom = 3.05 + 1.75 * arch;
      boxes.push({
        id: `arch-${gate.id}-${i}`,
        kind: 'arch',
        x: gate.x + (gate.axis === 'x' ? offset : 0),
        y: (gate.top + bottom) / 2,
        z: gate.z + (gate.axis === 'z' ? offset : 0),
        sx: gate.axis === 'x' ? segment : gate.depth,
        sy: gate.top - bottom,
        sz: gate.axis === 'z' ? segment : gate.depth,
        yaw: 0,
      });
    }
  }
  for (const building of data.blocks.filter((b) => b.sy >= 5.8 && !b.id.startsWith('boundary'))) {
    boxes.push({ ...building, id: `cornice-${building.id}`, kind: 'trim', y: building.sy - 0.16, sy: 0.26, sx: building.sx + 0.2, sz: building.sz + 0.2 });
    if (!building.id.includes('building') && !building.id.includes('market')) continue;
    // 窗在封闭墙面上，有真实实体；不会制造假通道或无碰撞大遮挡。
    for (const side of [-1, 1]) {
      for (const xOffset of [-building.sx * 0.25, building.sx * 0.25]) {
        const x = building.x + xOffset, z = building.z + side * (building.sz / 2 + 0.035);
        boxes.push({ id: `window-${building.id}-${side}-${xOffset}`, kind: 'window', x, y: 3.8, z, sx: 1.45, sy: 1.3, sz: 0.07, yaw: 0 });
        for (const y of [3.09, 4.51]) boxes.push({ id: `window-sill-${building.id}-${side}-${xOffset}-${y}`, kind: 'trim', x, y, z: z + side * 0.015, sx: 1.7, sy: 0.12, sz: 0.12, yaw: 0 });
        boxes.push({ id: `window-bar-${building.id}-${side}-${xOffset}`, kind: 'iron', x, y: 3.8, z: z + side * 0.05, sx: 0.06, sy: 1.3, sz: 0.06, yaw: 0 });
      }
    }
  }
  for (const door of data.doors) {
    boxes.push({ ...door, kind: 'door', yaw: 0 });
    const horizontal = door.sx > door.sz;
    boxes.push({ ...door, id: `${door.id}-hinge`, kind: 'iron', sx: horizontal ? 0.07 : door.sx + 0.02, sz: horizontal ? door.sz + 0.02 : 0.07, sy: door.sy, yaw: 0 });
  }
  for (const shade of data.awnings) {
    boxes.push({ ...shade, kind: shade.color, sy: 0.06, yaw: 0, bullet: 'pass' });
    const outside = Math.sign(shade.x) * (Math.abs(shade.x) + shade.sx / 2 - 0.08);
    for (const z of [shade.z - shade.sz / 2, shade.z + shade.sz / 2]) {
      boxes.push({ id: `${shade.id}-post-${z}`, kind: 'wood', x: outside, y: shade.y / 2, z, sx: 0.15, sy: shade.y, sz: 0.15, yaw: 0 });
    }
  }
  for (const [i, sign] of data.signs.entries()) {
    const side = Math.abs(Math.sin(sign.yaw)) > 0.5;
    boxes.push({ id: `sign-board-${i}`, kind: 'signBoard', x: sign.x, y: sign.y, z: sign.z, sx: side ? 0.045 : sign.width + 0.16, sy: sign.height + 0.12, sz: side ? sign.width + 0.16 : 0.045, yaw: 0 });
  }
  return boxes;
}
