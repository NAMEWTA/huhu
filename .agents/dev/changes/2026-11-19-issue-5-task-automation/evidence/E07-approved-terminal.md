# E07 外部手动使用已批准的终端规则

桌面工作台在受保护环境区提供批准入口。确认前显示 Windows PowerShell 原命令、实际工作目录和变量名。本机批准绑定 Vault 实例、规则版本和文件身份、Space 路径和修订、执行内容及变量名。批准存放在应用私有目录。工具设置中的开放选择单独生效。

首批支持 `HUHU_RULE_SECRET_` 命名空间的逐名保护值和手动运行。经认证的 CLI 或 MCP 可以分别申请下列能力。默认均关闭。

| 能力 | 输入和可观察结果 |
| --- | --- |
| `automations.terminal.external.status` | 用规则 ID 查询规则版本、环境修订和批准变量的遮蔽状态。 |
| `automations.terminal.external.save` | 核对规则与环境版本，按已批准的名字保留、替换或清除保护值。ModuleCredentials 在提交定义前再次核对当前批准。 |
| `automations.terminal.external.run` | 用规则 ID、预期版本及 UUID 意图请求手动运行。回应包含运行与发生 ID、状态和时间。运行以原 requestId 对账，同一意图的版本、调用身份和批准代次绑定在持久记录中。 |

工作台手动、定时和获批外部运行都用预留的环境修订核对 ModuleCredentials 同次 lease 所持的修订。取用前轮换会阻止旧运行使用新值。提交边界落盘后，恢复只查询原 requestId 和已经记录的会话。

## Windows 复验

Windows x64、固定 pnpm 12.10.1、Vitest 3.2.7、随包 Herdr Core 0.1.19。Core SHA-256 为 `8c5c088eda5c441502fa58714277a250e38103c66180376ef00d63d6cab03f8d`。

- 真实 CLI、MCP HTTP 与 stdio 使用同一 Engine 目录和各自认证入口。测试覆盖默认关闭、命令／Space／名字变更失效、未授权规则、护栏字段、旧版本写入、轮换与清除、Core 回包及外部响应缺失、同意图重交、跨身份输入不匹配、两级撤权、原 Vault 重开及还原 Vault 拒绝。两次显式新意图对应两次实际 Core 启动。检查了回包、运行正文、Core 请求、网关审计和 ZIP 恢复文件中的合成值。
- 真正的 Windows 凭据与存储事务测试在 Automations 外层核对完成、ModuleCredentials 捕获 lease 之前插入同一目标轮换。工作台手工和定时旧运行均停止，定时重交和对账未增加启动；显式新手工运行成功。
- 桌面 Electron 流验证可读命令和名字、Esc 取消及焦点返回、明确批准和撤销，以及原保护值保存、手动运行、遮蔽与清除。测试在临时 Vault 运行。

```powershell
# HUHU_AGENT_LAUNCH_TEST_BIN 和 HUHU_HERDR_BIN 指向本机随包 Windows Core。
pnpm --config.offline=true --config.verify-deps-before-run=false exec vitest run --no-cache --pool forks --maxWorkers 1 plugins/automations/test packages/kernel/test/credentials.test.ts apps/engine/test/module-credential-host.test.ts apps/cli/test
pnpm --config.offline=true --config.verify-deps-before-run=false --filter @huhu/desktop run build
pnpm --config.offline=true --config.verify-deps-before-run=false exec playwright test tests/e2e/workflows/acceptance.spec.ts --grep '终端规则在桌面配置' --workers 1
```

CLI 写入回归从测试请求文件读入合成值并调用真实 CLI 命令实现，进程 argv 不含值。面向用户的通用 `huhu call` 仍只有 `--input-json`。G5b.2 的外部草稿创建与编辑、定时用途许可、停用和删除的版本化队列验收、独立运行取消，以及 G3.3 的通用保护写入意图回执仍待后续切片。

[CLI/MCP 回归](../../../../../apps/cli/test/approved-terminal.test.ts) · [凭据 lease 回归](../../../../../apps/engine/test/module-credential-host.test.ts) · [桌面流程](../../../../../tests/e2e/workflows/acceptance.spec.ts)
