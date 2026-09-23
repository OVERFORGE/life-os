const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

// Only watch root node_modules instead of the entire monorepo root
config.watchFolders = [
  path.resolve(workspaceRoot, "node_modules"),
];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

// Block irrelevant directories from Metro's file watcher and crawler
const defaultBlockList = Array.isArray(config.resolver.blockList)
  ? config.resolver.blockList
  : config.resolver.blockList
  ? [config.resolver.blockList]
  : [];

config.resolver.blockList = [
  ...defaultBlockList,
  /[/\\]apps[/\\]web[/\\]\.next[/\\].*/,
  /[/\\]apps[/\\]desktop[/\\](dist|build)[/\\].*/,
  /[/\\]\.gemini[/\\].*/,
  /[/\\]\.git[/\\].*/,
  /[/\\]\.turbo[/\\].*/,
];

module.exports = withNativeWind(config, { input: "./global.css", projectRoot });
