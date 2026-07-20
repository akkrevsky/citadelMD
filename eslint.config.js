import js from '@eslint/js'

export default [
  js.configs.recommended,
  {
    // Only lint JavaScript files (not TypeScript)
    files: ['**/*.{js,mjs,cjs}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { 
        node: true,
        process: 'readonly',
        console: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        global: 'readonly'
      },
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-undef': 'warn',
    },
  },
  {
    // Ignore TypeScript files, build artifacts, and other non-lintable files
    ignores: [
      '**/dist/**', 
      '**/node_modules/**', 
      '**/coverage/**',
      '**/*.ts',
      '**/*.tsx',
      '**/*.d.ts'
    ],
  },
]