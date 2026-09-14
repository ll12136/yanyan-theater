// 统一游戏动作抽象。体感设备输出标准键鼠事件，游戏逻辑只感知这些动作。

export type GameAction =
  | 'slash' // 挥剑斩开今晚的纠结
  | 'hug' // 拥抱
  | 'nod' // 点头
  | 'dodge' // 躲避/下蹲
  | 'investigate' // 调查/交互
  | 'selectA' // 选中左边这条路
  | 'selectB' // 选中右边这条路
  | 'confirm' // 确认这条路，故事才往下走
  | 'move'; // 探索场景移动

export interface ActionMapping {
  /** 体感设备映射到 Phaser 的键名；MOUSE_LEFT 支持实体剑/鼠标备用输入 */
  keys: string[];
  /** 冷却时间（毫秒），防止一次体感动作触发多次剧情 */
  cooldownMs: number;
  /** 是否允许重复触发（持续动作如 move 不受冷却限制） */
  continuous?: boolean;
}

export const ACTION_MAP: Record<GameAction, ActionMapping> = {
  slash: { keys: ['MOUSE_LEFT', 'J'], cooldownMs: 550 },
  hug: { keys: ['M', 'H'], cooldownMs: 1200 },
  nod: { keys: ['X', 'N'], cooldownMs: 800 },
  dodge: { keys: ['F', 'SPACE'], cooldownMs: 800 },
  investigate: { keys: ['E'], cooldownMs: 900 },
  // MoveToPlay 默认把 M/X 分别输出为左右抬手，所以选项不再占用 M/X：
  // 键鼠玩家用左右方向键选路，体感玩家直接点选项卡片。
  //
  // 这里**故意不再绑定 1 / 2**：体感 dongle 的「双手交叉额头」是
  // ACTION_TYPE_CHARACTER_CYCLE，每做一次手势就依次敲下 1、2、3、4
  // （MoveToPlay/main/app_main.c:1134, 2131-2142）。
  // 绑在数字键上的话，玩家只要交叉一下手，第一幕还没选就被推走了。
  selectA: { keys: ['LEFT'], cooldownMs: 700 },
  selectB: { keys: ['RIGHT'], cooldownMs: 700 },
  // 确认与「选」分开：选中只是点亮一条路，按确认才换幕
  confirm: { keys: ['ENTER'], cooldownMs: 700 },
  move: { keys: ['W', 'A', 'S', 'D', 'UP', 'DOWN', 'LEFT', 'RIGHT'], cooldownMs: 0, continuous: true }
};

export const ACTION_LABELS: Record<GameAction, string> = {
  slash: '挥剑',
  hug: '拥抱',
  nod: '点头',
  dodge: '躲避',
  investigate: '调查',
  selectA: '选中左边这条路',
  selectB: '选中右边这条路',
  confirm: '确认往下走',
  move: '移动'
};

/** 人类可读的动作键位提示（用于 UI） */
export const ACTION_HINTS: Record<GameAction, string> = {  slash: '鼠标左键 / J',
  hug: 'M / H',
  nod: 'X / N',
  dodge: 'F 下压 / 空格跳跃',
  investigate: 'E',
  selectA: '点击左侧选项 / ←',
  selectB: '点击右侧选项 / →',
  confirm: 'Enter 确认',
  move: 'W/A/S/D'
};

/**
 * 每个动作对应的身体手势（以 MoveToPlay 为准，见 MoveToPlay/main/app_main.c:1140-1148）。
 * 用途：在选项卡片上直接告诉玩家「选这个要用什么动作」，不让玩家猜。
 *   左手抬起→M→hug    右手抬起→X→nod    右手挥砍→鼠标左键→slash    下压→F→dodge
 */
export const ACTION_GESTURES: Partial<Record<GameAction, string>> = {
  hug: '左手抬起',
  nod: '右手抬起',
  slash: '右手挥砍',
  dodge: '下压',
  investigate: '踢',
  move: '行走'
};
