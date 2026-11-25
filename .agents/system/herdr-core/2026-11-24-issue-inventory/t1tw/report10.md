# 派发回执

- 共享根 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory
- terminal_address — t1tw
- task — task10.md
- 任务文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/t1tw/task10.md
- 回执文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/t1tw/report10.md
- 业务验收报告 — [040-s2.md](../../../../../.agents/dev/changes/2026-11-24-issue-inventory/evidences/040-s2.md)、[041-s3.md](../../../../../.agents/dev/changes/2026-11-24-issue-inventory/evidences/041-s3.md)、[042-s4.md](../../../../../.agents/dev/changes/2026-11-24-issue-inventory/evidences/042-s4.md)
- 执行结果 — done，交回 S2/S3 两处 E2E 返修和 S4 已完成部分

## 成果与运行指针

工作目录 `/home/wta/projects/huhu/.agents/dev/worktree/inv-w2`，分支 `inv/w2`。业务基线 `30406c46`，快进到派发提交 `e5584566` 后实施。候选 `d55af36d258a80373b2527c66f1181034c158a34`，工作树干净，`git diff e5584566..HEAD --check` 已通过。本次验证终端已回收。

### S2 · 21e1d1ec3d8348fce39de0b274bb8e72f4af08d7

- 改动文件 — `tests/e2e/ssh/host-records.spec.ts`。
- A01 超时来自行过滤的 `has` 定位器。它在候选行内部从外层「SSH 主机目录」区域重新搜索。现以内层复选框的精确名称匹配行，仍要求行存在并能操作，继续核对右键、选区、重排与部分删除。依据为 [Lead 原 E2E 日志](../../../../../temp/dev/2026-11-24-issue-inventory/runs/lead/e2e-ssh-s3.log)。
- 测试文件变更。Playwright 收录下列 A01 用例，未运行实际 E2E。

### S3 · ea703c427256e6d565ee53b27e80a5ce8f34c94a

- 改动文件 — `tests/e2e/ssh/remaining.spec.ts`。
- H5.2 原用例把三个就绪 Shell 等同于三个已挂接终端视图。共用 TerminalView 首次收到非零尺寸时才挂接，初始标签只显示一栏。现按三个原 Shell ID 分别确认挂接开销，依次核对工具栏拖动前后 `[1,0,0]`、第二次显示新分栏后 `[1,0,1]`、首次访问全部并重复切换后 `[1,1,1]`。原有 SSH 连接数、布局版本、Pane 与 Shell 身份断言继续检查。
- 测试文件变更。Playwright 收录下列 H5.2 用例，未运行实际 E2E。

### S4 · d55af36d258a80373b2527c66f1181034c158a34

- 改动文件 — `plugins/ssh/src/engine/sftp.ts`、`plugins/ssh/src/ui/{FileWorkspace,FilesPanel,TransferCenter}.tsx`、`plugins/ssh/src/ui/{file-history.ts,files.css}`、`plugins/ssh/test/{file-history,sftp,transfer-publication}.test.ts`、`tests/e2e/ssh/file-properties.spec.ts`、`tests/e2e/workflows/ssh-workspaces.spec.ts`。
- A07 本机、远端各自维护有界浏览历史。远端可直接输入路径，只有成功读取才更新位置和历史，失败保留当前目录与前进分支。切换本机授权根时重置本机历史。双栏交换与独立 Web 升级用例核对相同 fileSessionId 和 connectionId。Web 场景只操作远端面板，本机目录仍通过桌面设备选取。
- A08 冲突对话框初始焦点落在保留原件。两端使用实际回环 SFTP 传输夹具。等待覆盖时目标被修改会返回 `VERSION_CONFLICT` 并保留最新目标。原连接被替换后，旧任务返回 `SSH_DISCONNECTED`，禁止在新连接重试。两条回归都读取实际目标并核对没有遗留暂存文件。
- A09 远端文本版本同时涵盖原 UID、GID、权限和内容。写入先暂存，在属主或属组确有差异时请求保留，随后恢复权限位并回读核对。发布前重验原版本。服务端拒绝属性写入时，保留原文件并清理暂存。旧代码的回环复现有两项失败，分别为替换后属组丢失和只变更属组时仍允许旧草稿写入。[基线复现](../../../../../temp/dev/2026-11-24-issue-inventory/runs/t1tw/task10/sftp-edit-red.log)。
- A09 目录跟随仍消费原会话的一次性提示符授权。文件目录已成功读取时，Shell 响应不确定会明确提示，保留刚打开的目录和历史。已有 Bash 场景接到 Linux `/bin/bash`，使用隔离 HOME 和临时目录，覆盖空闲、全屏、竞争输入和切换分栏。该 E2E 由 Lead 运行。

