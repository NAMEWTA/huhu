# vendor 补丁登记

规则：每个与上游不同的文件都登记一行（路径用反引号，`node scripts/ok-patches.mjs --check` 逐一比对，不一致即失败）。S2a 基线（S2c 起改动 +1）：**改动 5 / 删除 4 / 新增 26（server-bridge 11 个上游文件的复制 + 9 个替身；app 的 CSS / 声明 / 目录 7 个）**，远低于阈值 150（decisions OP-D02）。

## 改动（上游文件被改写或替换）

- P-S2a-02 `app/src/editor/DocumentContext.tsx`：上游 1868 行（标签 / 分屏 / 协作连接 / 会话恢复）→ 再导出 Huhu 宿主版 `packages/editor/src/host/document-context.tsx`（只保留 vendor 组件实际读取的 17 个成员）。
- P-S2a-03 `app/src/lib/config-provider.tsx`：上游 346 行（经协作配置文档同步）→ 只保留 `useConfigContext` 再导出；提供者见 `host/config-provider.tsx`。
- P-S2a-04 `app/src/lib/activate-locale.ts`、`app/src/lib/i18n.ts`、`app/src/lib/dev-pseudo-locale.ts`：只发布 en / zh-Hans（OP-D06），目录由 `@lingui/vite-plugin` 直接编译 `.po`；其余 locale 回退 en；pseudo 伪本地化不发布。

- P-S2c-01 `app/src/editor/editor-cache.ts`：`mountTiptapEditor` 的缓存闸门对 `compact-` 前缀的 docName 一律拒绝缓存（紧凑变体同时挂载几十个实例；不改会让超过 MAX_CACHE 的在屏实例被 LRU 驱逐销毁）。1 处、3 行。

## 删除

- P-S2a-01 `app/src/editor/provider-pool.ts`（2121 行，Hocuspocus 连接池）、`app/src/editor/branch-invalidation.ts`、`app/src/lib/auth-token.ts`、`app/src/lib/server-info-refresh.ts`：协作 / 服务器专属；由 `host/hocuspocus-provider.ts`（LocalDocProvider）取代。

## 新增（非 closure 的上游文件或 Huhu 替身）

- P-S2a-05 上游资源拷贝：`app/src/globals.css`、`app/src/cmd-f.css`、`app/src/color-themes.generated.css`（由 `scripts/ok-css-build.mjs` 生成 `packages/editor/src/ok/ok-globals.css`）、`app/src/env.d.ts`、`app/src/fontsource.d.ts`、`app/src/locales/en/messages.po`、`app/src/locales/zh-Hans/messages.po`。
- P-S2a-srv 上游 server 文件原样复制：`server-bridge/server-observers.ts`、`server-bridge/map-driven-splice.ts`、`server-bridge/bridge-watchdog.ts`、`server-bridge/bridge-quiescence.ts`、`server-bridge/pre-drain-discriminator.ts`、`server-bridge/bridge-intake.ts`、`server-bridge/bridge-loss-detector.ts`、`server-bridge/doc-extensions.ts`、`server-bridge/md-manager.ts`。
- P-S2a-srv 上游 server 文件裁剪 / 替身（Huhu 本地宿主不需要 OTel、日志、影子仓库、AI 会话）：`server-bridge/agent-activity.ts`（只留 `walkYTextItems` 与类型）、`server-bridge/cc1-broadcast.ts`（只留 `isSystemDoc` / `isConfigDoc`）、`server-bridge/metrics.ts`、`server-bridge/logger.ts`、`server-bridge/telemetry.ts`、`server-bridge/shadow-repo.ts`、`server-bridge/loss-capture.ts`、`server-bridge/frontmatter-telemetry.ts`、`server-bridge/server-workload-telemetry.ts`、`server-bridge/agent-sessions.ts`（均为同名同签名的空实现 / 类型）。

## 构建期替换（不改 vendor 文件，tsconfig.vendor.json paths + `build/aliases.mjs` 同源）

- `@hocuspocus/provider` → `host/hocuspocus-provider.ts`（LocalDocProvider；`HocuspocusProvider` 为其别名）
- `@hocuspocus/server`（仅类型）→ `host/hocuspocus-server.ts`
- `@inkeep/open-knowledge-core`（根入口）→ `host/core-barrel.ts`（`scripts/ok-barrel-gen.mjs` 生成的精确子集）

## 依赖补丁（pnpm patchedDependencies，原样复制自上游 `patches/`）

`@handlewithcare/remark-prosemirror@0.1.5`、`@lingui/core@6.5.0`、`@pierre/trees@1.0.0-beta.4`、`@radix-ui/react-tooltip@1.2.8`、`@tiptap/extension-drag-handle@3.22.3`、`@tiptap/y-tiptap@3.0.3`、`cmdk@1.1.1`、`react-medium-image-zoom@5.4.3`、`y-indexeddb@9.0.12`。未登记：`@hocuspocus/provider`（不引入）、`y-prosemirror`（Huhu 不安装）、`react-resizable-panels`、`@pierre/diffs`（未进入闭包）。另有 `pnpm-workspace.yaml` 的 `overrides: mdast-util-mdx-jsx: 3.2.0`（模块增强要求单一实例）。
