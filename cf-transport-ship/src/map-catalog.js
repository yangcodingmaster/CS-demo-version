// 菜单与场景共用地图名称；旧测试场保留给回归场景。
export const DEFAULT_BOMB_MAP = 'desert-gray';
export const BOMB_MAPS = {
  'desert-gray': {
    name: '沙城',
    english: 'DESERT TOWN',
    description: '沙漠灰风格的原创布局。通过 A 长道、A 小道、中路或 B 侧通道进攻，在砂岩街巷和院落间回防。',
  },
  'bomb-test': {
    name: '爆破测试场',
    english: 'BOMB TEST ARENA',
    description: '通用 A/B 测试场，用于爆破规则与人机回归验证。',
  },
};

export const bombMapId = (id) => Object.hasOwn(BOMB_MAPS, id) ? id : DEFAULT_BOMB_MAP;
export const bombMapInfo = (id) => BOMB_MAPS[bombMapId(id)];
