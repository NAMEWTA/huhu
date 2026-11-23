# 任务报告 · #7 H11.2 SSH Exec 作业

- 共享根 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux`
- terminal_address — `t5`
- task — `task01.md`
- 任务文件 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t5/task01.md`
- 报告文件 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t5/report01.md`
- 执行结果 — blocked（原工作树 Git 索引与项目记录目录只读。实现、验收和可导入提交已交付。）

## 结论

H11.2 的 Exec 作业链在隔离 SSH 夹具上通过 CLI 与 HTTP MCP 验收。五项能力默认关闭，沿用现有逐项授权和 SSH 信任流程。作业保留原主机与路由身份，以独立认证会话提交一次 Exec，能够按原作业读取 UTF-8 输出和请求停止。SSH 接收超时、未报告退出及只留下受理记录的中断均可查为待核实，重交不会重复执行。

生产 Engine 仍需注入作业回执的本机目录和 Vault 实例身份。HTTP MCP 验证使用每客户端独立的 Gateway 令牌。当前 stdio 及默认 MCP 令牌共用一个主体，作业入口返回 `PERMISSION_DENIED`。公共 Shell、SFTP 和传输的跨入口行为未交付。

## 产物与改动

工作树 `/home/wta/projects/huhu/temp/issue-worktrees/ssh-exec`，分支 `impl/huhu-issues-3-10-ssh-exec-jobs`。原工作树 HEAD 仍为 `c23a8258e3ba0d68022cea45f6b52332b9ff0ec2`，8 个 SSH 跟踪文件的改动仍在工作树，证据副本未跟踪。对 `/home/wta/projects/huhu/.git/worktrees/ssh-exec/index.lock` 的 Git 写入返回 `Read-only file system`。

在 `/tmp/huhu-h112-t5.pBG0Uz/delivery` 的同名隔离分支上生成以下非 WIP 提交。代码 diff 已与原工作树逐字节比对。Git bundle 已用 `git bundle verify` 验证，前置提交为 `c23a8258e3ba0d68022cea45f6b52332b9ff0ec2`，包头为 `0748a5164728ab6d204d55e71be59a6a17a2eaa3`。 [Git bundle](/tmp/huhu-h112-t5.pBG0Uz/h112-ssh-exec.bundle)

| 提交 | 文件 |
| --- | --- |
| `6269093e49c415019a28beb9451268c003218415` | `plugins/ssh/huhu-plugin.json`、`plugins/ssh/src/engine/capabilities.ts`、`plugins/ssh/src/engine/index.ts`、`plugins/ssh/src/engine/manager.ts`、`plugins/ssh/src/engine/public-jobs.ts`、`plugins/ssh/src/engine/public-probes.ts`、`plugins/ssh/test/fake-server.ts`、`plugins/ssh/test/public-resources.engine.test.ts` |
| `0748a5164728ab6d204d55e71be59a6a17a2eaa3` | `.agents/dev/changes/2026-11-19-issue-7-ssh-module/evidence/H11.2-exec-jobs-linux.md`、`.agents/dev/changes/2026-11-19-issue-7-ssh-module/tasks/H11.2-session-jobs.md` |

原工作树的 `.agents` 只读。证据正式路径和任务状态记录已提交进 bundle，可立即阅读原工作树 SSH 包中的同名证据副本。接续 WIP 中已包含 `exec-interrupt.ts`、`job-output.ts`、`public-resources.ts` 的实现，本轮复用了这些文件。 [Linux 验收证据](/home/wta/projects/huhu/temp/issue-worktrees/ssh-exec/plugins/ssh/evidence/H11.2-exec-jobs-linux.md)

## 验证

Node 24.21.0，pnpm 12.10.1。Engine 临时装配在 SSH 测试文件中完成，使用回环假 SSH、合成命令和合成密码。Linux 夹具注入进程内合成密钥保护器。Motty 和 Viva 在本机 `temp/sources` 均缺失，未克隆。所有 Git 操作均在本机。

| 验收要求 | 实际检查与结果 | 证据位置 |
| --- | --- | --- |
| CLI 实际入口 | 经 CLI `run`、真实 Engine HTTP 和 SSH 通道验收默认关闭、同意图并发准备、首次信任、重复启动、完整 UTF-8 分页及重开状态。相同意图只产生一次 Exec。 | `public-resources.engine.test.ts` 的 CLI 作业用例 |
| MCP 实际入口 | 经真实 `/mcp` 的 `tools/list`、`tools/call` 验收独立令牌、错主体拒绝、撤权、并发作业、观察结束后继续运行、按原 job 取消与回收。两条命令各执行一次。 | 同文件的 HTTP MCP 用例 |
| 字节及上限 | 字符拆包后正确解码。stdout 75,011 字节中跳过 9,476 字节，完整读取保留的 65,535 字节。stdout 和 stderr 游标独立。 | 同文件的 CLI 作业用例 |
| 失败和恢复 | 检查跨 Vault 复制回执、过期路由、会话错配、认证失败、SSH 拒绝、远端状态码/退出信号、缺少退出状态、SSH 接收超时、停止未确认及仅剩受理记录后的查询。 | 同文件的其余作业用例 |
| `pnpm --filter './vendor/*' run build:types` | 通过。生成 vendor 声明。 | 本机命令退出码 0 |
| `pnpm --filter @huhu/plugin-ssh typecheck` | 最终通过。首轮因缺 vendor 声明失败；生成后把测试同步点改为 ES2023 兼容实现并复跑。 | [日志](/tmp/huhu-h112-t5.pBG0Uz/typecheck.log) |
| `pnpm exec vitest run plugins/ssh/test/public-resources.engine.test.ts plugins/ssh/test/manager.test.ts` | 2 文件，27 通过、0 失败、0 跳过。最终代码上运行。 | [日志](/tmp/huhu-h112-t5.pBG0Uz/ssh-public-manager.log) |
| `pnpm exec vitest run plugins/ssh/test` | 13 文件，71 通过、8 失败、4 跳过。8 个失败发生在未注入 Linux 保护器的旧用例的密码配置步骤。分布为监控 3、文件属性 1、转发 3、偏好 1。4 个 `host-auth.engine` 用例限定 Windows x64。全量在测试同步点调整前运行，受调整的文件已作最终定向复跑。 | [日志](/tmp/huhu-h112-t5.pBG0Uz/ssh-vitest.log) |
| `pnpm lint` | 通过。 | [日志](/tmp/huhu-h112-t5.pBG0Uz/lint-final.log) |
| `pnpm format:check` | 通过，995 个文件。 | [日志](/tmp/huhu-h112-t5.pBG0Uz/format.log) |

## 阻碍与接续

1. 从有目标工作树 Git 写权限的环境导入 bundle。可运行 `git fetch /tmp/huhu-h112-t5.pBG0Uz/h112-ssh-exec.bundle refs/heads/impl/huhu-issues-3-10-ssh-exec-jobs`，并核对 `FETCH_HEAD` 为 `0748a5164728ab6d204d55e71be59a6a17a2eaa3`。原工作树的未提交 SSH 内容已包含在代码提交中。bundle 内同时包含正式证据路径和 H11.2 状态更新。
2. 在 `apps/engine/src/boot.ts` 的 SSH `plugins.register`（基线约第 419 行），以本段替换 `apply`。沿用同函数既有的 `runtime = vault.runtimeDir`、`rootIdentity = directoryInstance(vault.root)` 和写权限判断。已存在的 `registry.declareDescriptors("ssh", Object.values(ssh.sshCapabilityDescriptors))` 会纳入新增五项，保留默认关闭设置。

   ```ts
   apply: (ctx, api) =>
     void ssh.apply(
       ctx,
       api,
       moduleCredentialHost ? { ...moduleCredentialHost, vault } : undefined,
       !vault.files.readOnly && rootIdentity
         ? { runtimeDir: runtime, vaultInstance: JSON.stringify([vault.id, ...rootIdentity]) }
         : undefined,
     ),
   ```

3. 若接续 stdio，须由 `apps/cli/src/main.ts` 中 `huhu mcp` 建立自有、可持续认证的进程身份，`apps/cli/src/connect.ts` 传该客户端凭据，并由 Engine 或 Gateway 注册验证后向 Dispatcher 提供独立 `subject`。HTTP MCP 当前无会话 ID，由 `packages/kernel/src/server/http-app.ts` 传 Gateway 令牌主体。一客户端一令牌的实测已通过；同一令牌下的独立协议会话仍待 #6。保留包内共享主体拦截，直到调用者身份可验证。
4. Linux 生产密码模式的凭据保护器在 `apps/engine/src/module-credential-host.ts` 仍限定 Windows x64。待生产适配和装配后，复验 Linux 生产 CLI/MCP 及失败的 8 项。交互 Shell 的观察与控制权、SFTP/传输、免桌面 Tab 的完整 A13/H11.3 流程、真实主机和打包验收仍待各自验证。

## Lead 验收

待 Lead 填写。

Lead 验收（2026-11-21）：实现与证据通过 Lead 核对，待独立审查。bundle `git bundle verify` 通过，`FETCH_HEAD`=`0748a516`，工作树与提交代码一致；已 `--ff-only` 落到 `impl/huhu-issues-3-10-ssh-exec-jobs`，删除未跟踪的证据副本（与提交内正式证据逐字节相同）。8 项旧 SSH 用例失败由 t6/task01（`0f242e2f`）的 Linux 保护与测试注入解决，集成后复跑。Lead 接线：boot.ts SSH `apply` 第 4 参数（作业回执目录与 Vault 实例身份）。stdio MCP 独立主体（报告第 3 条）归 #6 后续切片。终端关闭。
