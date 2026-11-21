const { createRequire } = require("node:module");
const { readFileSync } = require("node:fs");
const { createHash } = require("node:crypto");

const anchors = process.argv.slice(2);
if (anchors.length !== 2) throw new Error("provide Engine and Desktop manifests");
const sha = (file) => createHash("sha256").update(readFileSync(file)).digest("hex");
for (const entry of anchors) {
  const resolve = createRequire(entry);
  const wrapper = resolve.resolve("@napi-rs/keyring");
  const wjs = resolve("@napi-rs/keyring/package.json");
  const fromWrapper = createRequire(wrapper);
  const native = fromWrapper.resolve("@napi-rs/keyring-win32-x64-msvc");
  const nativeMeta = fromWrapper("@napi-rs/keyring-win32-x64-msvc/package.json");
  if (wjs.version !== "2.1.2" || nativeMeta.version !== "2.1.2") throw new Error("unexpected binaries");
  if (!native.endsWith("keyring.win32-x64-msvc.node")) throw new Error("invalid win32 x64 target");
  console.log(JSON.stringify({ entry, wrapper, wrapperVersion: wjs.version, wrapperSha256: sha(wrapper), native, nativeVersion: nativeMeta.version,
    nativeSha256: sha(native), license: nativeMeta.license, compiledLockScope: "development node_modules" }));
}
