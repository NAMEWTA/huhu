import { defineConfig } from "electron-vite";
import { resolve } from "node:path";
import { workbenchViteOptions } from "./scripts/workbench-vite-options";

export default defineConfig({
  main: {
    build: {
      // 工作区包是 TS 源码，必须被打进 index.js/engine.js；原生模块在 rollupOptions.external 中单独外部化
      externalizeDeps: {
        exclude: [
          "@huhu/engine",
          "@huhu/plugin-mail",
          "@huhu/editor",
          "@huhu/plugin-notes",
          "@huhu/plugin-ssh",
          "@huhu/plugin-versioning",
          "@huhu/plugin-automations",
          "@huhu/plugin-agent-cli",
          "@huhu/plugin-agent-guide",
          "@huhu/plugin-safe",
          "@huhu/plugin-inbox",
          "@huhu/plugin-ledger",
          "@huhu/kernel",
          "@huhu/vault",
          "@huhu/contracts",
          "@huhu/cordis",
          "@huhu/cosmokit",
          "@huhu/cordis-timer",
          "@huhu/plugin-tasks",
        ],
      },
      outDir: "out/main",
      rollupOptions: {
        input: { index: "src/main/index.ts", engine: "../engine/src/main.ts" },
        // 原生模块和协议库由桌面运行时加载，工作区源码编入各自入口。
        external: ["electron", "@napi-rs/keyring", "@parcel/watcher", "koffi", "bufferutil", "utf-8-validate", "cpu-features", "ssh2", "imapflow", "nodemailer/lib/mail-composer", "nodemailer/lib/smtp-connection"],
        output: { format: "es", entryFileNames: "[name].js" },
      },
    },
  },
  preload: { build: { outDir: "out/preload", rollupOptions: { input: { index: "src/preload/index.ts" }, output: { format: "cjs", entryFileNames: "[name].cjs" } } } },
  renderer: {
    ...workbenchViteOptions(resolve(import.meta.dirname, "../../packages/editor")),
    root: "src/renderer",
    build: { outDir: "out/renderer", rollupOptions: { input: "src/renderer/index.html" } },
  },
});
