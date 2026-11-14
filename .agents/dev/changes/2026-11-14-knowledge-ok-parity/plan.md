# 实施计划：知识库完整重构（OK 编辑器移植）

目标：[spec.md](spec.md) 的 A01–F10 与 G / H 全部验收，且 §1 的完整用户路径在真实 Electron 里连续走通。
规格：[spec.md](spec.md)　设计：[design.md](design.md)　决定：[decisions.md](decisions.md)　复用：[reuse.md](reuse.md)　验证：[verification.md](verification.md)　界面：[ui-design.md](ui-design.md)
交付点：本地完成 → **整合分支** `feat/knowledge-ok-parity` 上全部门禁通过 → 用户确认后合入 `main`（是否推送 / 发版由用户另行授权；本 change 的授权终点到“规格与计划文档完成”，**未授权写代码**）。

> 这是**大型跨包重构**：编辑器内核替换无法“新旧并存”（用户明确禁止兼容层与双运行链路），所以采用“**垂直切片 + 诚实的整合边界**”（`dev-plan`）：切片按用户可验证行为拆，但 S2b 是一次不可分的切换，允许其前后的少量提交暂时不可运行，整合点见下。**任何一个阶段完成都不得宣称“整体复刻完成”**。

## 1. 切片索引

| 切片 | 完成后的行为（可演示 / 可验证） | 真正依赖 | 唯一写入者与边界 | 验证方式与通过判据 |
| --- | --- | --- | --- | --- |
| [S0 来源冻结与闸门](tasks/00-freeze-and-spikes.md) | 来源 SHA 与闭包清单固化；用户问题在 rc.4 上复现并存证；`rc4` 视觉基线生成；5 个 spike 出结论；复刻矩阵与端点矩阵成文；**闸门：SP-1（编译）、SP-4（往返）与 SP-6（真实 Electron 运行时）通过，且补丁 / 重写量在写死阈值内** | 无 | `evidence/`、`scripts/ok-closure.mjs`、`scratch` 分支；不改产品代码 | SP-1：vendor 闭包在 Huhu 的 Vite 8 构建里编译 + `tsconfig.vendor.json` typecheck 通过；SP-4：黄金样本 hydrate → serialize 字节级相等；**SP-6：真实 Electron 里 `LocalDocProvider` 挂 `TiptapEditor`，两文件来回切（触发 park / evict）、切源码、撤销、无编辑不写盘全部成立**；补丁 ≤ 150 个文件、`DocumentContext` / `provider-pool` 的 Huhu 侧替换 ≤ 1200 行（decisions OP-D02，写死不得事后放宽）；其余 spike 有“通过 / 回退方案”结论 |
| [S1 资源目录、会话与标签契约](tasks/01-resources-session-tabs.md) | `vault.list` 实现且旧文件树（仍用 `notes.files`）不受影响；`DocumentSession` + `DocumentSessionRegistry` 抽出且现有笔记编辑 / 保存 / 冲突 / 草稿行为不变；`DocTab` 与 `EditorPort` 契约落地；`hiddenPaths` 偏好可读写；`vault.readRange` 契约；共享 `FileIcon`；`NotesModule` 拆成组合壳；`vault.tree` 除旧树外的消费者迁完（**`vault.tree` / `notes.files` 的删除在 S5 结束时**） | S0 | `packages/{contracts,kernel,vault}`、`plugins/notes/src/{engine,ui/documents,ui/tabs}`、`plugins/notes/src/ui/NotesModule.tsx`（**仅做拆分成组合壳，之后 S6 是它的唯一写入者**）、`packages/ui/src/components/FileIcon.tsx`、`packages/workbench/src/{engine-client,resources}` | 空目录 / Tasks 可见 / 保存冲突回归（单测 + e2e）；旧编辑器上笔记既有 e2e 全绿 |
| [S2a 内核入场](tasks/02-ok-editor-core.md)（与 S1 并行；分三段 2a-1 内核编译与保真 → 2a-2 样式与 i18n → 2a-3 上游测试接入） | OK core + app 编辑器闭包进入 `vendor/open-knowledge/`，`PATCHES.md` / `UPSTREAM.md` / `LICENSE` 就位；`LocalDocProvider` + `host/` 单测通过；Tailwind（`.ok-root` 作用域）/ Lingui / 补丁依赖接入；`pnpm build` 与 vendor typecheck 通过；`pnpm test:vendor` 首版结果表 | S0 | `packages/editor/src/{vendor/open-knowledge/{core,app/editor,app/lib,app/components/ui},host,ok}`、`scripts/ok-*`、**依赖 / 锁文件 / 补丁 / 构建配置的唯一写入者** | H01 / H02 / H03 / H04 的单测层；`test:vendor` 结果表 |
| S2b 切换 notes 到新编辑器 | `RichMarkdownEditor` / `SourceEditor` / `ReadonlyMarkdown` 装入 `NoteDocument`；旧 `MarkdownEditor` 暂留（tasks / inbox 仍用）到 S2c / S8 | S1（会话 / `EditorPort`）、S2a | `plugins/notes/src/ui/documents`、`packages/editor/src/{rich,source}` | 知识库既有 e2e 全绿；Electron 真实打开—输入—保存—重开 |
| S2c tasks / inbox 迁到 `compact` | 任务描述与收件箱想法的输入用 `RichMarkdownEditor` 紧凑变体 | S2b | `plugins/{tasks,inbox}/src/ui` 的编辑器使用点 | 任务 / 收件箱既有 e2e 全绿；H05；与 S3 / S4 并行 |
| [S3 编辑行为对等、属性与工具栏](tasks/03-editing-parity.md) | 复刻矩阵逐项完成：`/`、气泡菜单、块与表格、剪贴板、选区 / 上下行、IME、撤销、模式切换；顶部属性区；工具栏自适应 | S2b | `packages/editor/src/{rich,host}`、`plugins/notes/src/ui/documents`、vendor 补丁 | B01–B10、C01–C06、F07；对照 OK 基线的并排证据 |
| [S4 评论](tasks/04-comments.md) | OK 评论 UI 全套接 `comments.*`；锚点适配与孤立处理；属性评论 | S2b（编辑器宿主插槽）、S1 | `plugins/notes/src/ui/comments`、`packages/editor/src/vendor/open-knowledge/app/comments`、`host/routes/comments.ts`、适配单测 | D01–D06 |
| [S5 文件树、菜单、隐藏与 `@`](tasks/05-explorer.md) | OK 树与右键菜单接真实资源；仅视图隐藏 + 恢复入口；共享 `@` 候选；计数与失效 | S1（`vault.list`、`hiddenPaths`、`FileIcon`）；**S2a（依赖 / `@pierre/trees` / Tailwind 的 `.ok-root` 作用域与 `hostFetch` 骨架）**；S0（树闭包） | `plugins/notes/src/ui/explorer`、`packages/editor/src/vendor/open-knowledge/app/components/{FileTree*,file-tree-*,FileTarget*,OkFileTree*,…}`（树子树）、`host/routes/files.ts`、`packages/workbench/src/resources`；**S5 结束时删除 `notes.files` 与 `vault.tree`（或改名），并迁走旧文件树** | A01–A10 |
| [S6 档案标签与侧栏切换](tasks/06-archives-tabs.md) | 顶部分区顺序；档案首页 / 类型 / 记录是真实标签；侧栏上下文切换；普通目录不自动渲染；同一 `index.md` 同一会话 | S1（`DocTab`） | `plugins/notes/src/ui/{tabs,archives}`、`NotesModule` | E01–E05 |
| [S7 查看器与图标](tasks/07-viewers-icons.md) | JSON / TXT 可编辑；PDF（ORCA 摘取）；HTML 隔离预览；图片 / 未知元信息；固定图标 | S1（分派 / 会话 / `vault.readRange` 契约） | `plugins/notes/src/ui/viewers`、`plugins/notes/src/vendor/orca`、`packages/editor/src/plain`、`apps/desktop` 预览协议或隔离视图（`FileIcon` 由 S1 交付，S7 只消费） | F01–F06、F10（查看器部分） |
| [S8 清理、文档与全回归](tasks/08-cleanup-regression.md) | 旧链路删除清单全部核对；`ledger.md` / notices / 说明文档 / demo Vault / 能力说明更新；全门禁与真实 Electron 对照；证据完备；用户可连续完成 §1 路径 | S2b–S7 全部 | 全仓库（只做清理 / 文档 / 回归） | G01–G07、H01–H07 + 全部 A–F；`pnpm` 全门禁；`e2e:packaged` |

