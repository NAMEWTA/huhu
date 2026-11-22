# G1.2 任务报告

- 共享根 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation
- terminal_address — t1c
- task — task02.md
- 任务文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t1c/task02.md
- 报告文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t1c/report02.md
- 执行结果 — done
- 身份 — 本机 Windows Core `wta`，ID `346bd5608735e3fcb27f9d01f5c8008e`，版本 0.1.21。核对 `HC_TERMINAL_ID=t1c` 与 `task02.md active`。

## 结论

- `notes.read` 与 21 项 SSH 能力使用同源静态描述和活动 handler。Engine 在打开 Vault 前登记描述，Kernel 校验 ID 唯一和 owner 绑定。插件停用后释放 handler，桌面可通过现有 `capabilities.list({includeInactive:true})` 读取原有 title、description、owner、scope、risk 和输入输出 schema。
- `gateway.check` 区分停用、失败、handler 缺失和未知能力。隔离 Engine 验证已停用的 SSH 业务调用返回 `PLUGIN_DISABLED`，未知能力返回 `CAPABILITY_NOT_FOUND`。当前发现列表只投影活动项，stdio 可以识别旧工具名。未迁移的停用项带清单身份，scope/schema 为空。
- SSH 的 21 个现有 ID、调用权限、scope、超时、schema 与 handler 表达式按基线核对。目录可用性描述插件及 handler 状态。SSH 连接等业务前置条件在原领域中判定。G2 承接选择的持久化、开放策略与共同授权判定。

## 产物与改动

- 工作目录 — D:/Document/code/huhu/temp/issue-worktrees/capability
- 分支 — `impl/huhu-issues-3-10-capability`
- G1.1 基线 — `2dfd76240dbf8edc87310820b427452406d52635`
- 本地提交 — `6e6240d5573dcf0c825680a7d0dfcb6ccf971a4e`，父提交为 G1.1 基线，工作树干净。
- [共享目录 DTO](D:/Document/code/huhu/temp/issue-worktrees/capability/packages/contracts/src/capability.ts) · [静态登记及绑定](D:/Document/code/huhu/temp/issue-worktrees/capability/packages/kernel/src/capabilities/define.ts) · [网关查询及目录](D:/Document/code/huhu/temp/issue-worktrees/capability/packages/kernel/src/capabilities/system.ts)
- [Engine 装配](D:/Document/code/huhu/temp/issue-worktrees/capability/apps/engine/src/boot.ts) · [Notes 定义](D:/Document/code/huhu/temp/issue-worktrees/capability/plugins/notes/src/engine/index.ts) · [SSH 静态定义](D:/Document/code/huhu/temp/issue-worktrees/capability/plugins/ssh/src/engine/capabilities.ts) · [SSH 活动绑定](D:/Document/code/huhu/temp/issue-worktrees/capability/plugins/ssh/src/engine/index.ts)
- [Registry 测试](D:/Document/code/huhu/temp/issue-worktrees/capability/packages/kernel/test/capability-catalog.test.ts) · [Engine HTTP 测试](D:/Document/code/huhu/temp/issue-worktrees/capability/apps/engine/test/capability-catalog.test.ts)
- 复用现有 Registry、Dispatcher、Zod 及 PluginManager 状态。参阅本地 Open Knowledge `b2af296a73049ddd47f6d679b36774ecbdd3d19b` 的 `packages/app/src/editor/asset-dispatch/registry.ts`，本次采用的上游源码与新增依赖为零。

## 验证

| 验收要求 | 实际检查与结果 | 证据位置 |
| --- | --- | --- |
| 静态目录与真实 Notes 读取 | 隔离 Vault 注入合成笔记。正常 desktop/CLI bearer 通过真实 Engine 的 HTTP 入口返回同一正文和版本，磁盘内容一致。管理目录显示 `notes.read` 的 owner、read/normal 与对应 schemas。 | [Engine HTTP 测试](D:/Document/code/huhu/temp/issue-worktrees/capability/apps/engine/test/capability-catalog.test.ts) |
| SSH 停用、重新打开 Vault、再启用 | 比较 21 项的完整描述。停用后管理目录保留描述，活动目录和 HTTP 发现移除对应行，实际调用获 `PLUGIN_DISABLED`。关闭 Engine 并为同一 Vault 启动新实例，仍可读相同描述与停用状态。再启用后恢复活动列表且 `ssh.hosts.list` 返回空夹具列表。正常 CLI 调用受现有开放策略约束。 | [Engine HTTP 测试](D:/Document/code/huhu/temp/issue-worktrees/capability/apps/engine/test/capability-catalog.test.ts) |
| 重复、绑定、未安装 | Registry 验证批内重复、跨归属和 schema 不一致绑定被拒，释放后重新绑定成功。普通 HTTP 验证 `gateway.check` 的 disabled/not-found 及实际调用的两类错误。AST 检查 21 个 SSH ID 与 manifest 完全一致，scope、input/output、timeout 和 handler 表达式与基线一致。 | [Registry 测试](D:/Document/code/huhu/temp/issue-worktrees/capability/packages/kernel/test/capability-catalog.test.ts) · [Engine HTTP 测试](D:/Document/code/huhu/temp/issue-worktrees/capability/apps/engine/test/capability-catalog.test.ts) |
| 定向回归和类型 | pnpm 12.10.1。目录、Dispatcher、HTTP server、CLI 共 45 通过。Engine 定向 12 通过、33 按名称条件跳过。G1.1 隔离组 3 通过，包含 SFTP 回环样例。最终调整登记顺序后，目录两文件 3 项再次通过。按根脚本先构建 vendor 类型声明，Contracts、Kernel、Notes、SSH、Engine 类型检查通过，最后复核 Engine 类型。9 个提交文件通过 oxfmt、oxlint、`git diff --cached --check`。 | [目录用例](D:/Document/code/huhu/temp/issue-worktrees/capability/apps/engine/test/capability-catalog.test.ts) · [G1.1 隔离样例](D:/Document/code/huhu/temp/issue-worktrees/capability/.agents/dev/changes/2026-11-19-issue-6-unified-tools-web/evidence/G1.1-isolated.test.ts) |
| 原型对照 | Ego Browser 打开本地原型，在工具目录筛选 `mail.messages.list`。邮件样例显示「插件已停用」，详情仍显示名称、ID、输入和输出说明。HTML 交互版本的用户确认仍待产品走查。 | [原型确认记录](D:/Document/code/huhu/temp/issue-worktrees/capability/.agents/dev/changes/2026-11-19-issue-6-unified-tools-web/prototype-review.md) |

## 阻碍与接续

G1.2 后端切片已交付。Renderer 展示、G2 策略和父计划的其他插件迁移依后续授权推进。验证环境使用临时 Vault、合成数据和回环 SSH 夹具。真实 SSH 主机和 Electron 实机 UI 留给对应的授权验收。

## Lead 验收

核对固定候选、Engine 装配、静态注册和 HTTP/CLI 直接调用方。排入独立审查，G2.1 在同一分支的新任务并行检验策略；G1.2 仍按固定 SHA 审查。
