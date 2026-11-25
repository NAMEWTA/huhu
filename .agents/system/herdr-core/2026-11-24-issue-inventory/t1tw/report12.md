# 派发回执

- 共享根 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory
- terminal_address — t1tw
- task — task12.md
- 任务文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/t1tw/task12.md
- 回执文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/t1tw/report12.md
- 业务验收报告 — /home/wta/projects/huhu/.agents/dev/changes/2026-11-24-issue-inventory/evidences/042-s4.md、090-s5.md，S7 准备对应 105-s7.md
- 执行结果 — done

## 成果与运行指针

- 工作目录 `/home/wta/projects/huhu/.agents/dev/worktree/inv-w2`，分支 `inv/w2`。从合并点 `f8f9751a` 快进到派发基线 `8fb8e784`，本轮最终提交 `bb893cbb0b3b0398fd80f3232104bc5765c565e9`。运行原件位于 [/home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/runs/t1tw/task12](/home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/runs/t1tw/task12)。
- 重验证使用 `flock /home/wta/projects/huhu/temp/dev/verify.lock` 串行执行，Node 24.22.1，开跑前复核可用内存、cgroup、磁盘和 inode。

### 042-s4 · H7.1–2 第 2 次修复

- 提交 `874ac855c5c97c701268e9754dee1828a1e8f26b`。
- Lead 的 S5 trace 在拖放后约 3 ms 通过「已加入传输中心」断言，错误快照里只有先前从本机到批量甲的上传批次，没有批量甲到本机的下载批次。由此排除等待到了下载批次但文件还未公布，以及单纯切换 `partial` 定位器即可修复。Trace 缺 Electron 拖放事件和网络记录，具体漏发 dragstart、dragover 或 drop 未直接取证。
- 表格将原先覆盖复选框、文件按钮和操作按钮的整行拖放改成独立把手，保留原有多选及键盘可用的传输按钮，目标栏对识别出的拖放声明复制。E2E 用实际指针路径将把手拖至另一栏标题，等待本次从远端到本机的真实提交回应，核对原 fileSessionId 和所选本机路径，再用返回的 batchId 查看批次。旧上传提示不能通过这一断言。
- 链接在扫描时生成明确的失败记录并附「未遍历链接」，同批普通文件正常发布。Lead 的旧上传快照与新的实际回环 SFTP 下载测试均支持该状态，E2E 现在核对记录和本机文件结果。
- 改动文件为 `plugins/ssh/src/ui/{FileBatch,FileTable}.tsx`、`plugins/ssh/src/ui/files.css`、`plugins/ssh/test/transfer-publication.test.ts`、`tests/e2e/workflows/ssh-workspaces.spec.ts`。
- `volta run --node 24.22.1 pnpm --filter @huhu/plugin-ssh run typecheck` 通过。`volta run --node 24.22.1 pnpm exec vitest run plugins/ssh/test/transfer-publication.test.ts` 7/7 通过。
- Lead 待运行 `tests/e2e/workflows/ssh-workspaces.spec.ts` 的「H7.1–2 批量目录逐项确认，拖放保留内容并阻止链接逃逸」。`playwright test --list` 已识别该用例。H7.2 与 H7.3 在 Lead 的先前运行通过。

### 090-s5 · A11 第 1 次修复

- 提交 `bb893cbb0b3b0398fd80f3232104bc5765c565e9`。
- Trace 的最后一个未完成动作是独立 Chromium 点击「监控」。快照已经显示 SSH 主机列表，代码中入口此前只渲染给桌面。引擎复查还发现 `ssh.monitor.panels.list`、`ssh.monitor.panels.run` 的描述符带 `desktopOnly`。新增定向断言在旧描述符上失败。
- 在已邀请的 Web 工作台显示原生「监控」按钮，开放上述两项读取。沿用原面板、原连接采样和自动化计划，Web 展示实际指标与历史。新建、编辑、删除、信任和运行控制由桌面发起，适用的后端权限继续限制这些操作。引擎用例核对浏览器工作台可读同一活动面板，同时拒绝停止或删除。HTTP MCP、CLI 仍按其原资源授权读取。
- 改动文件为 `plugins/ssh/src/engine/capabilities.ts`、`plugins/ssh/src/ui/{SshModule,MonitorDashboard}.tsx`、`plugins/ssh/test/monitor.engine.test.ts`、`tests/e2e/ssh/monitoring.spec.ts`。
- `volta run --node 24.22.1 pnpm --filter @huhu/plugin-ssh run typecheck` 通过。`volta run --node 24.22.1 pnpm exec vitest run plugins/ssh/test/monitor.engine.test.ts` 4/4 通过。`volta run --node 24.22.1 pnpm exec vitest run plugins/ssh/test/public-resources.engine.test.ts -t 'isolates monitor subscriptions and keeps active query output out of receipts'` 2/2 通过。
- Lead 待运行 `tests/e2e/ssh/monitoring.spec.ts` 的「A11 独立 Web 查看两个主机的桌面采样，采样控制由桌面管理」。`playwright test --list` 已识别该用例。A10 及桌面监控在 Lead 的先前运行通过。

### 105-s7 · 对照验收和清理准备

- [S7 剩余缺口清单](/home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/runs/t1tw/task12/s7-gap-list.md)。按 S1 差距表复核 S1–S7 与 A01–A21，补入已验的 S3 工具栏修复、S4/S5 当前边界和 S6 新证据。列出 J19/SIGN 同候选需要的连接、组件、授权、资料和平台证据。
- 本轮仅准备清单。Lead 仍需落实 H12.1 的组件/连接回收组合、H12.2 的 Linux 安装包启动及缺件、真实主机、原型/NOTICE/文档对应验收。

## 阻碍与接续

- 本轮未运行 Electron 或独立 Web E2E、构建、打包、全仓检查或视觉取证。两条失败 E2E 的修复需 Lead 重跑。H5.2 由另一 worker 处理，本轮未触碰。
- S4 的独立原生文件窗口、外部编辑器、SCP、sudo、Linux 桌面 ZIP 及真实 Zsh 仍有缺口。S5 的 Web 分栏采样、原生独立工具窗口、ViaShell、Docker 真机及更多指标待后续票据。具体证据边界与未验证平台见 S7 清单。

## Lead 验收
