# t194/task11 · Launcher 恢复与私有 Core 收尾复审

## 结论

**task10 的启动页导入 P1 和冷导出停止状态 P3 已按原路径修复。** 启动页恢复会生成新的 Vault ID，Lead 已用同一宿主 socket 目录和仍在线的源 Core 复验。冷导出现在保留专有清理地址及停止未知结果，直接取消信号也不会覆盖这一错误。**W8.1 仍有一条同类隔离缺口**。从设置页导入另一 Vault 的数据包时，当前 Engine 仍可能保留包里的源 ID。 [task10 独审](../../../../../temp/final-audit/t194-task10-final.md) · [Lead 复验](../../../../../temp/final-audit/layout-boundary-recheck.log)

## 原发现复核

- **启动页路径关闭。** `importPackageTo` 明确传 `regenerateId: true`。包校验后在暂存区更新 `.huhu/vault.json`，随后才发布目标目录；Agent、Safe 和 Mail 的暂存验证仍先执行。业务红灯中源与副本 ID 和 socket 相同，目标读到了源版本。真实 Core 绿灯从源包成功调用 Launcher helper，停止源 Engine 并保留源 Core，再打开副本。副本 ID 与 socket 均不同，首次读布局为 v0，Core 为 idle，目标尚无 Core 运行目录。副本完成一次保存后，源文档仍为 v1，原真实 Shell 仍为 live。初次绿灯的 `terminal.get` 参数少传 `terminal`，最终复验修正该夹具并通过 6/6。 [Launcher 选项](../../../../../apps/desktop/src/main/vault-session.ts#L54) · [暂存发布](../../../../../packages/vault/src/package/package.ts#L196) · [真实 Core 断言](../../../../../apps/engine/test/agent-workspace.test.ts#L253) · [原红灯](../../../../../temp/final-audit/layout-boundary-red.log#L52) · [夹具失败](../../../../../temp/final-audit/layout-boundary-check.log#L16) · [最终绿灯](../../../../../temp/final-audit/layout-boundary-recheck.log#L5)
- **冷导出 P3 关闭。** 私有启动的 `finally` 先调用确认式停止。失败时 `stopExportCore` 返回不可重试的 `HERDR_UNAVAILABLE`，保留 `outcome: "unknown"`、本次 endpoint 和 runtimeDir；临时目录等到确认停止才删除。外层先重抛 unknown 再检查取消，取消与未取消两条故障注入均保留结果及独立目录。注入回归调用真实 `workspacePackageSnapshot`，模拟 Core 的 ensure/stop，未制造真实 Core 停止失败。普通取消且成功停止仍退回原 `AbortError`。对已经取消或超时的外部调用，通用 Dispatcher 可先返回通用未知状态；本次关闭结论针对私有导出收尾，与这一既有调用层边界相符。 [停止结算](../../../../../plugins/agent-cli/src/engine/workspace-package.ts#L75) · [清理顺序](../../../../../plugins/agent-cli/src/engine/workspace-package.ts#L109) · [错误优先](../../../../../plugins/agent-cli/src/engine/workspace-package.ts#L144) · [两分支的注入测试](../../../../../apps/engine/test/agent-workspace.test.ts#L182) · [Dispatcher 取消边界](../../../../../packages/kernel/src/dispatcher.ts#L374)

## 设置页仍可保留另一 Vault 的源 ID

**P1 · 已打开的 Vault 与数据包的源 Vault 不同，工作台恢复副本仍可能连到源 Core。** 备份 A，离开 A 后仍有 Core 在线。在同一宿主打开 B，从设置页导入 A 的包到新的空目录 C。桌面能力只把 B 的 ID 作为 `existingVaultIds`，`regenerateId` 只对外部工具置真。由于包 ID 属于 A，C 保留 A 的 ID。之后打开 C，在相同用户和 socket 目录中会使用 A 的默认 Core 地址。沿 task10 已验证的连接与 CAS 路径，A 在线时 C 读取的是 A 已接受文档，副本后续布局写入会指向 A。只读对照直接求值包库中的再生条件，启动页为 true、A 自身工作台为 true、另一 Vault 的工作台为 false。这里沿用的是 task10 已确认的同 ID 后果，未新增一轮真实三 Vault 运行。要关闭整个 W8.1，设置页导入也须生成隔离的副本身份或使用等效的 Core 所有权隔离，并用 A 在线、B 导入、C 打开及首次保存、A 原文档和 Shell 保留的回归锁定。 [设置页调用](../../../../../packages/workbench/src/settings/StoragePage.tsx#L119) · [Engine 导入条件](../../../../../packages/kernel/src/capabilities/package.ts#L167) · [包 ID 再生](../../../../../packages/vault/src/package/package.ts#L196) · [Core 地址](../../../../../packages/herdr-client/src/herdr-core.ts#L34) · [Core 连接与布局来源](../../../../../plugins/agent-cli/src/engine/workspace-layout.ts#L57)

## 本轮证据范围

- W8.1 新安装包驱动去掉夹具直接打开 Vault 的环境变量，只替换原生对话框的两个返回路径，点击真实启动页导入按钮。它保留源应用，断言两个 Vault ID 有别、目标未绑定且零终端、源布局不变。夹具每个桌面仍用各自的 runtime，因此同 socket 目录和目标首次 CAS 的证据取自上面的 Engine 实验。安装包 W8.1 未执行。 [启动页夹具](../../../../../tests/e2e/helpers/candidate-desktop.ts#L281) · [W8.1 安装包用例](../../../../../tests/e2e/workflows/task-journey.spec.ts#L757)
- Lead 报告五文件格式和 lint 通过。复审时定向类型日志为零字节、无诊断，日志本身未提供退出状态。独审执行了只读 ID 条件对照及已跟踪四文件的 `git diff --check`。未运行 Vitest、安装包 E2E、Electron、构建或重型验证，未启动代理。只写本报告。并行历史实现未审。 [定向类型日志](../../../../../temp/final-audit/layout-boundary-types.log)

| 核对文件 | 工作树 Git blob |
| --- | --- |
| `apps/desktop/src/main/vault-session.ts` | `bd9911b89687726595564eee76a9b15f6c121646` |
| `plugins/agent-cli/src/engine/workspace-package.ts` | `e74ce8825450914f1ae9123ebddd49d05d0bdd3d` |
| `apps/engine/test/agent-workspace.test.ts` | `86eed84be3d808d9452dfee663e579e3637c2196` |
| `tests/e2e/helpers/candidate-desktop.ts` | `30d7a44fd672287215a46664db54efbef6df5153` |
| `tests/e2e/workflows/task-journey.spec.ts` | `6c189b1f5c466b7aed8069f0da4478621873c2d4` |