## 2. 顺序与并行

```text
S0 ──► S1 ──┬──► S6 ──────────────────────┐
      │     ├──► S7 ──────────────────────┤
      │     ├──► S5 ──(也依赖 S2a)────────┤
      │     └──► S2b ─┬─► S2c ──────────────┤──► S8
      │               ├─► S3 ───────────────┤
      └──► S2a ───────┘ └─► S4 ─────────────┘
                S2a ───► S5
```

- **共享契约先行**（S1 的第一个产出，之后冻结，改动要回到计划修订）：`DocumentSession`、`EditorPort`、`DocTab`、`vault.list` / `vault.readRange` / `hiddenPaths` 的 DTO。S2a、S5、S6、S7 都建立在这些契约上，所以 **S1 的契约部分（任务 1.1）排在所有并行工作前**。
- **S1 ∥ S2a**：互不写同一文件（S1 在 contracts / kernel / vault / notes；S2a 在 `packages/editor/src/{vendor,host,ok}` 与依赖）。共享风险：根 `package.json` / `pnpm-lock.yaml` / `pnpm-workspace.yaml`（补丁）——**S2a 是依赖与锁文件的唯一写入者**，S1 / S7 需要新依赖时向 S2a 提出，不各自改锁文件。
- **S5 依赖 S2a**（依赖 / Tailwind `.ok-root` 作用域 / `hostFetch` 骨架），所以 S5 在 S2a 的 2a-1 / 2a-2 完成后开始；**S6 / S7 只依赖 S1**，可更早开始。S5 / S6 / S7 之间互相并行：
  S5 写 `ui/explorer`，S6 写 `ui/tabs` 与 `NotesModule` 的标签接线，S7 写 `ui/viewers`。**`NotesModule.tsx` 是共享热点**：S1 把它拆成组合壳（任务 1.5）后，S5 / S6 / S7 只通过各自目录导出的组件接入，由 S6 作为 `NotesModule` 接线的唯一写入者；S5 / S7 提交“接线请求”清单（组件名 + props），避免三方改同一文件。
