import { GameAction } from '../input/actionMapper';

// ============ 类型定义 ============

export interface Trouble {
  id: string;
  category: string;
  categoryLabel: string;
  text: string;
  similarCount: number;
  keywords: string[];
  sampleId: string;
  storyId: string;
}

export interface Sample {
  id: string;
  title: string;
  personName: string;
  age: string;
  content: string;
  sourceTitle: string;
  author: string;
  voteCount: number;
  sourceUrl: string;
}

export interface EffectValue {
  courage?: number;
  acceptance?: number;
  empathy?: number;
  curiosity?: number;
}

export interface StorySceneNode {
  id: string;
  text: string;
  prompt: string;
  action: GameAction;
  optionA: { label: string; effect: EffectValue };
  optionB: { label: string; effect: EffectValue };
}

export interface LocalStory {
  id: string;
  title: string;
  opening: string;
  scenes: StorySceneNode[];
}

export interface Ending {
  id: string;
  title: string;
  text: string;
  advice: string;
  shareText: string;
}

// ============ 动作 → 属性效果 ============
// 这一版的产品是「看山问你，睡了吗？」：四个动作的名字与键位不变，意思换成助眠语境。
//   courage（页面写「放松」）   —— 挥剑斩开今晚的纠结，松下来；也记「让身体动一动」
//   acceptance（页面写「接纳」）—— 接纳自己睡不着、接纳自己今天没做成什么
//   empathy（页面写「陪伴」）   —— 被知乎上真实的人陪着
// 「歇一会」原来是 courage-1（躲开就是没勇气），在睡眠这件事上是反的：
// 躺下歇着本来就是入睡该做的事，所以改成接纳 +2。

export const ACTION_EFFECTS: Record<string, EffectValue> = {
  slash: { courage: 2 },
  hug: { acceptance: 2, empathy: 2 },
  nod: { acceptance: 1, empathy: 1 },
  dodge: { acceptance: 2 },
  investigate: { curiosity: 1, empathy: 2 }
};

// ============ 今夜的心事（6 个睡眠主题） ============

export const TROUBLES: Record<string, Trouble> = {
  cantfall: {
    id: 'cantfall',
    category: 'cantfall',
    categoryLabel: '入睡困难',
    text: '一躺下就清醒，脑子里全是白天没做完的事',
    similarCount: 3187,
    keywords: ['失眠', '睡不着', '入睡', '脑子停不下来', '清醒'],
    sampleId: 'sample-cantfall',
    storyId: 'story-cantfall'
  },
  phone: {
    id: 'phone',
    category: 'phone',
    categoryLabel: '熬夜放不下手机',
    text: '明明已经很困，还是一直刷到凌晨两三点',
    similarCount: 4026,
    keywords: ['熬夜', '晚睡', '刷手机', '作息', '放下手机'],
    sampleId: 'sample-phone',
    storyId: 'story-phone'
  },
  pressure: {
    id: 'pressure',
    category: 'pressure',
    categoryLabel: '压力压着睡不着',
    text: '明天的事一直压着，闭上眼就开始想最坏的结果',
    similarCount: 3562,
    keywords: ['压力', '焦虑', '紧张', '内耗', '工作'],
    sampleId: 'sample-pressure',
    storyId: 'story-pressure'
  },
  sitting: {
    id: 'sitting',
    category: 'sitting',
    categoryLabel: '白天不动，晚上不困',
    text: '白天坐了一整天，晚上躺下一点都不困',
    similarCount: 1748,
    keywords: ['久坐', '缺乏运动', '不困', '没精神', '运动'],
    sampleId: 'sample-sitting',
    storyId: 'story-sitting'
  },
  replay: {
    id: 'replay',
    category: 'replay',
    categoryLabel: '一闭眼就复盘今天',
    text: '躺下就开始回想白天说错的那几句话',
    similarCount: 2293,
    keywords: ['复盘', '后悔', '反刍', '纠结', '想太多'],
    sampleId: 'sample-replay',
    storyId: 'story-replay'
  },
  pileup: {
    id: 'pileup',
    category: 'pileup',
    categoryLabel: '心事堆在一起',
    text: '好多小事堆着没处理，一闭眼全都浮上来',
    similarCount: 2611,
    keywords: ['心事', '烦躁', '委屈', '压抑', '说不出口'],
    sampleId: 'sample-pileup',
    storyId: 'story-pileup'
  }
};

