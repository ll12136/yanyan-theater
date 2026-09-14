import { GameAction } from '../input/actionMapper';

/** 剧情状态：可解释的助眠指标 + 当前进度 */
export interface StoryState {
  /** 助眠指标（动作自然累积）。页面上分别写「放松 / 接纳 / 陪伴」 */
  courage: number; // 放松：松开一点压力
  acceptance: number; // 接纳：接纳睡不着、接纳今天没做成什么
  empathy: number; // 陪伴：被知乎上真实的人陪着
  curiosity: number; // 看清一点
  supportGiven: number; // 给予的支持
  /** 当前进度 */
  currentTroubleId: string | null;
  currentSampleId: string | null;
  currentSceneIndex: number;
  /** 动作历史 */
  actions: GameAction[];
  /** 收藏的样本 id */
  savedSamples: string[];
  /** 拥抱过的知乎内容 id（同一个内容只计一次） */
  huggedVoices: string[];
}

export function createInitialState(): StoryState {
  return {
    courage: 0,
    acceptance: 0,
    empathy: 0,
    curiosity: 0,
    supportGiven: 0,
    currentTroubleId: null,
    currentSampleId: null,
    currentSceneIndex: 0,
    actions: [],
    savedSamples: [],
    huggedVoices: []
  };
}
