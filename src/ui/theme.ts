import Phaser from 'phaser';

/**
 * 夜深紫、月光金与薄荷绿。
 *
 * 全站是深色主题：背景是一层暗紫（夜里没开灯的天色），文字是浅薰衣草，
 * 卡片只比背景亮一档——它得看起来像「压得住字的一块表面」，而不是一张白纸。
 * 深色底上不能再用深色字，所以 text / muted / faint 是由亮到暗的三层浅色。
 */
export const THEME = {
  bg: 0x1e1730, // 暗紫背景
  bg2: 0x171126, // 更深的紫：幕间呼吸那一层、需要把画面压下去的地方
  paper: 0x2b2144, // 卡片表面：比背景亮一档
  text: 0xf2edfb, // 正文：浅薰衣草
  muted: 0xc4b9dd, // 次要说明
  faint: 0x9184b0, // 最弱的提示（键位、页脚）
  line: 0x4a3f6b, // 分隔线、网格点、卡片描边
  warm: 0xe5b567, // 月光金：强调、选中、可点的东西
  warm2: 0xf5d08a, // 更亮的金
  warmSoft: 0x4a3a26, // 暗金：暖光晕的底色
  green: 0x86d6b4, // 薄荷绿：安静的语气色（回声、结局）
  greenSoft: 0x2f4a44, // 薄荷绿的暗面
  blue: 0x8fb0ff, // 知乎蓝（深色底上提亮）
  /** 落在暖色 / 绿色按钮上的字色 */
  onAccent: 0x1e1730
} as const;

/** 颜色转 CSS 字符串（用于 Text.setColor） */
export function css(hex: number): string {
  return '#' + hex.toString(16).padStart(6, '0');
}

/** 画一个圆角矩形 Graphics 对象 */
export function roundedRect(
  scene: Phaser.Scene,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number,
  fill: number,
  alpha = 1,
  stroke?: number,
  strokeAlpha = 1
): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics({ x, y });
  g.setInteractive(new Phaser.Geom.Rectangle(0, 0, w, h), Phaser.Geom.Rectangle.Contains);
  if (stroke !== undefined) {
    g.lineStyle(1, stroke, strokeAlpha);
  }
  g.fillStyle(fill, alpha);
  g.fillRoundedRect(0, 0, w, h, radius);
  if (stroke !== undefined) {
    g.strokeRoundedRect(0, 0, w, h, radius);
  }
  return g;
}

export function backdrop(scene: Phaser.Scene, step = ''): void {
  scene.add.rectangle(480,320,960,640,THEME.bg);
  const g=scene.add.graphics();
  g.lineStyle(1,THEME.line,0.55);
  for(let x=24;x<960;x+=32) for(let y=24;y<640;y+=32) g.strokeCircle(x,y,0.5);
  g.lineStyle(1,THEME.line,0.95).lineBetween(40,76,920,76).lineBetween(40,592,920,592);
  scene.add.text(42,30,'✦  看山问你，睡了吗？',{fontFamily:'Microsoft YaHei, sans-serif',fontSize:'19px',color:css(THEME.text)});
  if (step !== 'hide') scene.add.text(916,34,step||'把今天放下，好好睡一觉',{fontSize:'12px',color:css(THEME.muted)}).setOrigin(1,0);
}
export function button(scene: Phaser.Scene,x:number,y:number,w:number,label:string,action:()=>void,primary=true):void {
  // 主按钮用薄荷绿实心（浅底压深字），次按钮是暗底描边——深色页面上按钮得自己发光
  const bg=roundedRect(scene,x,y,w,46,12,primary?THEME.green:THEME.paper,1,primary?THEME.green:THEME.line,primary?1:0.9);
  // 体感模式下按钮只做视觉提示，操作统一由 InputManager/键位完成。
  bg.input!.cursor='pointer';
  bg.on('pointerover',()=>bg.setAlpha(0.82)).on('pointerout',()=>bg.setAlpha(1)).on('pointerdown',action);
  scene.add.text(x+w/2,y+23,label,{fontFamily:'Microsoft YaHei, sans-serif',fontSize:'16px',color:primary?css(THEME.onAccent):css(THEME.text)}).setOrigin(0.5);
}
export function fitText(text:Phaser.GameObjects.Text,height:number,minimum=13):void {
  let size=parseInt(String(text.style.fontSize),10);
  while(text.height>height&&size>minimum) text.setFontSize(--size);
}
