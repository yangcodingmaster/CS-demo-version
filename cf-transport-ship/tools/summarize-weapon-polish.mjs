// node tools/summarize-weapon-polish.mjs [before-studio.json] [after-studio.json]
// 输入由 capture-weapon-studio.mjs 采集；统计不包含双手、火焰及世界场景。
import fs from 'node:fs';

const beforePath = process.argv[2] || 'tools/shots/guns/before-desert-studio.json';
const afterPath = process.argv[3] || 'tools/shots/guns/after-desert-studio.json';
const before = JSON.parse(fs.readFileSync(beforePath)).models;
const after = JSON.parse(fs.readFileSync(afterPath)).models;
const weapons = Object.fromEntries(Object.keys(before).map((id) => [id, {
  before: before[id].triangles,
  after: after[id].triangles,
  ratio: +(after[id].triangles / before[id].triangles).toFixed(4),
}]));
const oldTotal = Object.values(before).reduce((sum, model) => sum + model.triangles, 0);
const newTotal = Object.values(after).reduce((sum, model) => sum + model.triangles, 0);
const data = {
  source: 'tools/capture-weapon-studio.mjs before-desert / after-desert',
  scope: 'visible weapon meshes, excluding hands and muzzle effects',
  weapons,
  total: {
    before: oldTotal,
    after: newTotal,
    changePercent: +((newTotal / oldTotal - 1) * 100).toFixed(2),
  },
};
fs.writeFileSync('docs/weapon-polish-metrics.json', JSON.stringify(data, null, 2) + '\n');
console.log(JSON.stringify(data));