export const TROUBLE_LIST: Trouble[] = Object.values(TROUBLES);

// ============ 本地示例素材（不是知乎内容，也不对外署名知乎） ============
// 用途只有两个：剧情生成失败时兜底、以及「我的故事集」里的本地收藏。
// 三个声音那一页一律改用知乎接口的真实内容，不再引用这里的文案。

export const SAMPLES: Record<string, Sample> = {
  'sample-cantfall': {
    id: 'sample-cantfall',
    title: '躺了四十分钟还没睡着，我改了这件事',
    personName: '小满',
    age: '24 岁',
    content:
      '我以前一躺下就开始检查：今天哪句话说得不好、明天还有什么没做完。后来我不再逼自己睡着，只做一件很小的事——把肩膀放下来，慢慢呼吸。睡着是它自己的事，我能做的是先松开一点。',
    sourceTitle: '躺了四十分钟还没睡着，我改了这件事',
    author: '本地示例',
    voteCount: 0,
    sourceUrl: ''
  },
  'sample-phone': {
    id: 'sample-phone',
    title: '把手机放到客厅以后',
    personName: '阿泽',
    age: '27 岁',
    content:
      '我熬夜不是不困，是舍不得把这一天关掉。后来我把充电器搬到了客厅，躺下之前手机不在手边。头两天很难受，第三天开始，我居然能在十二点前睡着。',
    sourceTitle: '把手机放到客厅以后',
    author: '本地示例',
    voteCount: 0,
    sourceUrl: ''
  },
  'sample-pressure': {
    id: 'sample-pressure',
    title: '把明天的事写在纸上，才睡着',
    personName: '林静',
    age: '31 岁',
    content:
      '闭上眼就是明天的会议和最坏的结果。有人教我睡前把要做的事一条条写下来，写完就不必再记在脑子里。纸上放着，人就松了一点，也才睡得进去。',
    sourceTitle: '把明天的事写在纸上，才睡着',
    author: '本地示例',
    voteCount: 0,
    sourceUrl: ''
  },
  'sample-sitting': {
    id: 'sample-sitting',
    title: '白天走够八千步，晚上才困',
    personName: '周野',
    age: '29 岁',
    content:
      '我是从工位到床上的两点一线，晚上躺下毫无睡意。后来中午和傍晚各出去走二十分钟，白天的身体动过了，晚上才真的会困。原来睡意是白天攒出来的。',
    sourceTitle: '白天走够八千步，晚上才困',
    author: '本地示例',
    voteCount: 0,
    sourceUrl: ''
  },
  'sample-replay': {
    id: 'sample-replay',
    title: '我不再在深夜审判自己',
    personName: '陈屿',
    age: '26 岁',
    content:
      '一闭眼就回放白天说错的话，越想越清醒。后来我给自己定了一句：这件事明天再想，明天的我比现在的我更有力气。说完真的能松下来。',
    sourceTitle: '我不再在深夜审判自己',
    author: '本地示例',
    voteCount: 0,
    sourceUrl: ''
  },
  'sample-pileup': {
    id: 'sample-pileup',
    title: '把心事说出来那一晚，我睡得很好',
    personName: '何一',
    age: '28 岁',
    content:
      '我把攒了很久的委屈跟朋友说了一遍，她没劝我，只说"听起来真的不容易"。那一晚我躺下之后，脑子里没有东西再浮上来了。心事说出来，就不用半夜一个人扛。',
    sourceTitle: '把心事说出来那一晚，我睡得很好',
    author: '本地示例',
    voteCount: 0,
    sourceUrl: ''
  }
};

// ============ 本地故事（AI 降级用，每个三幕 + 统一追加的两幕） ============
// 每一幕都给两条路，方向固定：A 先松开一点压力，B 让身体动一动。
// 这两条也是整部作品的立场——睡不着的时候，硬躺着不如松一松、动一动。

