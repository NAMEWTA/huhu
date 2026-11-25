# 派发回执

- 共享根 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory
- terminal_address — t1tw
- task — task08.md
- 任务文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/t1tw/task08.md
- 回执文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/t1tw/report08.md
- 业务验收报告 — [024-s1.md](../../../../../.agents/dev/changes/2026-11-24-issue-inventory/evidences/024-s1.md)、[040-s2.md](../../../../../.agents/dev/changes/2026-11-24-issue-inventory/evidences/040-s2.md)
- 执行结果 — done，已交回 S1 与 S2 已完成部分，S2 剩余项见下

## 成果与运行指针

检出 `/home/wta/projects/huhu/.agents/dev/worktree/inv-w2`，分支 `inv/w2`。业务基线 `f412abd3`，快进到派发 `16e42930`。工作树干净，`git diff 16e42930..HEAD --check` 通过。本次后台验证终端已回收。

### S1 · 65450d2574052387825df616c7a53fc86b708109

- 已写 [s1-gap-map.md](../../../../../temp/dev/2026-11-24-issue-inventory/runs/t1tw/task08/s1-gap-map.md)，SHA-256 `f70b369a859b4ab610a35fd51093bb1993da6148d128b5042cd976e0a28b21c1`。覆盖全部 40 张领域票和四类差距，校验 240 个本地链接可解析。每票提供现代码、测试入口、历史复用和待实机观察，并列出 S2–S6 缺项及已有或拟新增验收用例名。
- 核对了 `45b9fae3` 暂停快照、`19f86bbd` 恢复 bundle、带冲突的恢复记录、主线已合入的逐片提交、Motty 固定来源及四张参考图，并追溯已确认原型指纹与验收范围。历史 Go 参考构建和当前工作树的打包输入分别记证据。当前本机缺 Viva 同级检出，Go 参考程序仍依赖自身配置库。现有 SSH 执行层为 ssh2，本机 PTY 使用 SSH 模块管理的 Herdr。S1 的 Git 提交仅记录外置产物指针及校验值，因此使用空提交。
- S1 做了文件、Git、链接、原型和历史证据核对。Linux Electron、独立 Web、真实主机与随包场景按对应的 S2–S7 运行记录签收。

### S2 · 9044843b6b2211fc86c57016e76f7cd638e62f87

- 改动文件 — `plugins/ssh/src/engine/directory.ts`、`plugins/ssh/src/shared/host-directory.ts`、`plugins/ssh/src/ui/{HostDirectory,RoutePanel,SshModule,WorkspaceLibrary}.tsx`、`plugins/ssh/src/ui/ssh.css`、`plugins/ssh/test/public-resources.engine.test.ts`、`tests/e2e/ssh/{host-records,remaining}.spec.ts`、`tests/e2e/ssh/workbench.ts`。
- A01 主机目录 — Desktop/Web 使用现有主机和分组投影，按名称、地址、用户与标签检索。列表/网格与分组切换保留按 hostId 的选区，明确展示筛选外选中数量。支持版本化新增、重命名、移动、删除分组和移动所选主机。主机动作进入已有配置、导入、连接和凭据流程。选区可作为临时工作区或模板草稿，桌面批量跳板关联使用既有 route 操作。
- A02 三跳 — CLI、HTTP MCP 的回环用例逐跳确认四个端点，在同一授权连接做 Shell 输出、SFTP 字节往返、监控取样和单条本地转发流量。确认代理只连接第一跳，每个 SSH 端点只有一个连接。回归使用四个隔离的本机 SSH 服务夹具，无真实外部主机或凭据。
- A02/A03 路由变更 — 基线用例可重现预期 `VERSION_CONFLICT`、实际 `NOT_FOUND`。已有 `e5b12ee1` 会因跳板版本变化主动终止旧等待。现用例先回读原 attempt 的 `failed / route-changed` 及原路由版本，再检查两个 socket 均关闭、旧信任答复无法应用、目标无密码认证。补测更新了断言，沿用生产的主动释放。
- SSH Web 测试明确选择本机分享范围后才建邀请。夹具覆盖 `196cfbc6` 之后的局域网默认配置，仍校验邀请实际使用 `127.0.0.1`。

