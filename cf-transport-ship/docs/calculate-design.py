"""从设计数据计算数量和时长，不改游戏运行配置。

运行：python3 cf-transport-ship/docs/calculate-design.py
输出：相邻的 design-summary.json，并同步 game-design.md 的生成段落。
只使用 Python 标准库，不修改游戏代码。
时长是无暂停、无菜单停留的保守上界，不是平均场长。
"""

import json
from collections import Counter
from pathlib import Path


CATEGORY_NAMES = {
    'primary': '主武器',
    'secondary': '副武器',
    'melee': '近战',
    'throwable': '投掷物',
}


def validate(data):
    equipment = data['equipment']
    by_id = {item['id']: item for item in equipment}
    if len(by_id) != len(equipment):
        raise ValueError('装备 ID 必须唯一')
    if len(data['defaultPrimaryIds']) != data['backpackCount']:
        raise ValueError('默认主武器数量必须等于背包数量')
    for category, ids in {
        'primary': data['defaultPrimaryIds'],
        'secondary': [data['defaultSecondaryId']],
        'melee': [data['defaultMeleeId']],
        'throwable': [data['defaultThrowableId']],
    }.items():
        for equipment_id in ids:
            if equipment_id not in by_id or by_id[equipment_id]['category'] != category:
                raise ValueError(f'默认装备与槽位不匹配：{equipment_id}')
    for item in equipment:
        if item['category'] not in CATEGORY_NAMES:
            raise ValueError(f"未知装备类别：{item['category']}")
        if item['availability'] not in ('existing', 'planned'):
            raise ValueError(f"未知交付状态：{item['availability']}")


def calculate(data):
    equipment = data['equipment']
    rules = data['bombDefaults']
    participants = rules['teamSize'] * 2
    active_upper_seconds = rules['roundSeconds'] + rules['bombSeconds']
    match_upper_seconds = rules['maxRounds'] * (
        rules['preparationSeconds']
        + active_upper_seconds
        + rules['resultSeconds']
    )
    minutes, seconds = divmod(match_upper_seconds, 60)
    return {
        'backpackCount': data['backpackCount'],
        'slotCountPerBackpack': len(data['slots']),
        'equipmentTotal': len(equipment),
        'equipmentByCategory': dict(Counter(item['category'] for item in equipment)),
        'existingEquipment': sum(item['availability'] == 'existing' for item in equipment),
        'plannedEquipment': sum(item['availability'] == 'planned' for item in equipment),
        'participants': participants,
        'bots': participants - rules['humanPlayers'],
        'activeRoundUpperSeconds': active_upper_seconds,
        'matchUpperSecondsExcludingPauseAndMenus': match_upper_seconds,
        'matchUpperMinutes': minutes,
        'matchUpperRemainingSeconds': seconds,
        'formulas': {
            'participants': 'teamSize * 2',
            'bots': 'participants - humanPlayers',
            'activeRoundUpperSeconds': 'roundSeconds + bombSeconds',
            'matchUpperSeconds': 'maxRounds * (preparationSeconds + activeRoundUpperSeconds + resultSeconds)',
        },
    }


def default_profile(data):
    return {
        'schemaVersion': data['schemaVersion'],
        'nickname': '我',
        'selectedBackpackId': 'bag-1',
        'backpacks': [
            {
                'id': f'bag-{index}',
                'name': f'背包{index}',
                'primary': primary_id,
                'secondary': data['defaultSecondaryId'],
                'melee': data['defaultMeleeId'],
                'throwable': data['defaultThrowableId'],
            }
            for index, primary_id in enumerate(data['defaultPrimaryIds'], start=1)
        ],
    }


