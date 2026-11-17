# 进度：知识库完整重构

## 状态（2026-11-14，文档阶段结束）

**规格、设计、决定、复用核对、计划、任务与验证方案已完成；尚未实施，没有产品代码改动。**

| 切片 | 状态 | 证据入口 / 下一步 |
| --- | --- | --- |
| 文档与设计（本 change） | 完成，顾问复核意见已吸收，待用户确认 Q1–Q10 | 本目录；[evidence/e0-source-survey.md](evidence/e0-source-survey.md) |
| S0 来源冻结与闸门 | **进行中（2026-11-15）**：闭包清单、端点矩阵（机械）、s0-facts、SP-1（仅 typecheck）、SP-4（部分）已出；复刻矩阵、rc4 复现与视觉基线、SP-2/3/5/6 未做；**闸门未通过，不得进入 S1** | [tasks/00-freeze-and-spikes.md](tasks/00-freeze-and-spikes.md)；**下一步** |
| S1 资源目录、会话与标签契约 | **完成（2026-11-15，分支 `worktree-agent-adad71041bd4ce01a`）**；`vault.tree` / `notes.files` 的迁移与删除按计划留到 S5，其余偏差见契约冻结文档 §7 | [evidence/contracts-freeze.md](evidence/contracts-freeze.md)、[evidence/s1/verification.md](evidence/s1/verification.md) |
| S2a（2a-1/2/3）/ S2b / S2c | 未开始 | S2a 依赖 S0；S2b 依赖 S1 + S2a；S2c 依赖 S2b |
| S3 编辑行为对等 | 未开始 | |
| S4 评论 | **完成（部分验收项登记为未验证）**：OK 评论 UI 接 `comments.*`（引用文字锚点、回复 / 解决 / 删除确认、整篇批注）；e2e D01–D06 9 passed；上游非 dom 评论测试 190 通过 | [evidence/s4/verification.md](evidence/s4/verification.md)、[comment-field-map.md](evidence/comment-field-map.md)、[parity/comments.md](evidence/parity/comments.md) |
| S5 文件树与隐藏 | 未开始 | |
| S6 档案标签 | 完成（E01–E04 通过；E05“附件走统一查看器”待 S7） | [evidence/s6/verification.md](evidence/s6/verification.md) |
| S7 查看器与图标 | 未开始 | |
| S8 清理与全回归 | 未开始 | |

## 本次文档阶段做了什么（可复核）

- 用 `gh issue view 2` 拉取 issue（正文 33,818 字符 + 1 条评论），原文存档；未改动。
- 调查（只读，由 `search` / `grep` 子代理在本地工作副本上取数，主会话汇总）：OK 编辑器 / core 闭包与文档模型；OK 评论 / 文件树 / 菜单 / 图标 / 属性；OK `/api` 调用面与 i18n / Tailwind 配置；OK server 持久化与 provider 语义；ORCA 查看器；Huhu 现状 F01–F10；既有决定与规范；obsidian-huhu 档案导航。结果见 `evidence/e0-source-survey.md`，其中“未核实”项由 S0 补。
- 复用核对按 `CLAUDE.md` 顺序做，见 `reuse.md`。

## 对 issue 的主要订正（详见 spec §3）

来源已在本地；**保留 Yjs（本地运行，无 Hocuspocus）**；ORCA HTML 预览不可复制，自研隔离方案；OK 的“隐藏”是 `.okignore`，不能照搬；OK 有 issue 没列的属性面板；OK 没有独立阅读模式；OK 评论不依赖 Yjs；`isNoteFile` 只查第一段目录；Tailwind / Lingui 是实质性的技术栈变化，需要同变更更新设计系统规范。

## 未做 / 未验证（如实）

- 没有写任何代码；没有运行任何构建 / 测试；没有在真实 Electron 里复现用户报告的选区 / 上下行问题。
- **未证实的假设**：闭包能在 Huhu 构建里编译（SP-1）；Y 本地化后的往返字节保真（SP-4）；**`LocalDocProvider` 挂 `TiptapEditor` 在真实 Electron 里能完成来回切 / 切源码 / 撤销 / 无编辑不写盘（SP-6）**；Tailwind v4 能限定在 `.ok-root` 且 `layer(vendor.ok-*)` 子层在构建里可行、Lingui 宏在 Vite 8 下可接入（SP-2 / SP-3）；两套 YAML 编解码的差异（SP-5）；HTML 预览两种隔离方案哪个能通过 F05（SP-7，S7 开头）；上游测试在适配后的通过率；若干 Huhu 内部入口的具体位置（每 Vault UI 偏好设施、导航贡献设施、主进程协议注册入口、pnpm 补丁机制、`CommentDto` 定义），均标“未核实”，S0 / S1 核实。
- 用户待确认：[spec.md](spec.md) §9 的 Q1–Q10。
- **闸门阈值已写死**（decisions OP-D02，用户可调但 S0 前定、S0 不得事后放宽）：补丁 ≤ 150 个文件、`DocumentContext` / `provider-pool` 的 Huhu 侧替换 ≤ 1200 行、上游测试适配后通过率 ≥ 70%。这些数字是我的拟定值，没有用户确认。
- 真实输入法、Windows / macOS 实机验证：本环境无法进行，实施阶段按“未验证”登记。