export const LOCAL_STORIES: Record<string, LocalStory> = {
  'story-cantfall': {
    id: 'story-cantfall',
    title: '凌晨两点的清醒',
    opening: '小满躺了四十分钟，眼睛越闭越亮。白天没回完的消息、没做完的事，一条一条浮上来。',
    scenes: [
      {
        id: 'scene-1',
        text: '小满把手机扣在床头，翻了个身。她越想快点睡着，心跳得越快。',
        prompt: '今晚，先做哪一件？',
        action: 'nod',
        optionA: { label: '慢慢呼吸，先把肩膀放下来', effect: { acceptance: 2 } },
        optionB: { label: '起身走两步，再回来躺下', effect: { courage: 2 } }
      },
      {
        id: 'scene-2',
        text: '她不数羊，也不逼自己睡着，只把注意力放回呼吸上。窗外的车声在，她没有再和它较劲。',
        prompt: '此刻，陪她一会儿。',
        action: 'hug',
        optionA: { label: '告诉她睡不着也没关系', effect: { empathy: 2, acceptance: 1 } },
        optionB: { label: '陪她做一次深呼吸', effect: { empathy: 1, acceptance: 1 } }
      },
      {
        id: 'scene-3',
        text: '不知道过了多久，她自己也没发觉是什么时候睡着的。醒来时天刚亮，窗外有鸟叫。',
        prompt: '面对这样的夜晚，你会……',
        action: 'slash',
        optionA: { label: '接纳自己的节奏', effect: { acceptance: 2 } },
        optionB: { label: '明天白天让身体动一动', effect: { courage: 2 } }
      }
    ]
  },
  'story-phone': {
    id: 'story-phone',
    title: '手机亮着的那一夜',
    opening: '阿泽困得眼睛发涩，手指还在往下滑。他说：再看五分钟，就五分钟。',
    scenes: [
      {
        id: 'scene-1',
        text: '屏幕的光打在脸上，时间从十二点滑到两点。他舍不得把这一天关掉。',
        prompt: '你会怎么做？',
        action: 'nod',
        optionA: { label: '把手机放到房间外面去', effect: { courage: 2 } },
        optionB: { label: '先松开手，做三次深呼吸', effect: { acceptance: 2 } }
      },
      {
        id: 'scene-2',
        text: '他起身把充电线拔了，手机留在了客厅。回到床上，房间第一次这么安静。',
        prompt: '此刻，陪陪他。',
        action: 'hug',
        optionA: { label: '夸他做到了这一步', effect: { courage: 2 } },
        optionB: { label: '陪他躺一会儿，什么都不做', effect: { empathy: 2 } }
      },
      {
        id: 'scene-3',
        text: '头两天很难受，第三天开始，他居然能在十二点前睡着。白天也没有那么飘了。',
        prompt: '面对放不下的手机，你会……',
        action: 'slash',
        optionA: { label: '把睡前这段时间留给自己', effect: { acceptance: 2 } },
        optionB: { label: '白天多走一走，晚上才困', effect: { courage: 2 } }
      }
    ]
  },
  'story-pressure': {
    id: 'story-pressure',
    title: '明天压着今夜',
    opening: '林静闭上眼就是明天的会议。她在心里把最坏的结果演了三遍。',
    scenes: [
      {
        id: 'scene-1',
        text: '越想越清醒，胸口发紧。她翻身看了看时间，又躺回去继续想。',
        prompt: '今夜，先松开哪一处？',
        action: 'nod',
        optionA: { label: '把明天要做的事写下来', effect: { acceptance: 2 } },
        optionB: { label: '下床伸个懒腰，走两分钟', effect: { courage: 2 } }
      },
      {
        id: 'scene-2',
        text: '她摸黑在纸上写了三行字，写完把纸放在桌上。纸替她记着，她就不必再记了。',
        prompt: '此刻，给她一点支持。',
        action: 'hug',
        optionA: { label: '告诉她明天再说也来得及', effect: { empathy: 2, acceptance: 1 } },
        optionB: { label: '认可她停下来的这一步', effect: { acceptance: 2 } }
      },
      {
        id: 'scene-3',
        text: '那晚她没有立刻睡着，但心里那只一直往最坏处跑的手，终于慢了下来。',
        prompt: '面对压力，你会……',
        action: 'slash',
        optionA: { label: '把它留在明天', effect: { acceptance: 2 } },
        optionB: { label: '先让身体动一动', effect: { courage: 2 } }
      }
    ]
  },
  'story-sitting': {
    id: 'story-sitting',
    title: '白天坐了一整天',
    opening: '周野的一天是从工位到床上。躺下的时候，身体和脑子都还醒着。',
    scenes: [
      {
        id: 'scene-1',
        text: '他说自己很累，可一躺下毫无睡意。原来那不是困，是坐了一整天的僵。',
        prompt: '你会怎么做？',
        action: 'nod',
        optionA: { label: '先起来拉伸一下肩颈', effect: { courage: 2 } },
        optionB: { label: '靠着床头，慢慢松一口气', effect: { acceptance: 2 } }
      },
      {
        id: 'scene-2',
        text: '第二天中午，他下楼走了二十分钟。回来后出了一点汗，人反而清爽了。',
        prompt: '为这一点改变高兴。',
        action: 'hug',
        optionA: { label: '陪他把这件事坚持下去', effect: { empathy: 2 } },
        optionB: { label: '认可这二十分钟的价值', effect: { courage: 2 } }
      },
      {
        id: 'scene-3',
        text: '一周后他发现：白天动过，晚上才真的会困。睡意原来是白天攒出来的。',
        prompt: '面对身体的疲惫，你会……',
        action: 'slash',
        optionA: { label: '听懂身体的信号', effect: { acceptance: 2 } },
        optionB: { label: '每天都动一动', effect: { courage: 2 } }
      }
    ]
  },
  'story-replay': {
    id: 'story-replay',
    title: '深夜的审判庭',
    opening: '陈屿一闭上眼，白天的画面就开始一帧一帧地回放。',
    scenes: [
      {
        id: 'scene-1',
        text: '那句话是不是说错了？他是不是不高兴了？他躺在床上，把白天又过了两遍。',
        prompt: '今夜，怎么停下来？',
        action: 'nod',
        optionA: { label: '告诉自己：这件事明天再想', effect: { acceptance: 2 } },
        optionB: { label: '起身喝口水，打断这个循环', effect: { courage: 2 } }
      },
      {
        id: 'scene-2',
        text: '他给自己定了规矩：深夜不做任何审判。明天的他比现在的他更有力气。',
        prompt: '此刻，陪陪他。',
        action: 'hug',
        optionA: { label: '告诉他不必每晚都审判自己', effect: { empathy: 2, acceptance: 1 } },
        optionB: { label: '安静地陪他躺一会儿', effect: { empathy: 2 } }
      },
      {
        id: 'scene-3',
        text: '那晚他还是想了几分钟，但他没有再往回翻。想不通的，就先放在明天。',
        prompt: '面对反复回想的自己，你会……',
        action: 'slash',
        optionA: { label: '允许自己不想明白', effect: { acceptance: 2 } },
        optionB: { label: '把注意力挪到身体上', effect: { courage: 2 } }
      }
    ]
  },
  'story-pileup': {
    id: 'story-pileup',
    title: '心事堆到天亮',
    opening: '何一有很多小事没说出口。到了夜里，它们一起浮了上来。',
    scenes: [
      {
        id: 'scene-1',
        text: '没回的那条消息、被误解的那句解释、说不出口的委屈，全挤在关灯之后。',
        prompt: '今夜，先放下哪一件？',
        action: 'nod',
        optionA: { label: '挑一件写下来，写完合上本子', effect: { acceptance: 2 } },
        optionB: { label: '起来走两圈，让心慢一点', effect: { courage: 2 } }
      },
      {
        id: 'scene-2',
        text: '第二天她把攒了很久的委屈讲给朋友听。朋友没劝她，只说"听起来真的不容易"。',
        prompt: '为这份被听见高兴。',
        action: 'hug',
        optionA: { label: '拥抱这句"不容易"', effect: { empathy: 2, acceptance: 1 } },
        optionB: { label: '认可她开口的勇气', effect: { courage: 2 } }
      },
      {
        id: 'scene-3',
        text: '那一晚她躺下之后，脑子里没有东西再浮上来了。心事说出来，就不用半夜一个人扛。',
        prompt: '面对说不出口的心事，你会……',
        action: 'slash',
        optionA: { label: '允许它慢慢被说出来', effect: { acceptance: 2 } },
        optionB: { label: '先找一个人陪着', effect: { empathy: 2 } }
      }
    ]
  }
};