def render_sections(data, summary):
    equipment_rows = [
        '| 类别 | 装备 | 状态/阶段 | 画面识别重点 |',
        '| --- | --- | --- | --- |',
    ]
    for item in data['equipment']:
        state = '现有' if item['availability'] == 'existing' else '新增'
        equipment_rows.append(
            f"| {CATEGORY_NAMES[item['category']]} | {item['name']} (`{item['id']}`) "
            f"| {state} / {item['deliveryStage']} | {item['visualDirection']} |"
        )
    rules = data['bombDefaults']
    half = rules['maxRounds'] // 2
    match_end = f"最多 {rules['maxRounds']} 回合，先 {rules['roundsToWin']} 胜"
    if rules['drawAtRoundLimit']:
        match_end += f'；{half}:{half} 平局'
    match_end += '，有加时' if rules['overtime'] else '，无加时'
    friendly_fire = '开启' if rules['friendlyFire'] else '关闭'
    self_damage = '保留' if rules['selfGrenadeDamage'] else '关闭'
    protection = (
        f"准备结束后保护 {rules['protectionSecondsAfterPreparation']} 秒"
        if rules['protectionSecondsAfterPreparation'] else '准备结束后无保护'
    )
    values = [
        ('对战人数', f"{rules['teamSize']}v{rules['teamSize']}，{rules['humanPlayers']} 名玩家与 {summary['bots']} 个机器人"),
        ('比赛结束', match_end),
        ('换边', f"完成第 {rules['roundsBeforeSideSwap']} 回合后交换攻守"),
        ('回合准备', f"{rules['preparationSeconds']} 秒"),
        ('未安包阶段', f"{rules['roundSeconds']} 秒"),
        ('安包后炸弹倒计时', f"{rules['bombSeconds']} 秒"),
        ('连续安包交互', f"{rules['plantSeconds']} 秒"),
        ('连续拆包交互', f"{rules['defuseSeconds']} 秒"),
        ('回合结算', f"{rules['resultSeconds']} 秒"),
        ('交互距离', f"拆包 {rules['defuseMaxDistanceMeters']} 米，拾取 C4 {rules['pickupMaxDistanceMeters']} 米；均须无遮挡"),
        ('队友伤害', f'{friendly_fire}；高爆自伤{self_damage}'),
        ('拆弹钳', '无，统一拆包时间'),
        ('出生', f"生命 {rules['healthAtRoundStart']}、护甲 {rules['armorAtRoundStart']}；{protection}"),
    ]
    bomb_rows = ['| 参数 | 项目默认值 |', '| --- | --- |']
    bomb_rows.extend(f'| {name} | {value} |' for name, value in values)
    category_counts = '、'.join(
        f"{name} {summary['equipmentByCategory'].get(category, 0)}"
        for category, name in CATEGORY_NAMES.items()
    )
    calculations = [
        f"- 背包：{summary['backpackCount']} 个，每个 {summary['slotCountPerBackpack']} 槽。",
        f"- 最终装备：{summary['equipmentTotal']} 件，分类数量为{category_counts}。",
        f"- 基线已存在 {summary['existingEquipment']} 件，计划新增 {summary['plannedEquipment']} 件。",
        f"- 爆破人数：{rules['teamSize']} × 2 = {summary['participants']}；机器人：{summary['participants']} − {rules['humanPlayers']} = {summary['bots']}。",
        f"- 单回合活跃时间保守上界：{rules['roundSeconds']} + {rules['bombSeconds']} = {summary['activeRoundUpperSeconds']} 秒。",
        f"- 整场保守上界：{rules['maxRounds']} × ({rules['preparationSeconds']} + {summary['activeRoundUpperSeconds']} + {rules['resultSeconds']}) = {summary['matchUpperSecondsExcludingPauseAndMenus']} 秒，即 {summary['matchUpperMinutes']} 分 {summary['matchUpperRemainingSeconds']} 秒。",
        '- 运行：`python3 cf-transport-ship/docs/calculate-design.py`，保留计算公式和 JSON 输出。',
    ]
    profile_json = json.dumps(default_profile(data), ensure_ascii=False, indent=2)
    return {
        'equipment-table': '\n'.join(equipment_rows),
        'profile-example': f'```json\n{profile_json}\n```',
        'bomb-defaults': '\n'.join(bomb_rows),
        'calculations': '\n'.join(calculations),
    }


def refresh_document(document, sections):
    for name, content in sections.items():
        start = f'<!-- {name}:start -->'
        end = f'<!-- {name}:end -->'
        if document.count(start) != 1 or document.count(end) != 1:
            raise ValueError(f'设计文档生成标记缺失或重复：{name}')
        left, rest = document.split(start, 1)
        _, right = rest.split(end, 1)
        document = f'{left}{start}\n\n{content}\n\n{end}{right}'
    return document


if __name__ == '__main__':
    directory = Path(__file__).resolve().parent
    data = json.loads((directory / 'design-data.json').read_text(encoding='utf-8'))
    validate(data)
    summary = calculate(data)
    output = json.dumps(summary, ensure_ascii=False, indent=2) + '\n'
    document_path = directory / 'game-design.md'
    document = refresh_document(
        document_path.read_text(encoding='utf-8'), render_sections(data, summary)
    )
    (directory / 'design-summary.json').write_text(output, encoding='utf-8')
    document_path.write_text(document, encoding='utf-8')
    print(output, end='')
