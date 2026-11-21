# #9 Windows 模块凭据宿主与系统键清理复核

- 终端 `t4z`，交付同目录 `report10.md`。冻结提交 `64788547141e806f5134fff7290b0d44bfa68b5c`，同时复核先前的 `2ceec67d9be1227da4815dc1df1afd8f1d8069c3` 键归属。使用独立 Git 归档或现有证据。四个 Git worktree 已满，不新增。仅 Windows 与合成 Vault/账号，业务检出与远端只读。不要更改真实密码、系统设置或默认凭据目录。
- 核对 `../t4z/report07.md` 的系统键碰撞、`LocalVersions` 保护指纹与回收保全。独立复验明确已有同名键、写入结果未知、首次副本保全、缺失文件、清理暂不可用。同一源 Vault 可继续使用，复制保留 Vault ID 时无法复用本机凭据。核对真实 Windows Engine 回归 `apps/engine/test/module-credential-host.test.ts`。
- 核对桌面真实 app userData 到 UtilityProcess 的路径约束、readOnly 零绑定、坏或 Vault 内本机目录、本机实例 ID 与实际 app 中的生命周期、错误降级，及 lockfile/ASAR 编译配置。Lead 已在 `t12h` 打包固定候选，请勿变更当前集成工作树、应用输出、依赖或打包进程。可读取已经生成的日志，生产包内探针由 Lead 跑。
- 报告分别给出直接原生/API、故障注入、包内接线和缺口。关闭本次验证 pane 后写结果。完成后结束。
