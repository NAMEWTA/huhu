# SP-3 Lingui（S2a，2026-11-15）——**通过**

- `@lingui/vite-plugin@6` + `@lingui/babel-plugin-lingui-macro`（经 `@rolldown/plugin-babel`；`@vitejs/plugin-react 6` 没有 babel 选项）在 Vite 8 下可用；harness 与 `apps/desktop` 渲染进程构建都通过。构建的 cwd 不是编辑器包，所以用 `LINGUI_CONFIG` 环境变量 + `lingui({configPath})` 指向 `packages/editor/lingui.config.ts`。
- 只编译 `en` / `zh-Hans`（上游 `.po` 原样，各 4064 条）；`activate-locale.ts` 把其余 11 个 locale 回退到 en（P-S2a-04）。`.po` 由插件编译为命名导出 `messages`（上游代码按 `.json` 默认导出写，已改）。
- 数据：harness 全量构建 4.6–4.9 s（6243 个模块）；`apps/desktop` 渲染进程构建 1.8 s。`messages` 块 236 kB（gzip 98 kB，en）。构建耗时“前后对比”未做（vendor 尚未被应用引用，对比无意义），S2b 后补测。
- **未做**：`zh-Hans` / `en` 运行时切换的 e2e；React Compiler preset 未启用（上游启用，属渲染优化；S2b 评估开启范围，避免整个 Huhu 被编译）。
