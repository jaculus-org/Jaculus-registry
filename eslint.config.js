import eslint from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import tseslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier';
export default defineConfig([
  globalIgnores(['dist/', 'bin/', 'node_modules/']),
  {
    files: ['**/*.{js,ts,mjs,cjs,cts,mts}'],
    languageOptions: {
      globals: {
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
      },
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
    plugins: {
      js: eslint,
      typescript: tseslint,
    },
    extends: [eslint.configs.recommended, tseslint.configs.recommended],
    rules: {},
  },
  eslintConfigPrettier,
]);
//# sourceMappingURL=eslint.config.js.map
