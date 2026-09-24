import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // Use Phaser's prebuilt ESM bundle (as Vite does via `module`); its CJS
    // source entry requires the optional `phaser3spectorjs` debug package.
    alias: [
      {
        find: /^phaser$/,
        replacement: fileURLToPath(
          new URL('./node_modules/phaser/dist/phaser.esm.js', import.meta.url),
        ),
      },
    ],
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    exclude: ['e2e/**', 'node_modules/**'],
    // Stubs HTMLCanvasElement.getContext so Phaser can import under jsdom.
    setupFiles: ['vitest-canvas-mock'],
  },
});
