# #7 快捷命令库与安全预览

- terminal_address — `t4x`，本机默认 Core `wta-ubuntu`，Lead `t3p`
- task — `task06.md`
- 共享根 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux`
- 工作树 — `/home/wta/projects/huhu/temp/issue-worktrees/agent-linux`，分支 `impl/huhu-issues-3-10-h7-shortcuts`，基线 `31352cae87ad11d5f12c7a3d125bc2fe8aee5189`
- 执行结果 — Vault 快捷文本库与安全预览候选已交付。工作树有一项修改和五项新增，未暂存。模块接线与浏览器验收待 Lead。

## 行为与接线

- 当前 Vault 的 `.huhu/ssh/shortcuts.json` 保存版本 1 的有序数组，项目为 `{ id, name, group?, text }`，已存无分组条目可读，正文保留 Unicode、多行、换行序列和制表符。最多 200 项，名称/分组最多 80 个 UTF-16 代码单元，正文最多 8192，序列化文件最多 256 KiB。缺失文件返回空库，早于当前内容的版本令牌返回 `VERSION_CONFLICT`。复用 VaultFiles 原子替换、路径守卫与提交前取消检查。 [共享契约](/home/wta/projects/huhu/temp/issue-worktrees/agent-linux/plugins/ssh/src/shared/shortcuts.ts) · [存储与 handler](/home/wta/projects/huhu/temp/issue-worktrees/agent-linux/plugins/ssh/src/engine/shortcuts.ts)
- `ssh.shortcuts.list({})` 返回 `{ revision: string | null, shortcuts }`，`ssh.shortcuts.save({ expectedRevision, shortcuts })` 返回新快照。保存成功发布仅含固定标识的 `entity.changed`。描述符与 handler 允许桌面及独立 Web 工作台，CLI、MCP、受权 HTTP 外部调用关闭。能力只管理库内文本。
- `ShortcutPanel` 管理创建、编辑、删除、分组、同组上下移动和按名称、分组、正文的搜索。`ShortcutPicker` 选择后填入现有输入和预览。用户选定当前、全部可输入或逐项勾选的可见分栏，再显式插入或发送并回车。预览绑定分栏、会话 ID 和输入回调，换内容时替换，目标隐藏、换代或失权时丢弃。保留终端原有分段粘贴行为，共享的控制字符检查与现有粘贴实现逐码点比对。 [库界面](/home/wta/projects/huhu/temp/issue-worktrees/agent-linux/plugins/ssh/src/ui/ShortcutPanel.tsx) · [预览与投递](/home/wta/projects/huhu/temp/issue-worktrees/agent-linux/plugins/ssh/src/ui/TerminalActions.tsx)
- Lead 接线时把同一 `sshShortcutDescriptors` 对象的两项加入静态聚合，把两能力名加入 SSH 清单，在 Engine SSH 注册处调用 `registerShortcuts(api)`。静态登记和 handler 绑定需要复用同一描述符对象。SSH 导航「快捷命令」渲染 `ShortcutPanel`，`WorkspaceRunView` 调用 `TerminalActions` 时传 `activeTargetId={activePane?.paneId}`，沿用现有 `targets`。E2E 以这些接线为前提。

## 验证与待运行项

- Node `24.21.0` 下运行 `pnpm --config.verifyDepsBeforeRun=false exec vitest run plugins/ssh/test/shortcuts.test.ts`，最终 1 文件、5 项通过。使用隔离 Vault 与真实 Dispatcher 验证空库、旧条目、跨 Vault 隔离、重开顺序、CAS 并发冲突、大小和格式限制、取消、控制字符、两种工作台的调用权限，以及事件、审计和日志的正文观察。前两次同文件运行定位到测试夹具需先登记描述符，以及外部未开放能力应断言 `CAPABILITY_NOT_EXPOSED`，修正后复跑通过。 [定向 Vitest](/home/wta/projects/huhu/temp/issue-worktrees/agent-linux/plugins/ssh/test/shortcuts.test.ts)
- `pnpm --config.verifyDepsBeforeRun=false exec tsc --noEmit -p plugins/ssh/tsconfig.json` 最终退出 0。
- [shortcuts.spec.ts](/home/wta/projects/huhu/temp/issue-worktrees/agent-linux/tests/e2e/ssh/shortcuts.spec.ts) 已编写「快捷文本排序持久化，预览仅向显式选定的可输入分栏交付」及「独立 Web 工作台可管理 Vault 快捷文本，桌面读取同一版本」。首项包含搜索、选择、按目标插入/发送、失权、隐藏和关闭原会话。第二项通过浏览器分享链接创建、换组、删除，并用桌面读取所存版本。两项均未执行。真实桌面与 Web 渲染、键盘走查、Playwright、Electron、构建和打包待验收。本片只有本地工作树与共享报告写入。

## 上游和 Modern Web Guidance

- 参考确认的 Issue §6.2、H10 与 H5.2，以及 Motty `v0.4.12` 固定提交 `102228261703d8f22c5eb98b1c500e2a24889dee`。读取 `snippets.go`、`snippet_groups.go` 的管理、分组与排序，`snippet_picker.go` 的可搜索选择，以及 `snippet_send.go` 的目标与回车选择。采用行为参考，源码和资产复制量为零。Apache-2.0，NOTICE 署名 Motty contributors。 [Motty 固定源码](https://github.com/t8y2/motty/tree/102228261703d8f22c5eb98b1c500e2a24889dee/internal/workbench) · [LICENSE](https://github.com/t8y2/motty/blob/102228261703d8f22c5eb98b1c500e2a24889dee/LICENSE)
- 使用技能 `2026_11_10-47b4c80e` 与本机缓存。以 `NPM_CONFIG_CACHE=/tmp/huhu-web-npm npx --offline -y modern-web-guidance@latest search … --skill-version 2026_11_10-47b4c80e` 搜索 `label search input`、`group checkbox controls`、`submit form buttons`，再用相同前缀执行 `retrieve forms,accessibility,html`。Electron 固定版本为 44.9.1。独立 Web 按 Baseline Widely available 使用原生搜索、输入和折叠。 [Electron 44.9.1](https://releases.electronjs.org/release/v44.9.1) · [HTML search](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/search)
- **`forms`**　我为保存使用原生表单提交，为选择、重排和取消设定按钮类型，避免隐式提交。依据 “explicitly set `type="button"` on secondary or helper buttons”。
- **`accessibility`**　我使用 `useId` 将名称、分组、正文、搜索与预览输入关联到可见标签。依据 “Explicitly associate `<label>` with its control via `for`/`id`”。
- **`html`**　我用原生 `<search>` 标记筛选入口，沿用 `details` 展开终端操作。依据 “place `<summary>` as the first child of `<details>`”。

## 文件 SHA-256

```text
39622d060f3eac35841df705acaf7b2c47cb53803335ac3a293f779c0e6b9403  plugins/ssh/src/shared/shortcuts.ts
e5b6eac1d59b17fe1376e0b1f04899a415f4244ceff942bce16ab6d64016747b  plugins/ssh/src/engine/shortcuts.ts
3255cbaccba252ac79c2c98a3467ecd11e288631bb50142d6a7cc38a6d837b65  plugins/ssh/src/ui/ShortcutPanel.tsx
4c304460443bddb50bb1c73ff91bd07571d05f5bb6f397ff7e3810463b5b51d4  plugins/ssh/src/ui/TerminalActions.tsx
895d80ed731d361b7a3e0eae8521fb27f4a1194d427413197dea96efcc18da93  plugins/ssh/test/shortcuts.test.ts
3d77a63018e7b10275cc32d1d48cb8172c6d6d69384af41f364bf1e4396fa52c  tests/e2e/ssh/shortcuts.spec.ts
```

## Core 回告

`hc get t4x` 返回 `cannot open core lock: Read-only file system (os error 30)`。已核对终端环境、topic、manifest、分支和基线。

报告发布后向 `t3p` 执行 `hc send`，同样返回 Core 锁只读，退出码 5。回告未送达，共享报告可读取。

## Lead 验收

工作者候选归档 `c3a9bcde`，实际集成为 `feddafd8`。SSH 导航和可见分栏选择已接线，Vault 级读写分别加入默认关闭的工具目录，逐项授权，保存提交前复核权限。SSH、Kernel、Workbench 类型检查和 7 项定向测试通过。桌面、独立 Web 的两条 Playwright 用例已枚举，实际 E2E 与安装包验证待运行。