// 让本地降级剧情也保留“停下来 / 被接住 / 再选择”的完整节奏，每个主题五幕。
for (const story of Object.values(LOCAL_STORIES)) {
  const subject = story.title;
  story.scenes.push(
    {
      id: `${story.id}-scene-4`,
      text: `夜深了一层，《${subject}》里的那个人把手机放到一边，终于听见了自己的呼吸。还是没睡着，但心里没有刚才那么紧了。`,
      prompt: '此刻，你想给自己什么？',
      action: 'investigate',
      optionA: { label: '把灯调暗，留一点安静', effect: { acceptance: 2, curiosity: 1 } },
      optionB: { label: '起身走两步，再躺回来', effect: { courage: 1, curiosity: 1 } }
    },
    {
      id: `${story.id}-scene-5`,
      text: '看山把一杯温水推到你面前：今晚先到这儿。所谓睡个好觉，不一定是马上睡着，也可以是先松开一点压力，再让身体动一动。',
      prompt: '把这一点温柔带走。',
      action: 'hug',
      optionA: { label: '抱一抱今晚的自己', effect: { acceptance: 2, empathy: 2 } },
      optionB: { label: '答应自己明天动一动', effect: { courage: 2, empathy: 1 } }
    }
  );
}

// ============ 结局（4 种） ============