- **vendor 子树归属**（全部在 `packages/editor/src/vendor/open-knowledge/` 下，单一 `@source` / `UPSTREAM.md` / `PATCHES.md`）：`core/`、`app/editor`、`app/lib`、`app/components/ui` → S2a / S3；`app/comments` → S4；`app/components/FileTree*` 等树子树 → S5。`host/routes/{core,comments,files}.ts` 分别归 S2a / S4 / S5，`host-fetch.ts` 只组合，不放业务路由。
- **S3 ∥ S4 ∥ S2c** 在 S2b 之后：S3 写 `rich/` 与 vendor editor 补丁，S4 写 `ui/comments` 与 vendor comments 补丁，S2c 写 tasks / inbox 的编辑器使用点，评论宿主插槽由 S2b 先留好接口；`PATCHES.md` 是共享文件，**按切片分段追加，编号前缀区分（`P-S3-xx`、`P-S4-xx`）**。
- **整合责任**：S8 的整合者是主会话（或指定的单一负责人）；各切片完成后在 `progress.md` 登记证据入口，不由切片负责人自行宣布整体完成。

## 3. 整合边界（诚实声明）

- 整合分支：`feat/knowledge-ok-parity`；`main` 在合入前保持可发布。
- **允许暂时不可运行的窗口**：仅 S2b 内“把 `NoteDocument` 从旧 `MarkdownEditor` 切到 `RichMarkdownEditor`”那组提交（tasks / inbox 的迁移已挪到 S2c，不在窗口内）；**整合点 = S2b 末，`pnpm e2e` 知识库子集全绿 + 一次真实 Electron 的打开—输入—保存—重开**。窗口之外每个切片完成时 `pnpm lint / typecheck / test / build` 与既有 e2e 必须全绿。
- 旧 `MarkdownEditor` 与 Atomic **在 S2b 之后只保留到 S8 删除**，且不再被任何生产路径引用（`git grep` 证明）；不得出现“用户可切换新旧编辑器”的入口。

## 4. 未定部分与停止条件

