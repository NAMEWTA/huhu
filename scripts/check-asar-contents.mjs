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
const { listPackage } = libraryRequire("@electron/asar");
const entries = listPackage(archive).map((name) => name.replaceAll("\\", "/"));
const excluded = entries.filter((name) => /\.(?:test|spec|test-helpers?)\.[^/]+$/i.test(name) || /\/(?:__tests__|__fixtures__|test-utils|test|tests)(?:\/|$)/.test(name) || /\/open-knowledge\/(?:[^/]+\/)*fixtures(?:\/|$)/.test(name));
if (excluded.length > 0) {
  console.error(excluded.join("\n"));
  process.exitCode = 1;
} else if (entries.some((name) => name === "/out/build-info.json")) {
  console.log(`${entries.length} ASAR entries checked. No test sources, helpers, or fixtures found.`);
} else {
  console.error("缺少 /out/build-info.json，请使用 Huhu 的应用 ASAR。");
  process.exitCode = 1;
}
