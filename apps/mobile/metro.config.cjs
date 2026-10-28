/* eslint-disable @typescript-eslint/no-require-imports, no-undef */
const fs = require('node:fs');
const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.resolver.resolveRequest = (context, moduleName, platform) => {
  const rewritten = typescriptSibling(context.originModulePath, moduleName);
  return context.resolveRequest(context, rewritten ?? moduleName, platform);
};

function typescriptSibling(origin, moduleName) {
  if (!moduleName.startsWith('.') || !moduleName.endsWith('.js')) return null;
  const requested = path.resolve(path.dirname(origin), moduleName);
  if (fs.existsSync(requested)) return null;
  for (const extension of ['.ts', '.tsx']) {
    if (fs.existsSync(requested.replace(/\.js$/, extension))) {
      return moduleName.replace(/\.js$/, extension);
    }
  }
  return null;
}

module.exports = config;
