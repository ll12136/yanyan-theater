import Phaser from 'phaser';
import { SharpScene } from '../ui/SharpScene';
import { THEME, css, button } from '../ui/theme';

/** 可随时停留的睡前安静房间：没有目标、计分或倒计时。 */
export class QuietRoomScene extends SharpScene {
  constructor() { super('QuietRoomScene'); }
  create(): void {
    this.add.rectangle(480, 320, 960, 640, THEME.bg2);
    if (!this.textures.exists('__sleep-particle')) { const g=this.make.graphics({x:0,y:0},false); g.fillStyle(0xd9d4ff,.9); g.fillCircle(3,3,3); g.generateTexture('__sleep-particle',6,6); g.destroy(); }
    const stars = this.add.particles(0, 0, '__sleep-particle', {
      x: { min: 80, max: 880 }, y: { min: 100, max: 570 }, lifespan: { min: 9000, max: 15000 },
      speedY: { min: -3, max: -10 }, speedX: { min: -2, max: 2 }, scale: { start: .3, end: .05 },
      alpha: { start: .25, end: 0 }, frequency: 500, blendMode: Phaser.BlendModes.SCREEN
    }).setDepth(0);
    this.add.text(480, 130, '安静房间', { fontFamily: 'Microsoft YaHei', fontSize: '30px', color: css(THEME.text) }).setOrigin(.5);
    this.add.text(480, 190, '今晚不用做任何决定。\n看一会儿月光，听一会儿自己的呼吸。', { fontFamily: 'Microsoft YaHei', fontSize: '18px', color: css(THEME.muted), align: 'center', lineSpacing: 12 }).setOrigin(.5);
    const pulse = this.add.circle(480, 350, 58, THEME.warm, .16);
    this.tweens.add({ targets: pulse, scale: 1.35, alpha: .03, duration: 4200, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.add.text(480, 350, '吸气\n……\n呼气', { fontFamily: 'SimSun', fontSize: '18px', color: css(THEME.warm2), align: 'center', lineSpacing: 8 }).setOrigin(.5);
    button(this, 350, 520, 120, '回到故事', () => this.scene.start('TroubleScene'), false);
    button(this, 490, 520, 120, '返回首页', () => this.scene.start('MenuScene'), false);
    this.input.keyboard?.addKey('ESC').on('down', () => this.scene.start('TroubleScene'));
    this.events.once('shutdown', () => { stars.destroy(); });
  }
}