#### 已运行的定向检查

统一使用 `flock /home/wta/projects/huhu/temp/dev/verify.lock volta run --node 24.22.1` 串行执行。日志和原始基线失败保存在 [task08 运行目录](../../../../../temp/dev/2026-11-24-issue-inventory/runs/t1tw/task08)。

| 命令后半段 | 结果 |
| --- | --- |
| `pnpm --filter @huhu/plugin-ssh run typecheck` | 退出 0 |
| `pnpm exec vitest run plugins/ssh/test/directory.test.ts` | 3/3 |
| `pnpm exec vitest run plugins/ssh/test/route-edits.test.ts` | 9/9 |
| `pnpm exec vitest run plugins/ssh/test/host-auth.engine.test.ts` | 4/4，包含 Safe 三态及凭据的受保护更新 |
| `pnpm exec vitest run plugins/ssh/test/public-resources.engine.test.ts -t 'a changed jump revision invalidates\|binds the effective outbound proxy\|retires every external connection'` | 5 项通过，51 项由筛选跳过 |
| Playwright `--list`，下列 spec 和筛选 | 枚举 13 项 |

上表筛选中的反斜线为 Markdown 表格转义。命令传给 Vitest 的正则使用未转义的竖线作为备选。

#### Lead 运行的 Playwright 场景

- `tests/e2e/ssh/host-records.spec.ts` — 「A01 SSH 主机目录在桌面和 Web 按账号标签筛选，网格保留选区并移动所选」「SSH 保存版本、保持编辑失败草稿、复制与显式修改认证补丁」「SSH 粘贴密钥、本机身份文件与 Agent 独立于保险箱状态」。
- `tests/e2e/ssh/remaining.spec.ts` — 「H3.2 路由页批量关联、覆盖与启停，旧 Shell 保留原连接路径」，现从目录选区进入批量关联。
- `tests/e2e/ssh/trust.spec.ts` — 「SSH 首次指纹可重新打开，拒绝与仅本次信任均不写记录」「SSH 指纹变化阻断准确跳点，经已知主机核对和移除后重新确认」「SSH 回环 Web 工作台可核对指纹，已知主机管理写入限桌面」。
- `tests/e2e/ssh/entry-parity.spec.ts` — 「CLI updates SSH authentication, approves trust, reads job output and transfers bytes」「HTTP MCP updates SSH authentication, approves trust, reads job output and transfers bytes」。
- `tests/e2e/ssh/settings.spec.ts` — 「SSH host grants are editable from desktop and invited browser workbenches」。
- `tests/e2e/ssh/import.spec.ts` — 「SSH 文件选择、八种格式映射、写入和重新打开目录」「SSH Web 入口可查看已保存主机和分组，导入入口仅出现在桌面」。
- `tests/e2e/ssh/shortcuts.spec.ts` — 「独立 Web 工作台可管理 Vault 快捷文本，桌面读取同一版本」。

## 阻碍与接续

- S2 余项 — A01 的目录右键、多选删除、置顶拖拽及未保存目标的快速连接仍待接线。A03 本机 ProxyCommand 仅有暂停快照中的隔离执行器，缺当前主机配置与设备批准接线。ViaShell 仍缺独立传输、取消和生命周期实现。H05/H07 的未覆盖身份格式和高级认证选项按差距表继续核对。
- 未运行项 — 候选应用 Linux Electron 和独立 Web 的实际 Playwright E2E、构建、打包、截图、远程主机或真实外部服务。Go/Linux 提取与集成、平台发布及未声明支持的证书算法仍待证。Windows/macOS 按当前项目决定沿用历史记录。
- 接续时将目录及路由证据合入同一候选。ProxyCommand 可从 `45b9fae3` 对照受限执行器和单测，先确定现有设备批准、吊销、首跳和关闭语义，再做工作台接线取证。ViaShell 与本机代理需分别核对实际运行位置并使用独立回环授权夹具。

## Lead 验收
- Lead 2026-11-25：合入 main c6bdb0b7；S1 通过；SSH E2E 20/27，返工与 S3 派 task09（已 /compact）。
