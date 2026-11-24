# 02 OK 内核入场：vendor 编译、本地文档管线、样式 / i18n、切换（S2a-1/2/3 + S2b + S2c）

[验收报告](../evidences/02-ok-editor-core.md)

规格：G01–G04、G06、G07、H01–H07、B09、B10、C06（编辑器侧）、F09 / F10（首测）；设计：[design.md](../design.md) §2 / §3 / §4 / §12 / §13；决定：OP-D01 / D02 / D03 / D04 / D05 / D06 / D15 / D16 / D18。
交付：用户角度——知识库里打开 Markdown 得到 OK 的富文本编辑器（可切源码 / 阅读），输入、保存、重开与此前一样可靠；任务描述与收件箱想法也用同一编辑器的紧凑变体。内部：OK core + app 编辑器闭包位于 `vendor/open-knowledge/`，补丁与来源可审计，`LocalDocProvider` + `host/` 就位。
依赖：S0（SP-1、SP-4 通过）；S2b 另依赖 S1 的 `DocumentSession` / `EditorPort`。
边界：**S2a 是依赖、锁文件、补丁、Tailwind / Lingui 构建配置的唯一写入者**。写 `packages/editor/src/{vendor,host,ok,rich,source}`、`scripts/ok-*`、根 `package.json` / `pnpm-lock.yaml` / `pnpm-workspace.yaml`、`vite` 配置。S2b 写 `plugins/notes/src/ui/documents` 的编辑器接入点；S2c 写 `plugins/{tasks,inbox}/src/ui` 的编辑器使用点。S2a 写 vendor 子树 `core/`、`app/editor`、`app/lib`、`app/components/ui` 与 `host/routes/core.ts`；**不写** `app/comments`（S4）、`app/components/FileTree*`（S5）。

## 当前代码指针

`packages/editor/src/{MarkdownEditor,MarkdownPreview,wikilink,mention,MermaidBlock}.tsx`、`vendor/atomic/*`、`index.ts`；消费者 `plugins/notes/src/ui/{FileCard,NotesModule,NoteDocument,archives/ArchivesViews}.tsx`、`plugins/tasks/src/ui/{TaskDetail,TaskEditor,references}.tsx`、`plugins/inbox/src/ui/InboxModule.tsx`；`apps/desktop` 的 Vite 配置（版本 `^8.3.7`，配置文件位置未核实）；上游入口见 [reuse.md](../reuse.md)。

## S2a 任务（分三段：**2a-1 内核编译与保真**〔2a.1–2a.4、2a.7 的 H01 / H04〕→ **2a-2 样式与 i18n**〔2a.5、H02 / H03〕→ **2a-3 上游测试接入**〔2a.6、`test:vendor`〕；每段结束可单独验收、单独提交）

2a.1 **依赖与补丁**：按 S0 的清单添加依赖（精确版本；`@pierre/trees` 与 `@hocuspocus/*`（如需）等 beta / rc 不用 `^`），接入 pnpm 补丁；`pnpm notices` 通过（逐包记录 `ALLOWED` 理由）。
2a.2 **vendor 复制**：按 `closure-manifest.json` 原样复制到 `vendor/open-knowledge/{core,app,server-bridge}/`（保持相对目录），带 `UPSTREAM.md`（SHA、许可证、范围）、`PATCHES.md`、`LICENSE`（`git show HEAD:LICENSE`）；`scripts/ok-patches.mjs` 重放脚本能从干净上游复现。
2a.3 **机械补丁**：`fetch('/api/…')` → `hostFetch`，`window.okDesktop` → `desktopBridge`，`@lingui` 宏编译配置，`@/` 别名映射，云协作模块（presence、sharing、lineage、auth token、otel、outbox、`y-indexeddb`）不带或以空实现占位（登记）。
2a.4 **适配层 `host/`**：`ok-host.ts`、`host-fetch.ts`（路由表，先覆盖编辑器本身与 S1 已有能力；评论 / 文件树的 handler 由 S4 / S5 追加）、`local-doc-provider.ts`、`document-context.ts`（Huhu 版，保持上游 `DocumentContextValue` 所需子集）、`desktop-bridge.ts`、`i18n.ts`。
2a.5 **样式与 i18n 接入**：`@tailwindcss/vite`；`ok/ok-globals.css`（`vendor.ok-*` 子层，变量与 base 只落 `.ok-root`，作用域 preflight 子集）+ `ok/token-map.css`；`check-ok-class-collisions`（三类交集）；Lingui `en` / `zh-Hans`；更新 `design-system.md` 草稿与 `check-css-layers` 的登记；**S2a 是依赖 / 锁文件 / 补丁 / 构建配置的唯一写入者，并为 S5（树）、S4（评论）、S7 提供它们需要的依赖**。
2a.6 **`tsconfig.vendor.json` 与检查口径**：vendor 排除 oxlint / stylelint / 前缀 / 颜色守卫（OP-D15）；`knip` 配置；`pnpm typecheck` 包含 vendor 配置；`pnpm test:vendor` 首版（上游测试迁入、分类、结果表）。
2a.7 **单测**：`LocalDocProvider` 契约（H01、H07 单测层）、`hostFetch` 路由与错误映射（H04）、`zh-Hans` 扫描脚本（H03）、Tailwind 碰撞（H02）。

