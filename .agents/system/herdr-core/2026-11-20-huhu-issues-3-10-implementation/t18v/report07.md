# task07.md · #7 文件传输任务及覆盖保护

- 共享根 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation
- terminal_address — t18v
- task — task07.md
- 任务文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t18v/task07.md
- 报告文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t18v/report07.md
- 执行结果 — done
- 工作树 — D:/Document/code/huhu/temp/issue-worktrees/task-cutover
- 分支 — impl/huhu-issues-3-10-ssh-transfers
- 基线 — 0d279330e2adf48106a50411ccf40b7296d93675
- 第一条真实路径提交 — 568fbbe5a053451a8bf1925bb783069313cec296
- 暂停、续传与双端复制提交 — 0fe4f1bbce31aae33c179542ec8c981a133f59bb

## 结论

先实现并独立验证 Windows 与 SSH 之间的上传、下载及覆盖确认。传输按稳定任务号追踪，入队固定端点和原连接，第一次核对后冻结内容摘要、大小、权限和时间戳。拒绝、跳过、目标变化及失配由原任务给出结果。确认后在同目录写暂存，校验通过才发布。传输中心可返回原文件会话并定位文件行，清理历史只移除终态记录。

第二提交加入暂停、继续、前缀校验续传、SSH 到 SSH 流中转和同任务重试。任务保留原连接身份。发布失败时核对原目标及备份并尝试恢复，只在目标名称空闲时装入，避免覆盖期间出现的其他文件。

## 复用与产物

- 原型 SHA-256 为 0a890ec3a9f26bbedc304f7b61e9cb41975d8b48df4ca2a96a33ee05fb473d2b。按 fileView、conflictDialog 和 startTransfer 核对确认反馈。
- 复用 H6 FileSessions、SshManager.withSftp、既有 SFTP 读写流／路径规范和 FilesPanel 的原生选取。本地 Motty main@2daa9db582e16edf60a60b7ada26f47f808f973c 的 internal/sftpclient/worker.go 与 write_protocol_test.go 用于核对队列、暂停、续传和发布恢复。
- 实现位于 plugins/ssh。钉住的真机验证入口为 tests/e2e/workflows/ssh-workspaces.spec.ts。
- 证据在 .agents/dev/changes/2026-11-19-issue-7-ssh-module/evidence 下的 H7-transfer-reuse.md 和 H7-transfer-windows.md。

## 验证

| 要求 | Windows 实测 | 证据 |
| --- | --- | --- |
| H7.1 有界队列、回到来源 | 32 个未终结任务可接纳，超过返回队列已满。取消释放容量，源断开后原任务留下可查终态。切页后仍可处理原任务，返回原文件会话及文件行。清历史后两端实物保持。任务并发上限 2。 | H7-transfer-windows.md |
| H7.2 覆盖与前置核对 | 拒绝保持原件。确认上传和下载后回读实际字节。等待确认时目标被外部改写，旧请求失败，改写后的目标保留。链接目标验证拒绝写入。 | H7-transfer-windows.md |
| 暂停、续传及发布安全 | 两个回环端点验证匹配前缀后继续，暂停期间原目标保持，完成后核对源、目标、0640 权限及时间戳。错误前缀和取消保留原目标。注入发布 rename 失败后恢复原目标，清除暂存，同任务重试成功。 | H7-transfer-windows.md |
| 工作分支回归 | Windows Electron Workbench E2E 7 项通过，含 H7 的 2 项和 H4／H6 的 5 项。带链接目标的 H7 定向复跑 2 项通过。SSH Vitest 58 项通过，含旧单文件 SFTP 11 项。插件 TypeScript、改动源码 lint、CSS 检查与 Git 差异检查通过。 | playwright test tests/e2e/workflows/ssh-workspaces.spec.ts --workers=1；vitest run --no-cache --pool forks --maxWorkers 1 plugins/ssh/test |

## 范围与接续

本次交付单文件路径。目录拖放、批量递归选择和目录合并仍待完成。传输任务和历史在当前 Engine 生命周期内保留。文件已有目标的发布采用同目录备份与无覆盖装入，目标名称在两次重命名之间可能短暂不可见。传输断线后无法访问原连接的暂存或备份会标明待检查名称。Windows 测试使用临时 Vault、已有缓存和本机回环夹具，测试用依赖 junction 已清理。工作树干净，t18v 保留。

## Lead 验收

由 Lead 追加。