## S0 实际进展（2026-11-15）

- `scripts/ok-closure.mjs` → `evidence/closure-manifest.json`：**931 文件（app 619 / core 312）/ 141,688 行 / 133 个 npm 包**（115 新增、16 版本不同）；比 E0 的 861 / 12.3 万 / 126 大，因入口补入了 DocumentContext、FileTree、PropertyPanel、评论组件。
- `scripts/ok-endpoints.mjs` → `evidence/endpoint-matrix.md`：140 个调用点 / 85 条 `/api` 路径 / 14 个 `okDesktop` 成员（机械提取，形状与映射列未填）。
- `evidence/s0-facts.md`、`evidence/spikes/sp-1.md`（typecheck 剩 36 条已分类错误，Vite build 待 SP-2/3）、`sp-4.md`（444 个 Huhu md：字节相等 66%、规范化后相等 85%；**无编辑不写盘需靠原始源文本，未在原型上验证**）。
- spike 代码：分支 `scratch/ok-spike`（`a910cfb`，worktree `../huhu-spike`），不合入 main。
- 未做：SP-2 / SP-3 / SP-5 / SP-6、rc.4 问题复现、`rc4` 视觉基线、复刻矩阵、上游差异（远端 OK 已有更新提交，仅记录未升级）。

## S2a 进展（2026-11-15，分支 `feat/knowledge-ok-parity`）

| 项 | 结论 | 证据 |
| --- | --- | --- |
| SP-1 编译闸门 | **通过**（tsc 0 错误；Vite 8 构建通过；补丁 5 改 / 4 删，阈值 150） | `evidence/spikes/sp-1.md`、`node scripts/ok-patches.mjs --check` |
| SP-6 运行时闸门 | **通过**（真实 Electron：无编辑字节相等 / 输入 / 来回切 / 源码模式 / 撤销 / 驱逐；Huhu 侧替换约 630 行，阈值 1200） | `evidence/spikes/sp-6.md`、`packages/editor/test/e2e/sp6.spec.ts` |
| SP-2 Tailwind 限定 | 部分通过：`.ok-root` 作用域 + `vendor.ok-*` 子层可行，碰撞检查 C=0；`visual:compare rc4` 未做 | `evidence/spikes/sp-2.md` |
| SP-3 Lingui | 通过（en / zh-Hans） | `evidence/spikes/sp-3.md` |
| SP-5 YAML | 通过（11/12 字节相同，差异为对拍包装器） | `evidence/spikes/sp-5.md` |
| SP-4 往返保真 | 部分：往返数据 + LocalDocProvider 无编辑字节相等；22 个黄金样本全量、`replaceRawBody` 撤销栈未做 | `evidence/spikes/sp-4.md` |
| `test:vendor`（core） | 适用文件 143/146 = 97.9%（≥70%）；app dom 测试未迁入 | `evidence/vendor-test-results.md` |
| 依赖 / 许可证 / 补丁 | pnpm `patchedDependencies` 9 条；`gen-notices` 登记 `@pierre/trees`、`pako`；tiptap 全系固定 3.22.3 | `pnpm-workspace.yaml`、`PATCHES.md` |

**S0 闸门判定**：SP-1 / SP-6 通过且量在阈值内；SP-4 未完全验证。**S2a 完成度**：2a-1（编译 + LocalDocProvider + host 骨架 + 本地 bridge）、2a-2（Tailwind / Lingui / 补丁 / 碰撞守护 / ok-patches）已做；2a-3 只迁入 core 测试。**S2a 未做**：app 的 dom 测试迁入；`OkHost.features` 与 `host/desktop-bridge.ts`（`window.okDesktop` 的 Huhu 等价物，需要端点矩阵的 14 个成员逐个对应，S2b / S5 用到时再做）；`routes/comments.ts`、`routes/files.ts`（S4 / S5）；`@hocuspocus/provider` 之外还留有 `y-indexeddb`（`client-persistence`）依赖，S2b 决定是否经别名关闭；React Compiler preset；`rc4` 视觉基线与复现（S0 项）。

## S2b / S2c（2026-11-17）

- S2b：`NoteDocument` 已切到 OK 编辑器（`packages/editor/src/rich`：`RichMarkdownEditor` / `ReadonlyMarkdown` / `SourceMarkdownEditor` / `OkRoot` / provider 池；`plugins/notes` 经动态 import 加载 `NoteEditorSurface`）。整合点通过：真实 Electron 打开—输入—保存—重开、无编辑不写盘、立即切换 / 关闭不丢最后字符、三视图切换、撤销。详见 [evidence/s2/s2b-verification.md](evidence/s2/s2b-verification.md)。
- S2c：tasks / inbox 用紧凑变体；`@` 引用补全；P-S2c-01 补丁；Q4 成本数据入证据。
- **未关闭**：F09（1 MiB 打开 6.6 s、5,000 行输入延迟用例超时）；格式化工具栏 / 属性面板 / 评论锚点装饰分别属于 S3 / S4（NoteDocument 已去掉旧格式按钮与 `comments` 装饰）；批注的源码偏移在富文本模式下按“选中文本在源码里唯一匹配”近似，S4 重做。
