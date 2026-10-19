import js from '@eslint/js'
import pluginQuery from '@tanstack/eslint-plugin-query'
import { defineConfig, globalIgnores } from 'eslint/config'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import simpleImportSort from "eslint-plugin-simple-import-sort"
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default defineConfig([
  globalIgnores(['dist', 'routeTree.gen.ts', 'src-tauri']),
  {
    files: ['**/*.{js,ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    plugins:{
      "simple-import-sort": simpleImportSort,
      '@tanstack/query': pluginQuery
    },
    rules:{
      "react-hooks/set-state-in-effect": "off",
      "react-refresh/only-export-components": "off",
      "simple-import-sort/imports": "error",
      "simple-import-sort/exports": "error",
      "@tanstack/query/exhaustive-deps": "error",
      "@tanstack/query/no-unstable-deps": "error",
      "@tanstack/query/no-void-query-fn": "error",
      "@tanstack/query/mutation-property-order": "error",
      "@tanstack/query/prefer-query-options": "error",
      "@typescript-eslint/consistent-type-imports": "error"
    },
    languageOptions: {
      globals: globals.browser,
    },
  },
])
