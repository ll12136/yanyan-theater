/**
 * 刘看山动画清单 —— 由 tools/build-kanshan-sprites.py 从官方素材包（刘看山动态.zip）生成，请勿手改。
 *
 * 官方素材是 320×320 / 20fps 的透明 GIF，Phaser 不能直接播放 GIF，
 * 因此构建脚本把它们切成等距网格精灵图（每帧同尺寸），这里只记录网格参数。
 * 每张图 1 像素对应源素材 1.818 像素（所有动画共用同一比例，身高一致）。
 */

export type KanshanAnimKey = 'idle' | 'greet' | 'wander' | 'desk' | 'sleepy' | 'dribble';

export interface KanshanAnimSpec {
  /** Phaser 纹理键与动画键 */
  key: KanshanAnimKey;
  /** 中文动作名，仅用于注释与调试 */
  label: string;
  /** public/assets/kanshan/ 下的文件名 */
  file: string;
  /** 官方素材包里的原始 GIF 名 */
  source: string;
  frameWidth: number;
  frameHeight: number;
  /** 精灵图列数；行数由帧数推出 */
  cols: number;
  frames: number;
  /** 播放帧率（源素材 20fps，抽帧后降低） */
  fps: number;
}

export const KANSHAN_ANIMS: Record<KanshanAnimKey, KanshanAnimSpec> = {
  idle: {
    key: 'idle',
    label: '待机',
    file: 'idle.png',
    source: '待机_5秒_320x320_20fps_透明.gif',
    frameWidth: 150,
    frameHeight: 176,
    cols: 8,
    frames: 50,
    fps: 10
  },
  greet: {
    key: 'greet',
    label: '打招呼',
    file: 'greet.png',
    source: '打招呼_4秒_320x320_20fps_透明.gif',
    frameWidth: 150,
    frameHeight: 176,
    cols: 8,
    frames: 80,
    fps: 20
  },
  wander: {
    key: 'wander',
    label: '晃悠',
    file: 'wander.png',
    source: '晃悠_320x320_3秒_20fps_透明.gif',
    frameWidth: 150,
    frameHeight: 176,
    cols: 8,
    frames: 60,
    fps: 20
  },
  desk: {
    key: 'desk',
    label: '电脑',
    file: 'desk.png',
    source: '电脑_6秒_320x320_20fps_透明.gif',
    frameWidth: 150,
    frameHeight: 176,
    cols: 8,
    frames: 60,
    fps: 10
  },
  sleepy: {
    key: 'sleepy',
    label: '瞌睡',
    file: 'sleepy.png',
    source: '瞌睡_5秒_320x320_20fps_透明.gif',
    frameWidth: 150,
    frameHeight: 176,
    cols: 8,
    frames: 50,
    fps: 10
  },
  dribble: {
    key: 'dribble',
    label: '运球',
    file: 'dribble.png',
    source: '运球_4秒_320x320_20fps_透明.gif',
    frameWidth: 150,
    frameHeight: 176,
    cols: 8,
    frames: 80,
    fps: 20
  },
};

/** 全部动画键，供「按需加载」时取默认值。 */
export const KANSHAN_ANIM_KEYS = Object.keys(KANSHAN_ANIMS) as KanshanAnimKey[];

/** 实际渲染高度（设计空间 960×640 里的像素，含头顶留白；角色本体约 120px）。 */
export const KANSHAN_DISPLAY_HEIGHT = 144;

/** 精灵图缩放比：帧像素 → 设计空间像素。 */
export const KANSHAN_SPRITE_SCALE = KANSHAN_DISPLAY_HEIGHT / KANSHAN_ANIMS.idle.frameHeight;
