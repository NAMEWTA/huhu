# 任务报告

- 共享根 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux
- terminal_address — t10
- 恢复终端 — t1h（经 t1c 恢复，沿用 t10 任务身份）
- task — task02.md
- 任务文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t10/task02.md
- 报告文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t10/report02.md
- 执行结果 — done

## 结论

Linux CLI 自启动的 Engine 已能复用桌面保存的 SSH 托管密码。使用真实 Secret Service、回环 SSH 和构建后的 CLI 与 Engine，普通启动与锁定 Safe 两轮都各认证一次、执行一次，并读回退出码 0 和预期 stdout。锁定一轮将空闲阈值设为 1.5 秒，Exec 静默期间 3.25 秒没有轮询，原 Engine PID 和连接持续存活。作业结束后 Engine 按空闲阈值清除端点。

## 产物与改动

- 候选提交 — `f70f1a44a3330baefc6d8c966bc18aa0b1213ee3`
- 父提交 — `5021f54ce9babcf039c84c3a5b77ae32596f45cd`
- 工作区 — `/home/wta/projects/huhu/temp/issue-worktrees/agent-linux`，分支 `impl/huhu-issues-3-10-agent-linux`。工作区业务文件与候选树内容核对一致。只读的工作区 `.agents` 下，证据文件经临时索引纳入候选树。
- 证据 — `.agents/dev/changes/2026-11-19-issue-7-ssh-module/evidence/headless-engine-credentials-linux.md`
- CLI 连接函数仅在自启动分支推导 Electron 的默认用户数据目录，优先使用受信启动环境已有的 `HUHU_DESKTOP_USER_DATA`。Linux 已核对安装包目录为 `$XDG_CONFIG_HOME/@huhu/desktop`。应用名来自桌面清单，%APPDATA% 与 macOS Application Support 按 Electron 文档取值。 [Electron 路径](https://www.electronjs.org/docs/latest/api/app/#appgetpathname)
- Engine 拥有作业保活登记，按当前 Vault 的 SSH 插件作用域绑定。新受理作业持有登记直至终态和清理，最后一次释放计入空闲时间。生命周期使用现有 `PublicExecJobs.finish` 和插件处置。涉及 CLI 连接、Engine 装配和 SSH 作业文件，Kernel 无变更。

## 验证

| 验收要求 | 实际检查与结果 | 证据位置 |
| --- | --- | --- |
| 凭据跨桌面及默认 CLI 自启动 | 基线连接失败。仅改目录后普通场景通过。最终用构建后的 CLI 和 Engine 两轮通过，覆盖 Safe 锁定。 | [基线](/tmp/huhu-t10-task02.RTPHOO/test.log) · [构建产物实测](/tmp/huhu-t10-task02.AQR6PM/test.log) |
| 作业保活和终态退出 | 仅改目录时原端点在静默 Exec 期间消失。最终在原会话接收输出与终态，短阈值自行退出。既有 SSH 回归验证并行取消和显式关闭后重开。 | [仅改目录](/tmp/huhu-t10-task02.MBUmwt/test.log) · [回归](/tmp/huhu-t10-task02.BY6C7Q/test.log) |
| 可信路径和既有 Desktop 连接 | CLI 先验证桌面 Engine PID 相同，再关闭桌面并观察到自启动 PID。试图通过作业输入传递 `desktopUserData` 得到 `INVALID_INPUT`。目录仍由 Engine 启动环境和原模块宿主检查决定。 | [回归](/tmp/huhu-t10-task02.BY6C7Q/test.log) |
| 定向 Vitest | `headless-engine.test.ts` 2/0/0，`cli.test.ts` 18/0/0，`module-credential-host.test.ts` 3/0/3，`public-resources.engine.test.ts` 9/0/0，顺序为通过、失败、跳过。三个跳过项均为既有 Windows 测试。 | [共 32 通过、3 跳过](/tmp/huhu-t10-task02.BY6C7Q/test.log) |
| 静态检查与构建 | `pnpm lint`、`pnpm format:check`、`pnpm knip`、CLI 与桌面构建均退出 0。根类型检查的并行运行遇到内存压力。串行检查同样的工作区包，前 23 包通过。修正测试夹具的 ES2023 兼容问题后，最后的 CLI 包类型检查和两项回归均通过。 | [最终静态检查](/tmp/huhu-t10-task02.MK6cij/test.log) · [串行类型检查](/tmp/huhu-t10-task02.v5rUMt/test.log) · [CLI 类型复查](/tmp/huhu-t10-task02.ljBtDW/test.log) · [桌面构建](/tmp/huhu-t10-task02.OeRQ79/test.log) |

## 阻碍与接续

本次 Linux 验收已完成。Windows、macOS 的路径仍待实际运行验证，候选安装包的启动器也待安装包验收。

## Lead 验收

由 Lead 在验收后追加。

Lead 验收（2026-11-21）：通过。候选 `f70f1a44` 与工作树一致，已快进并合入集成 `4a9a7305`。终端 t1h 关闭。
