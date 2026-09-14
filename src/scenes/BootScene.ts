import { SharpScene } from '../ui/SharpScene';
import Phaser from 'phaser';

export class BootScene extends SharpScene {
  constructor() {
    super('BootScene');
  }

  create(): void {
    // 纯几何图形 + 文本，无需外部资源。直接进入菜单。
    this.scene.start('MenuScene');
  }
}
