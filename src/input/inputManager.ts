import Phaser from 'phaser';
import { GameAction, ACTION_MAP } from './actionMapper';

/**
 * InputManager 把体感设备映射的键盘事件统一转换为 GameAction。
 * 负责防抖、冷却和持续移动状态读取，避免体感动作误触发多次。
 */
export class InputManager {
  private onAction: (action: GameAction) => void;
  private keyboard: Phaser.Input.Keyboard.KeyboardPlugin;
  private lastTrigger: Map<GameAction, number> = new Map();
  private keyObjs: Map<string, Phaser.Input.Keyboard.Key> = new Map();
  private mouseJustDown = false;

  constructor(scene: Phaser.Scene, onAction: (action: GameAction) => void) {
    this.onAction = onAction;
    this.keyboard = scene.input.keyboard!;

    // 注册所有用到的键盘键
    for (const mapping of Object.values(ACTION_MAP)) {
      for (const key of mapping.keys) {
        if (key === 'MOUSE_LEFT') continue;
        if (!this.keyObjs.has(key)) {
          this.keyObjs.set(key, this.keyboard.addKey(key));
        }
      }
    }

    const pointerHandler = (pointer: Phaser.Input.Pointer, objects: Phaser.GameObjects.GameObject[]) => {
      if (pointer.leftButtonDown() && objects.length === 0) this.mouseJustDown = true;
    };
    scene.input.on('pointerdown', pointerHandler);
    scene.events.once('shutdown', () => {
      scene.input.off('pointerdown', pointerHandler);
      this.keyboard.removeAllKeys(true);
      this.keyObjs.clear();
    });
  }

  /** 每帧调用一次 */
  update(time: number): void {
    // 处理离散动作（边沿触发 + 冷却）
    this.tryJustDown('slash', 'J', time);
    this.tryJustDown('hug', 'H', time);
    this.tryJustDown('nod', 'N', time);
    this.tryJustDown('dodge', 'F', time);
    this.tryJustDown('dodge', 'SPACE', time);
    this.tryJustDown('investigate', 'E', time);
    // MoveToPlay 的 M/X 是左右抬手，不能再当成剧情选项快捷键。
    this.tryJustDown('hug', 'M', time);
    this.tryJustDown('nod', 'X', time);
    // 剧情选项：键鼠玩家用左右方向键选中，回车确认，保证没有体感设备也能通关。
    // 不绑 1/2：dongle 的「双手交叉额头」手势就是连敲数字键，会和选项撞车。
    this.tryJustDown('selectA', 'LEFT', time);
    this.tryJustDown('selectB', 'RIGHT', time);
    this.tryJustDown('confirm', 'ENTER', time);

    if (this.mouseJustDown) {
      this.mouseJustDown = false;
      this.trigger('slash', time);
    }

  }

  /** 读取持续移动状态（供探索场景轮询） */
  getMoveState(): { moving: boolean; running: boolean; dx: number; dy: number } {
    const k = this.keyObjs;
    let dx = 0;
    let dy = 0;
    if (k.get('A')?.isDown || k.get('LEFT')?.isDown) dx -= 1;
    if (k.get('D')?.isDown || k.get('RIGHT')?.isDown) dx += 1;
    if (k.get('W')?.isDown || k.get('UP')?.isDown) dy -= 1;
    if (k.get('S')?.isDown || k.get('DOWN')?.isDown) dy += 1;
    const running = k.get('SHIFT')?.isDown ?? false;
    return { moving: dx !== 0 || dy !== 0, running, dx, dy };
  }

  /** 是否正在按住某个动作键（用于长按检测） */
  isDown(action: GameAction): boolean {
    const mapping = ACTION_MAP[action];
    if (!mapping) return false;
    return mapping.keys.some((key) => {
      if (key === 'MOUSE_LEFT') return false;
      return this.keyObjs.get(key)?.isDown ?? false;
    });
  }

  private tryJustDown(action: GameAction, key: string, time: number): void {
    const keyObj = this.keyObjs.get(key);
    if (keyObj && Phaser.Input.Keyboard.JustDown(keyObj)) {
      this.trigger(action, time);
    }
  }

  private trigger(action: GameAction, time: number): void {
    const mapping = ACTION_MAP[action];
    const last = this.lastTrigger.get(action) ?? -Infinity;
    if (!mapping.continuous && time - last < mapping.cooldownMs) {
      return; // 冷却中，忽略
    }
    this.lastTrigger.set(action, time);
    this.onAction(action);
  }
}
