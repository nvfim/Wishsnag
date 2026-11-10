import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['dist', 'dist-e2e', 'node_modules', 'coverage', 'test-results', 'playwright-report', 'supabase/functions', 'release'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2023,
      globals: { ...globals.browser, ...globals.serviceworker, chrome: 'readonly' },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports', fixStyle: 'inline-type-imports' }],
      'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
      eqeqeq: ['error', 'smart'],
    },
  },
  {
    files: ['scripts/**/*.{js,mjs,ts}', '*.config.{js,ts}', 'tests/e2e/**/*.ts'],
    languageOptions: { globals: { ...globals.node } },
    // Playwright fixtures call `use()`, which is not a React hook.
    rules: { 'no-console': 'off', 'react-hooks/rules-of-hooks': 'off' },
  },
);
