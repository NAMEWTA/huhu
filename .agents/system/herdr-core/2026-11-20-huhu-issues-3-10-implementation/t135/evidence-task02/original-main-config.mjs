export default { main: {
    build: {
      // 工作区包是 TS 源码，必须被打进 index.js/engine.js；原生模块在 rollupOptions.external 中单独外部化
      externalizeDeps: {
        exclude: [
          "@huhu/engine",
          "@huhu/plugin-mail",
          "@huhu/plugin-notes",
          "@huhu/plugin-ssh",
          "@huhu/plugin-versioning",
          "@huhu/plugin-automations",
          "@huhu/plugin-agent-cli",
          "@huhu/plugin-agent-guide",
          "@huhu/plugin-safe",
          "@huhu/plugin-inbox",
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
        // 原生模块不打包；其余工作区源码被打进各自入口
        external: ["electron", "@napi-rs/keyring", "@parcel/watcher", "bufferutil", "utf-8-validate", "cpu-features", "ssh2", "imapflow"],
        output: { format: "es", entryFileNames: "[name].js" },
      },
    },
  } };