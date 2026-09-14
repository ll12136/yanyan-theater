import { StoryEngine } from './story/storyEngine';
import { ApiClient, ZhihuVoice } from './ai/apiClient';
import { Trouble } from './story/storyData';

/** 走完一程留下的记录，可以在结局页收进「我的故事集」 */
export interface JournalEntry {
  id: string;
  /** 本地时间，形如 2026/9/13 15:20 */
  at: string;
  trouble: string;
  storyTitle: string;
  /** 剧情素材的来源说明（改编自知乎某条内容，或本地示例剧情） */
  credit: string;
  endingTitle: string;
  advice: string;
  /** 给自己的回应次数，以及各动作的次数分布说明 */
  responses: number;
  responseMix: string;
  /** 玩家写给自己的那句话 */
  note: string | null;
  /** 这一程陪伴过的知乎声音 */
  voices: { author: string; title: string; sourceLabel: string }[];
}

/** 跨场景共享的全局状态 */
export const store = {
  engine: new StoryEngine(),
  api: new ApiClient(),
  /** AI 生成的剧情 JSON（null 表示失败/未调用，走本地故事） */
  aiStory: null as Record<string, unknown> | null,
  /**
   * 上一次没来得及用的改编剧情，留给下一局直接用。
   * 之所以要它：改编必须在开演前定下来，否则就会把玩家正在读的故事整个换掉；
   * 模型偶尔慢过等待上限，那一次的成果存这儿，下一局直接拿来用，不浪费。
   */
  cachedAiStory: null as { trouble: string | null; story: Record<string, unknown> } | null,
  /** 真实知乎烦恼（从知识列表拉取，null 表示未加载） */
  realTroubles: null as Trouble[] | null,
  /** 当前选中的真实烦恼文本 */
  realTroubleText: null as string | null,
  /**
   * 玩家实际点中的那张心事卡。
   * 知乎热议卡没有本地剧情，引擎里只能退回「入睡困难」这一条占位，
   * 所以署名与「我的故事集」必须看这里，否则会把玩家的心事写成另一件。
   */
  selectedTrouble: null as Trouble | null,
  /** 当前选中的真实样本正文（盐言故事） */
  realSampleText: null as string | null,
  /** 这一程的三个声音（知乎真实内容）；剧情页的署名与结局页的来源都用它 */
  realVoices: null as ZhihuVoice[] | null,
  /** 剧情页的素材来源说明：改编自知乎某条内容，或本地示例剧情 */
  storyCredit: null as string | null,
  /** 剧情页当前这一幕所属的故事名，供结局页回顾使用 */
  storyTitle: null as string | null,
  /** 玩家在剧情结尾写给自己的那句话（可为空） */
  selfNote: null as string | null,
  /**
   * 结算时留下的那一句「过来人的话」（来自知乎真实回答，一字不改）。
   * 有它就在结局回顾里给玩家看，没有就不显示——不用本地文案顶替。
   */
  keptEncouragement: null as { quote: string; author: string; sourceUrl: string } | null,
  /** 本次会话里收进「我的故事集」的旅程（不落盘，刷新即清空） */
  journals: [] as JournalEntry[]
};
