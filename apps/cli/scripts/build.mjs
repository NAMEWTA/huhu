// 把 CLI 打成单文件 ESM（含全部依赖），随应用放入 resources/cli/cli.mjs，由 resources/bin/huhu(.cmd) 以 ELECTRON_RUN_AS_NODE 调用。
import { build } from "esbuild";
import { fileURLToPath } from "node:url";

await build({
  entryPoints: ["src/bin.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  outfile: "dist/cli.mjs",
  // 打包后的 ESM 里仍可能有依赖使用 require / __dirname
  banner: { js: "import { createRequire as __huhuCreateRequire } from 'node:module';\nconst require = __huhuCreateRequire(import.meta.url);" },
  // @parcel/watcher 是原生模块，不能打进单文件；CLI 不用文件监听，换成桩
  alias: { "@parcel/watcher": fileURLToPath(new URL("./stub-watcher.mjs", import.meta.url)) },
  logLevel: "info",
});
