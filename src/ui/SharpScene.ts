import Phaser from 'phaser';

/** Keep the 960 × 640 design space while drawing enough physical pixels. */
export function renderDensity(): number {
  const fit = Math.min(window.innerWidth / 960, window.innerHeight / 640);
  // Cap the render target at 2880 × 1920 to bound GPU and text texture costs.
  return Math.min(3, Math.max(1, Math.ceil(fit * window.devicePixelRatio * 4) / 4));
}

export class SharpScene extends Phaser.Scene {
  init(): void {
    const onAdded = (object: Phaser.GameObjects.GameObject) => {
      if (object instanceof Phaser.GameObjects.Text) {
        object.setResolution(this.scale.width / 960);
      }
    };
    this.events.on(Phaser.Scenes.Events.ADDED_TO_SCENE, onAdded);
    this.events.once(Phaser.Scenes.Events.CREATE, () => this.refreshResolution());
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.events.off(Phaser.Scenes.Events.ADDED_TO_SCENE, onAdded);
    });
  }

  refreshResolution(): void {
    const density = this.scale.width / 960;
    this.cameras.main.setSize(this.scale.width, this.scale.height)
      .setZoom(density).centerOn(480, 320);
    const visit = (objects: Phaser.GameObjects.GameObject[]) => {
      for (const object of objects) {
        if (object instanceof Phaser.GameObjects.Text && object.style.resolution !== density) {
          object.setResolution(density);
        } else if (object instanceof Phaser.GameObjects.Container) {
          visit(object.list);
        }
      }
    };
    visit(this.children.list);
  }
}