| 未定 / 风险 | 只阻塞 | 解除方式 | 停止条件（触发即停下汇报用户） |
| --- | --- | --- | --- |
| SP-1 闭包编译 | S2a 及之后全部 | S0 spike | 861 文件闭包在写死阈值内（补丁 ≤ 150 个文件，decisions OP-D02）无法编译 / typecheck |
| **SP-6 运行时闸门** | S2a 及之后全部 | S0 spike（真实 Electron） | `LocalDocProvider` 挂 `TiptapEditor`：两文件来回切（触发 park / evict）、切源码、撤销、无编辑不写盘任一不成立；或 `DocumentContext` / `provider-pool` 的 Huhu 侧替换 > 1200 行 |
| SP-4 往返保真 | S2a / S2b / S3 | S0 spike | 黄金样本往返有无法规范化的差异，且会导致无编辑改写用户文件 |
| SP-2 Tailwind 层序 / SP-3 Lingui 构建 | S2a | S0 spike | 无法在不污染非知识库界面的前提下接入 → 回退到 decisions OP-D05 的备选（只对树 / 评论 / 属性面板手写语义 CSS） |
| SP-5 YAML 编解码 | S3 的属性区 | S0 对拍 | 两套实现的差异无法统一 → 保留一套、另一套委托，并登记 |
| Q2（lint / audit 等分类）、Q3（外链预览）、Q7（真机验证） | S2b 之后的“复刻完成”表述、F-组安全验收 | 用户确认 | 未确认前，完成报告不得写“复刻完成” |
| 用户报告的选区 / 上下行问题根因 | B06 结论 | S0 复现 + S3 对照 | 新编辑器上仍复现 → 单独定位，不关闭 B06 |
| 上游测试在 jsdom 下的适配成本 | G04 | S2a 2a-3 首版分类 | **适配后通过率 < 70%（拟定阈值，S0 前写定，用户可调）**→ 与用户商定缩减范围，登记 |
| SP-7 HTML 预览隔离方案（协议 + iframe 或隔离视图） | S7 的 F04 / F05 | S7 开头 | 两个候选都无法通过 F05 安全用例集 → 停止并汇报，不降级为“只显示源码” |

## 5. 规格覆盖（从验收反查归属）

| 规格要求 | 实现归属 | 验证归属与入口 |
| --- | --- | --- |
| A01 全文件可见、A05 空目录、A09 计数、A10 受保护 | S1（`vault.list`）、S5（树 / 计数） | S1 单测 + S5 e2e |
| A02 / A03 / A04 隐藏、`@`、双链、惰性 | S1（`hiddenPaths`）、S5（`ui/explorer` + 共享 resources） | S5 e2e + 单测 |
| A06 / A07 / A08 菜单、操作、脏文档 | S5 | S5 e2e（含 flush / 草稿） |
| B01 复刻矩阵、B02–B10 编辑行为 | S0（矩阵）、S2b（装入）、S3（对等） | S3 e2e（真实 Electron）+ 对照 OK + `test:vendor` |
| C01–C06 属性与保存 | S1（会话）、S3（属性区） | S1 单测（保存 / 冲突）+ S3 e2e + frontmatter 黄金样本 |
| D01–D06 评论 | S4 | S4 e2e + 适配单测 |
| E01–E05 档案 | S6 | S6 e2e |
| F01 / F02 JSON / TXT、F03 PDF、F04 / F05 HTML、F06 图标 | S7 | S7 e2e + 单测 + 安全用例 |
| F07 工具栏、F08 主题 | S3、S8 | S3 截图 + `visual:*` |
| F09 性能、F10 泄漏 | S2b（首测）、S8（全测） | `pnpm bench` + 专项场景 |
| G01–G07 来源 / 许可 / vendor / 门禁 | S0（清单）、S2a（补丁 / 许可 / notices）、S8（门禁） | 脚本 + CI |
| H01–H07 技术栈接入 | S2a（H01–H04、H07 的单测层）、S2c（H05）、S8（H06 全量、H07 的 git 场景） | 单测 + e2e + bench |
| 旧链路删除（issue §13 / G05） | S8 | `git grep` + knip |
| 用户完整路径（spec §1） | S8 整合 | 一条贯穿的 Electron e2e（`tests/e2e/knowledge/journey.spec.ts`） |

## 6. 完成边界

- **完成** = G / H / A–F 全部通过（每项有证据入口），旧链路清理完，门禁全绿，贯穿路径 e2e 通过，`progress.md` 的“未验证”清单只剩用户已接受的项目（真机 IME、Windows / macOS 实机）。
- **不是完成**：只有某个阶段完成；只有 slash 菜单；只换了外观；仍有非 Markdown 只读卡片；旁路档案页面仍在；用户确认的分类（Q2）里有被暗中缩减的功能。
- **已知限制**：Windows / macOS 实机与真实输入法无法在本环境验证，由 CI 三平台子集补充并如实登记。
- 本 change 的归档遵循 `dev-archive`：`feature_<创建日期>-knowledge-ok-parity`，同时写 OP-D01 的后继决定并更新 `product.md` 非目标、`design-system.md`、`notes/context/`。
