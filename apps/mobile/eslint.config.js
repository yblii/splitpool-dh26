const path = require('path');
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  { ignores: ['dist/*', '.expo/*'] },
  {
    settings: {
      'import/resolver': {
        node: {
          extensions: ['.js', '.jsx', '.ts', '.tsx'],
          moduleDirectory: ['node_modules', path.join(__dirname, '../../node_modules')],
        },
        typescript: {
          project: path.join(__dirname, 'tsconfig.json'),
        },
      },
    },
  },
]);
