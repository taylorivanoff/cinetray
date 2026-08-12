import eslint from '@eslint/js';
import globals from 'globals';

const nodeFiles = ['main/**/*.js', 'sidecar/*.js', 'scripts/**/*.js', 'scripts/**/*.cjs', '*.js'];

const nodeEsmFiles = ['sidecar/*.mjs'];

const browserFiles = ['renderer/**/*.js'];

const unusedVarsRule = ['error', { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }];

export default [
  {
    ignores: ['dist/**', 'node_modules/**', 'src-tauri/**'],
  },
  eslint.configs.recommended,
  {
    files: nodeFiles,
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
      },
    },
    rules: {
      'no-unused-vars': unusedVarsRule,
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-control-regex': 'off',
    },
  },
  {
    files: nodeEsmFiles,
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.node,
      },
    },
    rules: {
      'no-unused-vars': unusedVarsRule,
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-control-regex': 'off',
    },
  },
  {
    files: browserFiles,
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'script',
      globals: {
        ...globals.browser,
      },
    },
    rules: {
      'no-unused-vars': unusedVarsRule,
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-control-regex': 'off',
    },
  },
];
