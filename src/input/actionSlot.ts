import { GameAction } from './actionMapper';
export type Slot='A'|'B';
/**
 * 动作 → 槽位，全局唯一、永不更改（哪一幕都不得违反）。
 *
 * ⚠️ 现状（本轮）：这个模块**目前没有接进剧情页**。
 * 选项改成「选中 → 确认」两段式之后，选路由 ←/→ 或点卡片完成；
 * 身体动作（M/X/鼠标左键/下压）只做「给自己的回应」，不参与选路——
 * 否则体感设备的手势会不请自来地替玩家做选择（这一轮修掉的正是这个毛病）。
 * 下面的槽位规则仍然是对硬件映射的正式说明，要重新接回剧情页时以它为准。
 *
 * 硬件映射以 MoveToPlay 为准（main/app_main.c:1140-1143）：
 *   左手抬起 → 按 M      右手抬起 → 按 X      右手挥砍 → 鼠标左键连点
 * 经 actionMapper 之后：
 *   左手抬起 = hug        右手抬起 = nod        右手挥砍 = slash
 *
 * 所以按「左手抬起永远是选项1」这条规则：
 *   A 槽（选项1）：hug（左手抬起）、slash（右手挥砍）
 *   B 槽（选项2）：nod（右手抬起）、dodge（下压 F）
 */
export const ACTION_SLOT: Partial<Record<GameAction,Slot>>={hug:'A',slash:'A',nod:'B',dodge:'B'};
export const SLOT_ROLE={A:'hold',B:'move'} as const;

/** 一幕的两个选项各自对应哪个身体动作 */
export interface ActActions { slotA: GameAction; slotB: GameAction }

/**
 * 按幕轮换：**换动作词汇，不换槽位语义**。
 *   第一幕 双手抬起（左手=M / 右手=X）
 *   第二幕 右手挥砍（鼠标左键）/ 下压（F）
 *   第三幕 左手抬起（M）/ 下压（F）
 * 换幕时两个动作都换掉，玩家看界面就知道这一幕该做什么；
 * 但每个动作永远只在它自己的槽位里出现（hug 永远是选项1，nod 永远是选项2，…）。
 */
export const ACT_ACTION_ROTATION: readonly ActActions[] = [
  { slotA: 'hug', slotB: 'nod' },
  { slotA: 'slash', slotB: 'dodge' },
  { slotA: 'hug', slotB: 'dodge' }
];

/** 第 sceneIndex 幕用哪两个动作。槽位语义由 ACTION_SLOT 保证，这里只挑动作词汇。 */
export function actActionsOf(sceneIndex: number): ActActions {
  const i = Math.max(0, Math.floor(sceneIndex)) % ACT_ACTION_ROTATION.length;
  return ACT_ACTION_ROTATION[i];
}
