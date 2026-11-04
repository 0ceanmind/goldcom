import globals from 'globals';

export default [
  { ignores: ['dist/**','data/**','node_modules/**'] },
  { files: ['**/*.{js,mjs,jsx}'], languageOptions: { ecmaVersion: 'latest', sourceType: 'module', parserOptions: { ecmaFeatures: { jsx: true } }, globals: { ...globals.node, ...globals.browser } }, rules: { 'no-undef': 'error', 'no-eval': 'error', 'no-new-func': 'error', 'no-implied-eval': 'error', 'no-unreachable': 'error', 'valid-typeof': 'error' } },
];
