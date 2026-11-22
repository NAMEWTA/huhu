# G1.1 任务报告

- 共享根 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation
- terminal_address — t1c
- task — task01.md
- 任务文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t1c/task01.md
- 报告文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t1c/report01.md
- 执行结果 — done
- 身份 — Windows 本机 Core `wta`（`346bd5608735e3fcb27f9d01f5c8008e`，0.1.21）。`HC_TERMINAL_ID=t1c`，当前指针为 `task01.md active`。

## 结论

- 盘点 209 个实际注册定义、9 个内置 manifest、桌面/外部传输和拟增的用户动作。基线有 56 项可配置外露，其中 27 项默认开放。manifest 遗漏 6 项，包括 Notes 的两个模板动作、Versioning 的四个冲突动作。每条记录带 owner、当前授权、建议 scope/risk、声明与 handler 定位。
- 隔离实测确认 `agent.core.status`、`agent.sessions.output`、`health.run`、`health.exportDiagnostics` 在当前路径会启动 Core。应由 Agent CLI 与 Engine 健康诊断所有者改接无启动查询并保留显式 execute。会话列表可更新运行投影，实测 Core 保持 absent。可信运行回执、ACK、心跳、派发标记与文件监视去重归内部。
- SFTP 列表与预览对既有连接上的远端文件是 read。实测不改变两侧文件且不重新认证，仍打开 SFTP 子通道并写审计。现在的 upload/download 用 Engine 主机路径，跨设备合同待 G7。
- G1.2 复用现有注册器，单源登记静态 Zod descriptor 与 active handler。G2 建立 Vault 级显式选择和 revision，用纯判定投影驱动发现及检查，Dispatcher 按认证主体再次复核。已记录损坏拒绝、重复 ID、重启、原子批量和内部委托等验收点。

## 产物与改动

- 工作目录 — D:/Document/code/huhu/temp/issue-worktrees/capability
- 分支 — `impl/huhu-issues-3-10-capability`
- 基线 — `bf3942e456c03cd7a4a4070e230557bb45e1ca9c`
- 本地提交 — `2dfd76240dbf8edc87310820b427452406d52635`，父提交为上述基线。提交后 Git 状态干净。
- [G1.1 能力矩阵](D:/Document/code/huhu/temp/issue-worktrees/capability/.agents/dev/changes/2026-11-19-issue-6-unified-tools-web/evidence/G1.1-action-inventory.md)
- [隔离样例](D:/Document/code/huhu/temp/issue-worktrees/capability/.agents/dev/changes/2026-11-19-issue-6-unified-tools-web/evidence/G1.1-isolated.test.ts) 与 [Vitest 配置](D:/Document/code/huhu/temp/issue-worktrees/capability/.agents/dev/changes/2026-11-19-issue-6-unified-tools-web/evidence/G1.1-vitest.config.mts)
- 提交范围为证据和样例。锁定版 pnpm 在当前 worktree 完成冻结安装，保留工作区依赖供接续。复用 Huhu 的 Engine、Dispatcher、Domain 服务和 SSH 夹具。仅参阅 Herdr Core 上游 `paths.rs`、`platform/windows.rs` 的隔离路径（`c7517808d64f06609e4ecf0db1757005373cc3a3`，Apache-2.0），本次采用的上游源码和新增依赖均为零。

## 验证

| 验收要求 | 实际检查与结果 | 证据位置 |
| --- | --- | --- |
| 核对来源、范围与可追踪矩阵 | 主目录五份 Change 文件哈希与 worktree 一致，GitHub #6 使用只读快照。TypeScript AST 和 manifest 交叉比对。209 个定义 ID 唯一，522 个相对链接检查均可解析。 | [能力矩阵](D:/Document/code/huhu/temp/issue-worktrees/capability/.agents/dev/changes/2026-11-19-issue-6-unified-tools-web/evidence/G1.1-action-inventory.md) |
| Notes、Agent、SSH 经正常认证入口 | 隔离样例 3 项通过，最终配置复跑仍为 3/3。Notes 比较 desktop、CLI 读取返回及磁盘字节、版本、mtime。Agent 对比 Core 管道状态和同一会话 ID。SSH 通过本地 ssh2 服务覆盖断开态、上传、列表/读、审计、下载及重名拒绝。 | [独立样例](D:/Document/code/huhu/temp/issue-worktrees/capability/.agents/dev/changes/2026-11-19-issue-6-unified-tools-web/evidence/G1.1-isolated.test.ts) |
| 既有行为交叉验证 | Engine/Agent CLI 定向组 16 通过、57 跳过。既有 Dispatcher、Notes 服务/批注、CLI、SFTP 组合 83 通过、1 失败。Windows 在符号链接夹具创建阶段返回 `EPERM`，该用例的后续符号链接断言未执行。 | [运行结果及复跑](D:/Document/code/huhu/temp/issue-worktrees/capability/.agents/dev/changes/2026-11-19-issue-6-unified-tools-web/evidence/G1.1-action-inventory.md#本轮验证) |
| 原型对照与共享前端边界 | Ego Browser 打开本地原型并查看 `notes.read` 详情。样例 15 项、0 项开放，详情显示用途及输出。zh-modern-web-guidance 检索并获取 responsive-table、dialog、html 与 accessibility。当前任务交付为盘点，HTML 用户确认留待原型负责人。 | [原型确认记录](D:/Document/code/huhu/temp/issue-worktrees/capability/.agents/dev/changes/2026-11-19-issue-6-unified-tools-web/prototype-review.md) |

## 阻碍与接续

G1.1 已交付。真实 SSH 远端、第二设备和 Electron 实机验收待对应切片提供入口和授权。真实 SSH 需 Lead 指定测试目标和合成账号。符号链接回归需有创建权限的测试环境。后续 G1.2/G2 由 Lead 核定可写范围后分派。已保存 scope、risk 与公共合同选择的证据；涉及可见行为的实现依原型确认推进。

## Lead 验收

核对实际提交 2dfd762、变更范围、隔离夹具和 Windows 符号链接限制。接收 G1.1 基线证据。t1c/task02 接续。
