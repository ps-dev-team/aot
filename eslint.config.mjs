import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules',
      '**/dist',
      'packages/world-agent/runs',
      'packages/interview-agent/worlds',
      'docs/raw',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
);
