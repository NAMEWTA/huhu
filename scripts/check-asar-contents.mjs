import { createRequire } from "node:module";

const archive = process.argv[2];
if (!archive) {
  console.error("用法：node scripts/check-asar-contents.mjs <app.asar>");
  process.exit(2);
}

// Load electron-builder's own ASAR implementation from the desktop dependency tree.
const desktopRequire = createRequire(new URL("../apps/desktop/package.json", import.meta.url));
const builderRequire = createRequire(desktopRequire.resolve("electron-builder"));
const libraryRequire = createRequire(builderRequire.resolve("app-builder-lib"));
const { extractFile, listPackage } = libraryRequire("@electron/asar");
const entries = listPackage(archive).map((name) => name.replaceAll("\\", "/"));
const excluded = entries.filter(
  (name) => /\.(?:test|spec|test-helpers?)\.[^/]+$/i.test(name) || /\/(?:__tests__|__fixtures__|test-utils|test-results|test|tests)(?:\/|$)/.test(name) || /\/open-knowledge\/(?:[^/]+\/)*fixtures(?:\/|$)/.test(name),
);
if (excluded.length > 0) {
  console.error(excluded.join("\n"));
  process.exitCode = 1;
} else {
  try {
    const manifest = JSON.parse(extractFile(archive, "package.json").toString("utf8"));
    const build = JSON.parse(extractFile(archive, "out/build-info.json").toString("utf8"));
    if (manifest.name !== "@huhu/desktop" || build.version !== manifest.version || !build.commit) {
      throw new Error("应用名、版本或提交标识无效");
    }
    console.log(`${entries.length} ASAR entries checked for ${build.version} (${build.commit}). No test sources, helpers, results, or fixtures found.`);
  } catch {
    console.error("无法读取 Huhu ASAR 的应用清单或构建标识，请检查归档内容。");
    process.exitCode = 1;
  }
}
