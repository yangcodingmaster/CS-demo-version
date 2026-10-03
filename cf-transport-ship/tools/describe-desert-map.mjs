// 从真实碰撞与导航生成地图交接图及路程统计，避免文档维护另一份坐标。
// node tools/describe-desert-map.mjs
import fs from 'node:fs';
import * as THREE from 'three';
import { buildDesertMap } from '../src/desert-map.js';
import { DESERT_LAYOUT } from '../src/desert-layout.js';
import { World, NavGrid } from '../src/physics.js';

const world = new World();
const map = buildDesertMap(new THREE.Group(), null, world);
const nav = new NavGrid(world, ...map.navBounds, 0.5, 0.42);
const b = map.radarBounds;
const scale = 10;
const X = (x) => 60 + (x - b.minX) * scale;
const Y = (z) => 110 + (z - b.minZ) * scale;
const width = (b.maxX - b.minX) * scale + 120;
const height = (b.maxZ - b.minZ) * scale + 230;
const svg = [
  `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
  '<style>text{font-family:Arial,"PingFang SC",sans-serif;fill:#292b2e}.label{font-size:15px;font-weight:600;paint-order:stroke;stroke:#f3eee3;stroke-width:4px;stroke-linejoin:round}</style>',
  `<rect width="${width}" height="${height}" fill="#f3eee3"/>`,
  '<text x="60" y="47" font-size="28" font-weight="700">沙城 / 原创爆破地图</text>',
  '<text x="60" y="78" font-size="15">沙漠灰风格 · 单层道路 · 来自游戏实际碰撞与导航配置</text>',
  `<rect x="60" y="110" width="${width - 120}" height="${height - 230}" fill="#dcd0b7" stroke="#aa9c81"/>`,
];
for (const c of world.colliders.filter((c) => c.solid && c.top > 0.4 && c.bottom < 1.8)) {
  svg.push(`<rect x="${-c.hx * scale}" y="${-c.hz * scale}" width="${2 * c.hx * scale}" height="${2 * c.hz * scale}" transform="translate(${X(c.x)} ${Y(c.z)}) rotate(${-c.yaw * 180 / Math.PI})" fill="${c.top < 2.4 ? '#998268' : '#5a5853'}" stroke="#f3eee3" stroke-width="1"/>`);
}
const distances = [];
for (const [side, points] of Object.entries(map.spawns)) {
  const color = side === 'attack' ? '#bc542b' : '#3375a7';
  const source = points[Math.floor(points.length / 2)];
  for (const [index, point] of points.entries()) {
    svg.push(`<circle cx="${X(point.x)}" cy="${Y(point.z)}" r="5" fill="${color}" stroke="#f3eee3" stroke-width="2"/>`);
    for (const site of map.sites) {
      const path = nav.findPath(point.x, point.z, site.x, site.z);
      if (!path?.length) throw new Error(`${side}:${index} 无法抵达 ${site.id}`);
      let previous = [point.x, point.z], length = 0;
      for (const target of [...path, [site.x, site.z]]) {
        length += Math.hypot(target[0] - previous[0], target[1] - previous[1]);
        previous = target;
      }
      distances.push({ side, spawn: index, site: site.id, meters: +length.toFixed(2) });
      if (point === source) svg.push(`<polyline points="${[[point.x, point.z], ...path, [site.x, site.z]].map(([x, z]) => `${X(x)},${Y(z)}`).join(' ')}" fill="none" stroke="${color}" stroke-width="3" stroke-dasharray="7 5" opacity=".85"/>`);
    }
  }
  svg.push(`<text class="label" x="${X(source.x)}" y="${Y(source.z) + (side === 'attack' ? 22 : -15)}" text-anchor="middle">${side === 'attack' ? '首轮潜伏者出生' : '首轮保卫者出生'}</text>`);
}
for (const site of map.sites) {
  svg.push(`<circle cx="${X(site.x)}" cy="${Y(site.z)}" r="${site.radius * scale}" fill="#f7d08b" fill-opacity=".5" stroke="#ae6c23" stroke-width="2"/>`);
  svg.push(`<text class="label" x="${X(site.x)}" y="${Y(site.z) + 6}" text-anchor="middle">${site.id} 安包区</text>`);
}
const routeLabels = {
  aLong: ['A 长道', 2],
  aShort: ['A 小道', -3],
  bLong: ['B 外侧通道', 2],
  bShort: ['B 小道', -2],
  northRotate: ['回防路', 3],
};
for (const [key, [label, index]] of Object.entries(routeLabels)) {
  const point = DESERT_LAYOUT.routes?.[key]?.at(index);
  if (point) svg.push(`<text class="label" x="${X(point[0])}" y="${Y(point[1]) - 10}" text-anchor="middle">${label}</text>`);
}
svg.push(`<text x="60" y="${height - 72}" font-size="14">深灰：建筑与墙体　棕色：低掩体　橙 / 蓝虚线：双方代表出生点的最短导航路线</text>`);
svg.push(`<text x="60" y="${height - 45}" font-size="14">路线并非唯一走法；换边后交换出生区。长度采用项目单位，不代表官方地图尺寸。</text>`);
svg.push('</svg>');
fs.writeFileSync('docs/desert-layout.svg', svg.join('\n'));
const summary = {
  source: 'src/desert-map.js + World + NavGrid',
  mapId: map.id,
  width: b.maxX - b.minX,
  depth: b.maxZ - b.minZ,
  checkedSpawnToSitePaths: distances.length,
  distances,
  rangeBySide: Object.fromEntries(Object.keys(map.spawns).map((side) => {
    const d = distances.filter((p) => p.side === side).map((p) => p.meters);
    return [side, { min: Math.min(...d), max: Math.max(...d) }];
  })),
};
fs.writeFileSync('docs/desert-metrics.json', JSON.stringify(summary, null, 2) + '\n');
map.dispose();
console.log(JSON.stringify(summary));
