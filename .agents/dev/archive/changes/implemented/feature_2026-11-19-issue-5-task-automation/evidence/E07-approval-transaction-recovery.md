# E07 批准规则的事务与恢复回归

独立审查候选为 `69776e6887fb8ff75f4992f81445ebc8f15fa959`。本轮从 task03 的 `815d9917b2a32f246725343fd633040fe39b7acf` 接续。

| 事项 | 修复与可观察验证 |
| --- | --- |
| P1 启用鉴权 | `automations.setEnabled` 在配置事务中用已认证调用者核对刚读到的动作，并以该同一版本提交。正常提醒的受控写入交错在基线观察到一次入队前读取，修复后为零。独立 HTTP 回归覆盖外部禁止启用终端及 Agent、保留提醒启用与暂停。P1 单独提交为 `9198c3497285182f7a2efb26a9a2c4d0e8442f4d`。 |
| P2 工作目录 | Windows 的批准目录真实路径、文件系统身份与出生时间进入私有启动票据。Core 就绪后再次比对；helper 在启动子进程前核对继承的当前目录。模拟 Core 等待和实际本机 helper 两处都拒绝失配的合成目录。真实 CLI/MCP 用例还核对 PowerShell 子进程报告的目录与批准目录一致。 |
| P2 条件保存 | 变量名代次与凭据定义在同一次原子发布中生效。真实 Engine 的发布故障注入保留原批准 ID、名称与环境修订。成功改名使原批准失效，改回原名字后仍须重新批准。只轮换已批准的值沿用名称代次。 |
| P2 终端释放 | 一次写入退出结果与待释放标记。重开按 Vault 归属、原请求、原会话及 Core 进程绑定核对。真实 Windows Core 回归模拟释放暂不可用，以及实际移除后丢失确认；重新核对清除标记，原结果与输出保持一致，启动和移除各一次。模拟外来 Vault 和已结束 Engine 作用域均无释放调用。 |

Windows x64，固定 pnpm 12.10.1。真实启动、对账和保护值注入使用已保存的随包 Herdr Core 0.1.19 与独立临时 Vault。以下用例使用本机 `HUHU_AGENT_LAUNCH_TEST_BIN`，指向该 Core。可选 `HUHU_CLI_TEST_BUNDLE` 指向固定版本的 `apps/cli/dist/cli.mjs`。

```powershell
pnpm --config.offline=true --config.verify-deps-before-run=false exec vitest run --no-cache --pool forks --maxWorkers 1 apps/engine/test/engine.test.ts -t '公开启用提醒|不能创建或启用会启动'
pnpm --config.offline=true --config.verify-deps-before-run=false exec vitest run --no-cache --pool forks --maxWorkers 1 plugins/automations/test plugins/agent-cli/test/protected-launch.test.ts plugins/agent-cli/test/launch-reconcile.test.ts apps/engine/test/module-credential-host.test.ts apps/cli/test/approved-terminal.test.ts
```

清理需能核对原 Core 和原进程绑定。Core 不可用或身份变化时保留待核对的释放标记。历史记录中的释放失败若当时没有标记，无法据历史退出状态补推。Windows 强制停止和超时后的整棵子进程树仍缺少单独实机证据。

[启用事务回归](../../../../../../../apps/engine/test/engine.test.ts) · [目录身份回归](../../../../../../../plugins/agent-cli/test/protected-launch.test.ts) · [条件保存与 Core 释放回归](../../../../../../../apps/engine/test/module-credential-host.test.ts)
