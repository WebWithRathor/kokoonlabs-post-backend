import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  eslint.configs.recommended,
  tseslint.configs.recommendedTypeChecked,
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'coverage/**',
      'eslint.config.mjs',
      'src/tests/**/*.js',
      'jest.config.js'
    ]
  },
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname
      }
    },
    rules: {
      'no-duplicate-imports': 'error',
      'no-console': ['error', { allow: ['warn', 'error'] }],
      'dot-notation': 'error',
      'prefer-const': 'error',
      eqeqeq: ['error', 'always'],
      'max-depth': ['warn', 4],
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      '@typescript-eslint/no-misused-promises': 'off'
    }
  }
);