## S2b 任务

2b.1 `RichMarkdownEditor`（`document` / `compact`）、`SourceEditor`、`ReadonlyMarkdown` 的封装与 `EditorPort` 实现；`bindSession`（[design.md](../design.md) §3.2）。
2b.2 `NoteDocument` 切到新编辑器；保存 / 冲突 / 草稿 / flush 行为不变（回归既有 e2e）；视图切换前统一 flush。
2b.3 大纲（`NoteInspector`）改用解析结果，修 B10（围栏代码 / YAML 里的伪标题不进大纲）。
2b.4 旧 `MarkdownEditor` 暂留（tasks / inbox 在 S2c 之前仍用它），notes 的生产路径不再引用（S8 删除）。

## S2c 任务（S2b 之后，与 S3 / S4 并行）

2c.1 tasks（`TaskDetail`、`TaskEditor`）/ inbox（`InboxModule`）迁到 `compact`（保留 `@` 引用与输入法）；量每实例成本（Q4 / H05），超预算回退到 `PlainTextEditor` + `ReadonlyMarkdown` 并登记。

## 验收

- [ ] G01 / G02 / G03：清单、补丁重放零差异、ledger / notices 条目；`pnpm notices` 无白名单放宽。
- [ ] G06：`pnpm lint / typecheck / test / test:vendor / build / knip / format:check` 全绿（vendor 口径按 OP-D15）；`pnpm e2e` 知识库 / 任务 / 收件箱子集全绿。
- [ ] G07：编辑器经动态 `import()` 分包；冷启动与非知识库模块指标对 rc.4 基线无回退（`pnpm bench` / `perf.spec.ts`），记录体积增量。
- [ ] H01：黄金样本 hydrate → serialize 字节相等；无编辑打开 / 关闭不触发 `notes.save`（单测 + e2e 断言文件 mtime 不变）。
- [ ] H02：层序含 `ok-theme` / `ok-utilities`，无 preflight；碰撞脚本为空；非知识库屏幕对 `rc4` 基线 0 差异（`pnpm visual:compare rc4`，知识库屏幕的预期变化登记）。
- [ ] H03：`zh-Hans` 扫描未翻译 msgid 为 0（白名单登记）。
- [ ] H04：每个 `hostFetch` / `okDesktop` 调用点有 handler 或不适用登记；handler 单测通过。
- [ ] H05（S2c）：tasks / inbox 紧凑变体的输入、保存、`@`、撤销、输入法 e2e 通过；每实例内存 / 初始化耗时有记录。
- [ ] H07：局部编辑只产生局部字节差异（git Vault 样本，单测层先行，git 场景由 S8 全量）。
- [ ] B09 / B10：源码 ↔ 富文本 ↔ 阅读切换保留正文、属性、草稿与位置；迟到结果不覆盖其他文件；未知语法不丢；大纲不含伪标题（e2e）。
- [ ] 真实 Electron：打开 → 输入 → 自动保存 → 关闭 → 重开 内容一致（整合点）。

## 完成证据

`PATCHES.md` + 重放脚本输出；`test:vendor` 结果表；e2e / bench / visual 报告；体积与耗时数据存 `evidence/s2/`。拟新增的脚本与测试是创建工作，结果由执行者记录。
