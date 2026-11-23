# t10s 同包清理静态收尾

- Lead `t3p`，worker `t10s`，接续 `t10s/task01.md` 的 Lead 消息
- 工作树 `/home/wta/projects/huhu/temp/issue-worktrees/agent-linux`
- 本轮只修改 `tests/e2e/helpers/candidate-desktop.ts`

## 生产生命周期依据

Electron 在 `before-quit` 等待 Engine supervisor 发送 `shutdown` 并收齐 Engine 退场，然后继续应用退出。Engine 的关闭顺序包含释放插件和删除自己的 Vault 端点描述。 [桌面退出入口](../../apps/desktop/src/main/index.ts#L601) · [Engine supervisor](../../apps/desktop/src/main/engine-supervisor.ts#L263) · [Engine 关停](../../apps/engine/src/boot.ts#L644)

规则所用的 Agent CLI Core 在插件退出时执行 `dispose()`，只断开客户端。因而这条路径通常仍需夹具收尾。SSH 本地 PTY Core 另有独立 socket 和 `confirmStopped` 注册，Engine 关闭经插件管理器调用它。夹具依据自己记录的 Agent Core 实例、PID 和 socket 判定实际结果。 [Agent CLI 释放](../../plugins/agent-cli/src/engine/index.ts#L109) · [Herdr dispose 与 stop](../../packages/herdr-client/src/herdr-core.ts#L230) · [SSH Core 注册](../../apps/engine/src/boot.ts#L483) · [插件关闭](../../packages/kernel/src/plugin-manager.ts#L148)

## 修改

- `withFixtureCleanup` 先收下主体结果或原始异常，依次尝试所有清理并记录安全诊断，最后在 `finally` 之外返回或抛错。主体失败时抛回首错，主体成功且有清理错误时由清理判失败。
- Electron 关闭后，已退出或失去主 socket 的 Core 交由独立退场检查收尾。只有已观测的 Core 与 holder PID 均退出，且夹具主 socket 和 holder socket 均消失，清理才通过。关停前的探测竞态只在此前已有可信记录且现场已清空时放行。
- 原 Core 仍存活且主 socket 可达时，通过同一条已核对身份的 RPC 连接发送 `server.stop`，要求 `stopped: true`，之后仍检查 PID 与 socket。持续残留或已发送停止却没有有效回执都会失败并留下诊断。候选 helper 的调用接口保持兼容。

## 未运行的验证

按 Lead 要求，本轮仅阅读生产实现和修改测试 helper。未运行 lint、类型检查、单测、E2E、构建、安装、打包、GUI 或进程探针。
