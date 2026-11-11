// electron-builder beforePack：安装包必须带 Herdr Core，缺了就让打包失败（不要产出终端功能不可用的安装包）。
const { existsSync } = require("node:fs");
const path = require("node:path");

exports.default = async function beforePack(context) {
  const archName = { 0: "ia32", 1: "x64", 2: "armv7l", 3: "arm64", 4: "universal" }[context.arch] ?? String(context.arch);
  const target = `${context.electronPlatformName}-${archName}`;
  const exe = context.electronPlatformName === "win32" ? "herdr-core.exe" : "herdr-core";
  const bin = path.join(context.packager.projectDir, "resources", "herdr", target, exe);
  if (!existsSync(bin)) throw new Error(`缺少 Herdr Core：${bin}。先运行 node scripts/fetch-herdr.mjs --target ${target}`);
};
