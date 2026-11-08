import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import prettier from 'eslint-config-prettier'

// Flat ESLint config (ESLint 9). TypeScript + React Hooks + React Refresh.
// Formatting is owned by Prettier (see .prettierrc.json); eslint-config-prettier
// disables every ESLint rule that would fight it, so the two never disagree.
export default tseslint.config(
  { ignores: ['dist', 'coverage', 'mobile', 'node_modules'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Deliberate project decisions (Phase 1, 2026-11-08):
      // - only-export-components is off: this codebase intentionally
      //   co-locates hooks/helpers with components (e.g. a context module
      //   exports both its Provider and its use* hook). Fast Refresh still
      //   works; it just falls back to a full reload for those modules.
      'react-refresh/only-export-components': 'off',
      // - set-state-in-effect is off FOR NOW: the data-fetching hooks
      //   (useAsync/useItems/useMessages) set their loading flag at the
      //   start of the fetch effect — the standard pre-React-Compiler
      //   idiom this codebase was built with. Rewriting those hooks is a
      //   behavior risk with no user benefit in a cleanup phase; revisit
      //   when the React Compiler rules are adopted wholesale (Phase 7).
      //   rules-of-hooks and exhaustive-deps stay fully enforced.
      'react-hooks/set-state-in-effect': 'off',
      // The one legitimate console call in the app is ErrorBoundary's
      // console.error; debug logging (log/info/debug) is an error.
      'no-console': ['error', { allow: ['error', 'warn'] }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    // Config files run in Node, not the browser.
    files: ['*.config.{ts,js}', 'eslint.config.js'],
    languageOptions: { globals: globals.node },
  },
  prettier,
)
