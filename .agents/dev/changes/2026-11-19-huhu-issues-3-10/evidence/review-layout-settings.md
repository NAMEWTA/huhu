# t194/task13 · 设置页导入副本身份隔离复审

## 结论

**task11 的设置页导入 P1 已关闭。** 从 Vault B 的设置页导入 Vault A 的包时，副本 C 在发布前获得自己的 Vault ID，因此可以连接自己的 Core。Lead 的同宿主真实 Core 回归验证了 C 首次保存后，A 的完整布局文档保持一致，原 Shell 仍为 live。 [task11 原发现](../../../../../temp/final-audit/t194-task11-final.md) · [实施报告](../../../../../temp/final-audit/t176-task25-final.md) · [最终绿灯](../../../../../temp/final-audit/settings-copy-check.log)

## 核对

- 设置页仍经桌面 `vault.importPackage` 入口。导入能力统一传 `regenerateId: true`，不再按包 ID 是否等于当前 B 的 ID 决定。已有权限、路径、外部摘要和暂存校验仍在原顺序。包库在暂存校验后为副本生成新 ID，再把目标发布到指定目录。 [设置页入口](../../../../../packages/workbench/src/settings/StoragePage.tsx#L119) · [导入能力](../../../../../packages/kernel/src/capabilities/package.ts#L147) · [暂存发布](../../../../../packages/vault/src/package/package.ts#L196)
- A/B/C 共用隔离的 `XDG_RUNTIME_DIR`，复现时不会因分别使用不同 socket 根目录而绕过原故障。夹具关闭 A 的 Engine 后确认真实 Shell 仍在，由独立 B 的 desktop Dispatcher 导入。红灯的 C 与 A 同 ID、同 socket，第一次读到源文档版本 1，失败发生在副本保存之前。 [共享 socket 目录](../../../../../apps/engine/test/agent-workspace.test.ts#L224) · [A/B/C 调用](../../../../../apps/engine/test/agent-workspace.test.ts#L304) · [原红灯](../../../../../temp/final-audit/settings-copy-red.log#L19)
- 绿色回归确认 C 的磁盘 ID 与导入回执一致，和 A、B 均不同。C 的 Core 地址与 A 不同，初读从副本的版本 0 开始，Core 状态为 idle 且没有目标运行目录。库根 Space 绑定到 C，外部 Space 保持待绑定。C 首次保存后返回版本 1 和提交的布局，A 的 Core 文档与保存前深相等，源 Shell 的原地址仍为 live。该用例经真实 Engine、数据包和 Core，使用设置页同一桌面能力入口。 [副本读取和保存断言](../../../../../apps/engine/test/agent-workspace.test.ts#L267)

## 验证范围

Lead t1c1 单文件 6/6，零跳过。实施报告记录两文件的定向类型、格式和 lint 通过。独审核对红绿输出与工作树哈希，`git diff --check` 通过。本轮只写报告，未重跑 Vitest、E2E 或构建，未启动代理。安装包设置页 UI 未运行。 [红灯](../../../../../temp/final-audit/settings-copy-red.log) · [绿灯](../../../../../temp/final-audit/settings-copy-check.log#L11)

| 核对文件 | 工作树 Git blob |
| --- | --- |
| `packages/kernel/src/capabilities/package.ts` | `6a786eef1dcf2bef30e8f0e87ce68ff3aec09b2c` |
| `apps/engine/test/agent-workspace.test.ts` | `c28252c58a2adf73bb829c37aefc14aebeeb2a43` |
