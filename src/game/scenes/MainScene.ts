import { Scene } from 'phaser';
import { PenguinSpriteView } from '../penguin-sprites';

export const MAIN_SCENE_KEY = 'MainScene';

/**
 * The Room scene: renders remote (and the local) Penguins via `penguins`
 * (STUB for #31, `../penguin-sprites.ts`). `whenReady()` resolves once
 * `create()` has run and `penguins` is set, for callers (`main.ts`) that
 * need it before the rest of the Phaser boot sequence finishes.
 */
export class MainScene extends Scene {
  penguins!: PenguinSpriteView;
  private readonly readyPromise: Promise<void>;
  private resolveReady!: () => void;

  constructor() {
    super(MAIN_SCENE_KEY);
    this.readyPromise = new Promise((resolve) => {
      this.resolveReady = resolve;
    });
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#1e6fa8');
    this.penguins = new PenguinSpriteView(this);
    this.resolveReady();
  }

  whenReady(): Promise<void> {
    return this.readyPromise;
  }
}
