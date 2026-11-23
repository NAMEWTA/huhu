# E07 使用 CLI 提交受保护规则的输入

桌面管理员批准具体本机规则、执行目标和变量名后，在工具设置开放所需能力。通过 `huhu call --input-file` 提交 UTF-8 JSON，兼容 UTF-8 BOM。将保护值放在仅当前账号可读的本机请求文件中。命令行只传文件路径，环境变量里无需设置保护值。操作结束后清理请求文件。

```powershell
huhu call automations.terminal.external.status --input-file 'D:\private\rule-status.json' --vault 'D:\vault' --json
huhu call automations.terminal.external.save --input-file 'D:\private\rule-save.json' --vault 'D:\vault' --json
huhu call automations.terminal.external.run --input-file 'D:\private\rule-run.json' --vault 'D:\vault' --json
```

- 状态文件提供 `ruleId`。回应包含规则版本、环境修订和批准变量的遮蔽状态。
- 写入和清除文件另提供 `expectedRuleVersion`、`expectedRevision` 及 `changes`。替换仅在对应更改项的 `value` 提供保护值。清除项提供批准的名字和 `action: "clear"`。
- 手动运行文件包含 `ruleId`、两个预期版本和 `intentId`。选一个新 UUID 开始一轮。回应缺失或显示待核对时，用同一身份和同一运行文件重交以读取原 runId。输入或身份不匹配、权限撤销时按现有合同拒绝。

文件与 `--input-json` 互斥。CLI 读取普通文件并沿用 8 MiB 网关上限，网关继续检查完整请求。读取、编码和 JSON 格式错误在联系 Engine 前以退出码 2 返回到 stderr，而且仅显示错误类别。授权及业务错误沿用退出码 1，`--json` 保留原业务回应结构。

## Windows 复验

固定 pnpm 12.10.1、Node 24.21.0、Vitest 3.2.7、随包 Herdr Core 0.1.19。构建生成 `apps/cli/dist/cli.mjs`，E07 回归启动真实 CLI 子进程，经网关连接临时 Vault。回归核对合成值仅从文件读取，进程参数、环境与 stdout/stderr 均无合成值。现有 MCP HTTP 和 stdio 用例继续经过已认证入口。

```powershell
pnpm --config.offline=true --config.verify-deps-before-run=false --filter @huhu/cli run build
$env:HUHU_CLI_TEST_BUNDLE = (Resolve-Path 'apps/cli/dist/cli.mjs').Path
# HUHU_AGENT_LAUNCH_TEST_BIN 指向本机随包 Windows Core。
pnpm --config.offline=true --config.verify-deps-before-run=false exec vitest run --no-cache --pool forks --maxWorkers 1 apps/cli/test
```

本切片完成普通文件输入及 E07 实际 CLI 入口取证。G3.1 的 stdin 和 G3.3 的通用幂等键／回执合同仍由后续切片承接。

[CLI 文件错误回归](../../../../../../../apps/cli/test/cli.test.ts) · [真实 CLI/MCP 和原意图回归](../../../../../../../apps/cli/test/approved-terminal.test.ts) · [E07 批准合同](E07-approved-terminal.md)
