import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'playwright-report/**',
      'playwright-output/**',
      'test-results/**',
      '.claude/**',
      '.atlas/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**'],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ['e2e/**', '*.config.{js,ts}'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },
  prettier,
);