### 已运行的定向检查

验证使用 `/home/wta/projects/huhu/temp/dev/verify.lock` 串行执行，各命令使用 `volta run --node 24.22.1`。验证日志保存在 [task10 运行目录](../../../../../temp/dev/2026-11-24-issue-inventory/runs/t1tw/task10)。

| 命令后半段 | 结果 |
| --- | --- |
| `pnpm --filter @huhu/plugin-ssh run typecheck` | 最终退出 0 |
| `pnpm exec vitest run plugins/ssh/test/sftp.test.ts` | 14/14，包括保留属主、变更冲突、不支持 SFTP 的实际探测 |
| `pnpm exec vitest run plugins/ssh/test/file-history.test.ts` | 2/2 |
| `pnpm exec vitest run plugins/ssh/test/transfer-publication.test.ts` | 6/6 |
| `pnpm exec vitest run plugins/ssh/test/shell-directory.test.ts` | 2/2 |
| `pnpm exec vitest run plugins/ssh/test/public-resources.engine.test.ts -t "binds byte transfers to owned SFTP sessions"` | CLI、HTTP MCP 各 1 项通过，54 项由筛选跳过 |
| Playwright `--list`，按以下用例筛选 | 枚举 4 个文件的 11 项 |

首次类型检查发现 `statOrNull` 的旧返回声明省略 UID/GID。改为实际返回的 `Stats` 后，最终类型检查通过。

### Lead 运行的 Playwright 场景

- `tests/e2e/ssh/host-records.spec.ts` — 「A01 SSH 目录右键保留选区，手动排序与部分删除可回读」。
- `tests/e2e/ssh/remaining.spec.ts` — 「H5.2 终端工具栏移动与设备偏好不重连，纵向按同目标分组」。
- `tests/e2e/ssh/file-properties.spec.ts` — 「H6.2 工作台展示实际属性并在原 SFTP 会话中修改、移动和创建链接」「A07 独立 Web 文件会话按路径前进和返回，保留桌面来源与原连接」。
- `tests/e2e/workflows/ssh-workspaces.spec.ts` — 「H6.4 工作台仅让原空闲 Bash 跟随，输入和切换分栏使导航授权失效」「H6.1 附属文件跟随活动分栏，独立双栏保持原连接和单独目录」「H6.3 远端编辑保持权限和文本格式，版本冲突保留两份内容」「H7.1/H7.2 传输中心保留任务和来源，拒绝或确认覆盖后核对实际文件」「H7.2 两个回环端点按前缀续传、暂停和继续，前缀失配保留原目标」「H7.1–2 批量目录逐项确认，拖放保留内容并阻止链接逃逸」「H7.3 原生 ZIP 列表、摘要及解压绑定实际设备，失败保留原件」。最后一项的本机 .NET ZIP 分支继续按 Windows 历史证据处理。

## 阻碍与接续

- S2/S3 本次范围为两处用例返修，修后实际结果待 Lead 复跑。其余差距沿 [report09.md](report09.md)。
- S4 本次使用已有会话双栏。独立原生窗口、完整目录树及文件上下文操作未齐。现有 SSH 连接模型尚无可共享给外部编辑器的完整目标表示，尤其是私有跳板、代理及本机凭据。外部编辑器需要先校验目标表达和设备启动入口，再做真实编辑器联调。
- SCP 回退与独立文件 sudo 仍缺真实后端。SFTP 子系统不可用时，回环测试已核对明确反馈。后续需将实际传输子集和高级用法的能力检测绑定到独立文件会话。升级前客户端持有的旧文本修订需从远端重读，保存仍走新版本核对。
- 未运行项 — Linux Electron、独立 Web 的实际 Playwright E2E，真实远端 SSH 和外部编辑器，构建、打包、全仓检查及截图。Windows/macOS 沿用历史证据。Linux Bash 用例已收录，Zsh 实际目录跟随仍需取证。

## Lead 验收
- Lead 2026-11-25：合入 main ca76ada3；SSH 29/30，H5.2 第 2 次修复仍失败暂停待顾问；ssh-workspaces 7/10，派 task11。
