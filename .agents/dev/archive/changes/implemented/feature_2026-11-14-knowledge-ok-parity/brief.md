# 需求简报：知识库完整重构（移植 Open Knowledge 编辑器）

## 用户目标

Huhu 的知识库用户（也是产品作者本人）要在 Huhu 里获得 Open Knowledge（OK）那样的本地笔记体验：OK 式富文本编辑与渲染、`/` 命令、完整评论、YAML 属性、真实文件树与右键菜单、全部文件可见（可仅视图隐藏）、JSON / TXT 可编辑、PDF / HTML 可查看、档案作为真实标签与侧栏切换、固定文件图标、自适应顶部。用户明确：**直接复制 OK 的编辑器并重构，技术栈也可以重构；不保留旧编辑器、不做兼容层**。本次要交付的是**完整文档与设计**（不写代码），供后续实施。

## 来源与已有决定

| 来源 | 版本 / 时间 | 相关事实或用户决定 |
| --- | --- | --- |
| GitHub issue #2「[知识库完整重构] 直接移植 Open Knowledge 编辑器…」 | 创建 2026-11-14T14:15Z（作者 NAMEWTA），基线 Huhu `9132640`（rc.4） | 正文 = 完整调查与实施方案（产品契约、缺口 F01–F10、复用决策、目录规划、S0–S8、验收 A01–F10）；原文存档 [source-issue-2.md](source-issue-2.md) |
| issue 评论 1（用户补充） | 2026-11-14T14:25Z | **优先于正文的技术选型限制**：直接复制 OK 编辑器并重构；CodeMirror 非必须；可保留 Yjs 等编辑器依赖；样式技术可随源码移植并同变更更新规范；不保留旧 / 新双链路；磁盘仍是事实来源 |
| 用户口头指令（本次 `/dev-workflow`） | 2026-11-14 | 拉取 issue #2、新建 change、以其为源、按项目知识库实际情况激活相关技能做完整文档与设计；`temp/sources/{orca,open-knowledge}` **复制复刻即可**，**编辑器以 open-knowledge 为主**；技术栈可完整重构 |
| 项目规则 | `CLAUDE.md` | 复用优先顺序；搜索交子代理；测试交 `audit`；中上难度咨询顾问 |
| 既有决定 | `D-08` / `D-09` / `D-31` / `product.md:66` | 编辑器选型曾否决 Tiptap / PM / Yjs，样式曾否决 Tailwind——**将被本 change 取代**（[decisions.md](decisions.md) OP-D01） |

## 当前事实

调查全文见 [evidence/e0-source-survey.md](verification/e0-source-survey.md)。要点：

- 本地来源工作副本存在且与 issue 固定 SHA 一致（OK `44a2e0a`、ORCA `7041ea02`）；Huhu 与 OK 同为 GPL-3.0-or-later，ORCA 为 MIT。
- issue 的 F01–F10 缺口大多成立（有细节订正：`isNoteFile` 只查第一段目录；空目录不在 `vault.tree`；`FileCard` 把 HTML 当源码显示；无 `contextmenu`；标签是单选字符串 + 独立 `folderView`）。
- OK 编辑器闭包很大：静态 import 闭包 **861 文件 / 约 12.3 万行 / 126 个 npm 包**；文档真源是 `Y.Text('source')`；Tailwind v4（`globals.css` 7079 行）；Lingui（`zh-Hans` 现成 4064 条）；评论是 REST + 文件而非 Yjs；有 issue 没列的属性面板（约 3163 行）。
- ORCA 的 PDF 查看器可摘取（约 19 文件 / 1.6k 行 + `pdfjs-dist 6.3.289` 补丁）；**HTML 预览是内嵌浏览器标签页，不可复制**。
- OK 的“隐藏”写 `.okignore`，与 issue 要求的“仅视图隐藏”相反。
- **尚未验证（推断，单独注明）**：用户报告的选区 / 上下行异常的根因；闭包能否在 Huhu 构建里编译；Y 本地化后的往返保真。这些由 S0 的闸门 spike 回答。

## 范围与非目标

范围 = [spec.md](spec.md)（采纳 issue §1 / §5–§10 / §14 并订正）。非目标：OK 的账户 / 组织 / 云协作 / presence / Share / OpenWithAi / 云同步 / git 影子历史；恢复独立档案插件；Obsidian 虎符的 schema；ORCA 的 Git / WSL / 远程 / 浏览器标签页体系；历史格式迁移框架、兼容层、双写、“试用新版”开关；不相关业务（任务 / 终端 / 调度）的重写。Windows / macOS 实机与真实输入法验证按“未验证”登记。

## 成功条件

用户能在真实 Electron 里连续完成：打开全部真实文件 → 隐藏目录仍能 `@` → OK 式编辑器里选择 / 输入 / `/` 插块 / 编辑属性 / 评论 → 保存重开一致 → 同一资源系统里编辑 JSON / TXT、查看 PDF / HTML → 打开真实档案标签并切换侧栏 → 切回文件继续编辑；旧链路清理到位，门禁与证据齐全（[verification.md](verification.md)）。

## 待决问题

全部在 [spec.md](spec.md) §9（Q1–Q10）：许可证确认、OK 非核心功能分类（lint / audit、Share、presence、history、Excalidraw / Mermaid 文档）、外链预览联网策略、紧凑变体成本、块级合并是否排期、上游是否升级、真机验证是否作为归档条件、对外接口变化（`vault.tree` / `notes.files` 删除对 MCP / CLI 的影响）、体积预算、OK 分屏能力归类。均可由用户一句话决定；不阻塞文档与 S0。
