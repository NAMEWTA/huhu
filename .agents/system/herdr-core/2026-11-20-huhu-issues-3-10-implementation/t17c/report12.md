# t17c · #4 W8.1 恢复数据包后的 Space 目录

- 共享根 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation`
- terminal_address — `t17c`
- task — `task12.md`
- 任务文件 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t17c/task12.md`
- 报告文件 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t17c/report12.md`
- 执行结果 — `done`

## 交付

本地分支 `impl/huhu-issues-3-10-agent-space-package` 提交 `331defdb626fbca6320e042872d570bbf432d588`，父提交 `0c96c27b844a580178a4d6f24f1d6bb987eba4e7`。工作树为 `D:/Document/code/huhu/temp/issue-worktrees/agent-lifecycle`。提交包含 SpaceStore、共享类型、独立待绑定组件、回归和 #4 证据。根锁 blob 为 `b3c2fc9cb809a8acab6d55b003785463165cf37f`。状态仅有切换分支前遗留的未跟踪 `native/`。

Space 业务记录保存 Vault 根、库内相对路径或外部绑定 ID。绝对外部路径和物理目录身份在本机 `.huhu/runtime/<machineId>/agent-cli/space-bindings/`。沿用 ZIP 与同步的 runtime 排除，Core 布局保留在原 Vault 的 runtime。恢复到空目标后，Vault 根和仍在目标里且可安全访问的相对目录直接绑定。外部、缺失和不安全的目录待重选。对本机旧绝对记录，只迁移能在当前库内核验的目录。缺少原 Vault 归属的旧外部路径、旧包恢复或他机记录保持待绑定。迟到的旧同步记录先安全投影，可写初始化时再落盘到新格式。

## Windows 验证

| 检查 | 结果 |
| --- | --- |
| 实际 Vault ZIP 往返 | 3 项通过。核对业务记录和目标相对目录、runtime 排除、同机重开与原布局标记、同机恢复仍需重选外部路径。外部和缺失目录经 `SessionsService.launch` 拒绝，Core 调用次数为零。也验证重选后的目录身份被替换、Windows 目录联接、大小写别名、穿越和旧格式恢复。 |
| 定向回归 | Space ZIP、Vault ZIP、会话和启动对账共 55 项通过、6 项跳过。已有 Space 用例另行定向执行，5 项通过。 |
| 扩大回归 | `agent.test.ts` 的 `findOnPath` 在 Windows 宿主上执行 Linux 可执行权限断言时失败。该测试和实现与指定基线一致。 |
| 静态检查 | agent-cli TypeScript、改动文件 oxfmt／oxlint、`git diff --check` 均通过。前端完成 Modern Web Guidance 的 search/retrieve。待绑定以可见文本及 `role="status"` 提示，重选使用原生按钮。 |

从仓库根直接复验。

```powershell
node node_modules/vitest/vitest.mjs run --project '@huhu/plugin-agent-cli' --project '@huhu/vault' --maxWorkers=1 --minWorkers=1 spaces-package.test.ts sessions.test.ts launch-reconcile.test.ts package.test.ts
node node_modules/vitest/vitest.mjs run --project '@huhu/plugin-agent-cli' --maxWorkers=1 --minWorkers=1 agent.test.ts -t '^Space'
```

## Lead 装配与验收

1. Engine 采用 `new SpaceStore(path.join(root, ".huhu", "agent-cli", "spaces"), machineId(), undefined, { vaultRoot: root, readOnly: api.vault.files.readOnly })`，保留 `ensureDefault(root)`。`root` 取 `api.vault.files.root`。list/save 的输出使用共享 `SpaceSchema`。
2. 在当前 Space 挂载 `SpaceDirectoryNotice`。将 `onBind` 接现有 Space 编辑表单，以当前 ID、revision、名称和空目录打开。用 `spaceCanLaunch(space)` 控制 `startTarget`、新建和分栏启动入口、启动菜单。Engine 的历史扫描和 Git diff 也应检查绑定，避免把待绑定 DTO 的空 `root` 当作实际工作目录。
3. 现有 `agent.workspace.get` 会调用 `core.ensure()`。Lead 的恢复页需采用非启动读取：先用 `core.peek()`，若新目标没有本地 Core 布局且没有连接，就返回版本 0 空布局。有本机布局的普通重开沿用原路径。新 `agent.workspace.launch` 先验目录绑定，再读布局。已提交过的请求保留原 requestId 对账。
4. 本次测试已覆盖存储恢复和 SessionsService 启动闸门。提示挂载、恢复页面零次 Core 启动以及实际 Core 布局重开由 Lead 在整合版本联验。

[W8.1 取证与装配点](D:/Document/code/huhu/temp/issue-worktrees/agent-lifecycle/.agents/dev/changes/2026-11-19-issue-4-agent-cli/evidence/W8.1-space-package.md)
