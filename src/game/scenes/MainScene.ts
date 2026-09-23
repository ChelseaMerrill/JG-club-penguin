import { Scene } from 'phaser';

export const MAIN_SCENE_KEY = 'MainScene';

/** Blank starting scene. Room rendering and Penguin movement come later. */
export class MainScene extends Scene {
  constructor() {
    super(MAIN_SCENE_KEY);
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#1e6fa8');
  }
}
