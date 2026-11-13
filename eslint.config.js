import js from '@eslint/js';
import globals from 'globals';

export default [
  // (worker/resvg-glue.js is @resvg/resvg-wasm's own code, copied by scripts/vendor-resvg.js.)
  { ignores: ['dist/', 'coverage/', 'playwright-report/', 'test-results/', '.wrangler/', 'worker/resvg-glue.js'] },
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: globals.browser,
    },
    linterOptions: { reportUnusedDisableDirectives: 'error' },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
      'prefer-const': 'error',
      'no-var': 'error',
      'object-shorthand': 'error',
      eqeqeq: ['error', 'smart'],
      'no-implicit-coercion': ['error', { allow: ['!!', '+'] }],
      'no-shadow': 'error',
      'no-param-reassign': 'error',
    },
  },
  {
    files: ['src/**'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },
  {
    files: ['bin/**', 'scripts/**', 'test/**', '*.config.js'],
    languageOptions: { globals: globals.node },
  },
];
