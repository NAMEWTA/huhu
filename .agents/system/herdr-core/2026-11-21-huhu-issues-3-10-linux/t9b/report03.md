# Linux provider 与 Mail 工作台修复定向独立复核

- Core 与任务 — `wta-ubuntu`，Lead `t3p`，执行者 `t9b`，清单指针 `t9b/task03.md`。 [任务](task03.md) · [清单](../manifest.tsv)
- 执行结果 — `done`。固定范围为 provider `6874c619146f363a798dd4ff95cfb66686de1c2d`、探针 `6a510e6fbfa5190c0b2e0bca9af0b1c589d9131f`、Mail `66667d9f799c2146aa7eba2aafbb2caed453fe9d`。同时核对 Lead 后续的 Mail 旧用例类型修正 `6dcffca2`。业务及测试文件保持原样。

## 规格轴

### Linux provider

**原第 1 项关闭。** 真实 Volta Codex、Volta Pi、直接 npm Pi 和原生 Claude 的 version 与 interactive 均通过。Codex 按平台包清单固定 vendor ELF 和声明资源，真实探针还核对相邻 sidecar、映像摘要与具名映像重入。Volta Pi 使用安装记录配对的 Node，直接 npm Pi 根据入口 shebang 和 cwd/PATH 解析 Node，两者通过实际 session 面板和退出操作。Claude 使用规范版本路径并通过真实交互界面。模型、会话文件和含空格的参数由 resolver 逐项传入，测试用合成安装及参数断言核对完整 argv。真实四项在离线白名单环境验证入口和本地交互。 [原发现](../t8y/report01.md#规格轴) · [实施](../t8k/report03.md) · [参数和安装布局断言](../../../../../plugins/agent-cli/test/linux-interactive-program.test.ts#L98) · [真实四项日志](/home/wta/projects/huhu/temp/issue-evidence/huhu-2026-11-22/real-provider-netns-check.log)

**原第 2 项的同宿主返回行为关闭。** Linux 监督进程在同一 host 和内层 PTY 回收 Agent 后代，恢复终端模式，再交给返回 shell。真实探针从返回 shell 的 fd 0 检查规范模式、原中文空格目录、终端尺寸、普通变量及保护变量未设置，原 host 以 shell 的 23 退出。五场景覆盖正常返回、两个阶段的 host 中断、原映像变更及已批准规则。已批准的 `sh -c` 只执行一次、直接退出 17，重投原宿主参数不会再执行。探针修正改测实际内层终端，保留此前外层 PTY 误测和 bwrap memfd 执行失败的记录。 [监督进程](../../../../../native/agent-pty/console_linux.go#L325) · [修正探针](../t8k/report04.md) · [真实 PTY 五项](/home/wta/projects/huhu/temp/issue-evidence/huhu-2026-11-22/return-shell-probe.log) · [规则断言](../../../../../native/agent-pty/tests/verify-linux.py#L208)

**P2 · 返回 shell 丢失会影响启动语义的调用名。** 输入为有效的 `SHELL=/bin/sh`，且该路径链接到 Bash。上游以选中的 `sh` 路径调用 `-i`，Bash 按 `sh` 的规则读取启动文件并进入 POSIX 模式。候选将规范映像路径写入 `returnShell.argv[0]`，原路径只用于链接核验。监督进程实际传入 Bash 映像名和 `-i`，因此选择 `sh` 的用户会进入 Bash 的常规交互启动路径。应保留已核对的映像及链接绑定，并保留所选 shell 的调用名。此为代码与本机 Bash 手册的结论，现有真实探针未覆盖该别名。 [返回参数构造](../../../../../plugins/agent-cli/src/engine/linux-interactive-program.ts#L266) · [协议参数校验](../../../../../native/agent-pty/protocol_linux.go#L79) · [实际 exec 参数](../../../../../native/agent-pty/console_linux.go#L381) · [上游 shell 调用](/home/wta/projects/huhu/temp/sources/herdr-app/src/window.rs:111) · [本机 Bash 手册](/usr/share/man/man1/bash.1.gz)

### Mail 工作台

**原调用方 P2 在代码与 Engine 用例层关闭，GUI 待验收。** 重开预检同一 ZIP 后，工作台可显式开启「按原批次续跑」，重选已恢复 A、待恢复 B 和原独立选项，并提交 `resumeOriginalBatch: true`。Engine 按原主体、ZIP 字节摘要、完整排序选择与独立选项重新核对，须有已恢复的原批次成员提供证据。空 Vault 部分成功后，原选择只补建 B，使用原 ID、保留 v1 已读标记，A 修订不变。改变 ZIP、主体或选项以及后来出现新的同地址账号时，仍按原冲突规则拒绝。已有 E 的双独立恢复按原参数补 B，E 与已恢复 A 的密码和修订保持原值。新增桌面用例用受控第二项写冲突验证恢复与错误选项，但还未运行。 [原调用方发现](report01.md#规格轴) · [工作台选项](../../../../../plugins/mail/src/ui/MailSubsetSettings.tsx#L185) · [Engine 批次核对](../../../../../plugins/mail/src/engine/subset-data.ts#L475) · [Engine 断言](../../../../../plugins/mail/test/outbox-engine.test.ts#L683) · [新增 E2E](../../../../../tests/e2e/workflows/mail.spec.ts#L24)

## 规范轴

固定差异内未见独立项目规范违规。Provider 复用现有 resolver、批准摘要与版本 1 私有帧。Windows 计划继续走既有字段，helper 明确拒绝 Linux 专属字段，交叉编译通过。Mail 续跑沿用既有能力、预检及逐账号日志。E2E 首跑的两个可选值类型错误对应父提交已有调用，`6dcffca2` 仅修正这些既有用例，产品与新增续跑用例相同。 项目规则（历史位置 `../../../../../temp/issue-worktrees/integration/AGENTS.md`，本次未取得原件） · [Windows 计划](../../../../../plugins/agent-cli/src/engine/interactive-environment.ts#L154) · [Windows 协议校验](../../../../../native/agent-pty/protocol_windows.go#L59) · [Lead 验收](../../../../dev/archive/changes/implemented/feature_2026-11-19-huhu-issues-3-10/program.md#L31)

## 验证

- 三组固定差异通过 `git diff --check`。独立运行 Node 24.21.0 下的 `pnpm --config.verifyDepsBeforeRun=false exec vitest run plugins/mail/test/outbox-engine.test.ts -t 'Mail (备份内|子集|同地址子集)' --maxWorkers=1`，9 项通过、11 项因过滤跳过。
- Lead 的 provider 证据含 Go 测试和 Linux helper 构建、定向 E2E 类型与 lint、Windows 交叉编译、真实安装 4/4、真实 PTY 5/5。Mail 模块定向类型检查通过。Mail E2E 定向类型随 `6dcffca2` 通过，完整 outbox 20/20。 [Provider 证据](../../../../dev/archive/changes/implemented/feature_2026-11-19-issue-4-agent-cli/verification/W7.3-linux-environment.md#L38) · [Mail 首跑日志](/home/wta/projects/huhu/temp/issue-evidence/huhu-2026-11-22/mail-resume-ui-check.log) · [Mail 复跑日志](/home/wta/projects/huhu/temp/issue-evidence/huhu-2026-11-22/mail-resume-ui-recheck.log) · [Mail 实施和验收](../t86/report06.md)

## 未运行的验证

本轮未独立重跑真实 provider、真实 PTY、Windows、桌面或 Web GUI、Playwright、构建、最终包及全仓门禁。真实 provider 测试范围为离线交互与退出，模型请求和真实历史未使用。返回 shell 的调用名兼容结论未专门实跑。

## Lead收取
Mail调用方代码关闭，GUI待最终验。shell调用名P2由Lead修复cce683a0，红绿与真实Bash别名及四provider回归通过，交task04复核。
