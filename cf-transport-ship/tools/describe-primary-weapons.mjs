// 从运行参数生成武器库清单与比较表，避免手工表格和实际数值不同步。
import fs from 'node:fs';
import { WEAPONS, PRIMARIES } from '../src/weapons.js';
const weapons=PRIMARIES.map(id=>{
 const w=WEAPONS[id];
 return {id,name:w.name,type:w.type,damage:w.dmg,rpm:w.rpm,magazine:w.mag,reserve:w.reserve,reloadSeconds:w.reload,drawSeconds:w.draw,moveMultiplier:w.speed,penetration:w.pen,armorPenetration:w.armorPen,reloadStyle:w.reloadStyle||'standard',boltAction:!!w.boltAction,minimumShotIntervalSeconds:Number(Math.max(60/w.rpm,w.boltAction?w.bolt:w.shotRecovery||0).toFixed(4))};
});
const report={source:'src/weapons.js',formulas:{minimumShotIntervalSeconds:'max(60 / rpm, boltAction ? bolt : shotRecovery || 0)'},primaryCount:weapons.length,totalAvailable:Object.keys(WEAPONS).length,weapons};
fs.writeFileSync('docs/primary-weapon-stats.json',JSON.stringify(report,null,2)+'\n');
const lines=['| 武器 | 基础伤害 | 射速（发/分） | 弹匣 | 换弹（秒） | 移动倍率 |','| --- | --- | --- | --- | --- | --- |',...weapons.map(w=>`| ${w.name} | ${w.damage} | ${w.rpm} | ${w.magazine} | ${w.reloadSeconds} | ${w.moveMultiplier} |`)];
const path='docs/game-design.md';let text=fs.readFileSync(path,'utf8');
const block='<!-- primary-stats:start -->\n\n'+lines.join('\n')+'\n\n<!-- primary-stats:end -->';
if(text.includes('<!-- primary-stats:start -->'))text=text.replace(/<!-- primary-stats:start -->[\s\S]*?<!-- primary-stats:end -->/,block);
else text=text.replace('### 新手枪的完整性',`### 当前主武器参数\n\n下表由 \`node tools/describe-primary-weapons.mjs\` 从运行数据生成。差异为本项目平衡设计，需结合真人试玩调整；伤害未计距离、护甲及命中部位。\n\n${block}\n\n### 新手枪的完整性`);
fs.writeFileSync(path,text);console.log(JSON.stringify({primaries:report.primaryCount,totalAvailable:report.totalAvailable}));