export const ENDINGS: Record<string, Ending> = {
  brave_start: {
    id: 'brave_start',
    title: '今夜松开了',
    text: '你没有硬躺着。你先松开了手，又让身体动了一动。睡意不是被追来的，是它自己找上门的。',
    advice: '睡不着的时候别硬躺：先松一点，再动一动。',
    shareText: '我在「看山问你，睡了吗？」获得了「今夜松开了」——睡意是自己找上门的。'
  },
  gentle_harbor: {
    id: 'gentle_harbor',
    title: '允许自己躺着',
    text: '你允许自己今晚什么都没做成。不急着睡着，先让自己舒服一点——这本身就是入睡的第一步。',
    advice: '不睡着也没关系，先让自己舒服一点。',
    shareText: '我在「看山问你，睡了吗？」获得了「允许自己躺着」——睡不着，也可以先歇着。'
  },
  accompany: {
    id: 'accompany',
    title: '有人陪着',
    text: '你把温柔给了别人，也被知乎上真实的声音接住了一次。心事说出来，就不用半夜一个人扛。',
    advice: '说出来，比一个人扛到天亮更容易睡着。',
    shareText: '我在「看山问你，睡了吗？」获得了「有人陪着」——心事说出来，夜里就没那么长。'
  },
  still_seeking: {
    id: 'still_seeking',
    title: '还在调整',
    text: '今晚也许还是睡不着。但你已经知道明天可以怎么试了——这比强迫自己闭眼有用得多。',
    advice: '不用今晚就解决。明天先松开一点，再动一动。',
    shareText: '我在「看山问你，睡了吗？」获得了「还在调整」——慢慢来，夜里的事急不得。'
  }
};

// ============ 结局判定 ============

export function pickEnding(state: {
  courage: number;
  acceptance: number;
  empathy: number;
}): Ending {
  if (state.courage >= 5 && state.acceptance >= 3) return ENDINGS.brave_start;
  if (state.acceptance >= 6) return ENDINGS.gentle_harbor;
  if (state.empathy >= 6) return ENDINGS.accompany;
  return ENDINGS.still_seeking;
}
