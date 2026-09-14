import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { MenuScene } from './scenes/MenuScene';
import { TroubleScene } from './scenes/TroubleScene';
import { StoryScene } from './scenes/StoryScene';
import { HarvestScene } from './scenes/HarvestScene';
import { EndingScene } from './scenes/EndingScene';
import { SampleScene } from './scenes/SampleScene';
import { QuietRoomScene } from './scenes/QuietRoomScene';
import { renderDensity, SharpScene } from './ui/SharpScene';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'app',
  width: 960 * renderDensity(),
  height: 640 * renderDensity(),
  backgroundColor: '#1e1730',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH
  },
  scene: [BootScene, MenuScene, TroubleScene, StoryScene, HarvestScene, EndingScene, SampleScene, QuietRoomScene]
};

export const game = new Phaser.Game(config);

// 调试/自动化用：把 game 挂到 window，方便在浏览器控制台或截图脚本里读取场景状态
// （例如 window.__game.scene.getScene('TroubleScene')），对运行时没有别的影响。
(window as unknown as { __game?: Phaser.Game }).__game = game;

let resizeTimer: ReturnType<typeof setTimeout>;
const resize = () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    const density = renderDensity();
    if (game.scale.width !== 960 * density) {
      game.scale.resize(960 * density, 640 * density);
      for (const scene of game.scene.getScenes(true)) {
        if (scene instanceof SharpScene) scene.refreshResolution();
      }
    }
  }, 120);
};
window.addEventListener('resize', resize);
game.events.once(Phaser.Core.Events.DESTROY, () => {
  clearTimeout(resizeTimer);
  window.removeEventListener('resize', resize);
});
