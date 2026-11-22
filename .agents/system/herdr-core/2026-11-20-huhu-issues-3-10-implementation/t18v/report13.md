# task13.md · #7 文件属性、目录跟随与 H6.1 组合回归

- 共享根 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation
- terminal_address — t18v
- task — task13.md
- 任务文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t18v/task13.md
- 报告文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t18v/report13.md
- 执行结果 — blocked
- 工作树 — D:/Document/code/huhu/temp/issue-worktrees/task-cutover
- 分支 — `impl/huhu-issues-3-10-ssh-file-follow`
- 基线 — `cfbce161f19d906ebdb0a6e5368c4e852406e734`
- HEAD — `295c052b3b46100808c086f83e78ac894d140f5c`

## 可核验提交

| 提交 | 产物 |
| --- | --- |
| `f945970cd55d1b7ebc08381cfa3b122b6b241f61` | 绑定会话内读取属性、新建文件与链接、按版本移动、修改权限及属主。 |
| `e7961277cf0c32020d84c939f9cfe6cc5f72c0db` | H6.1 依据点击前的真实左右顺序断言交换，核对绑定远端目录仍在原位置。 |
| `9eb3e7c872906cd9d5065db98f54e7e27a4777c9` | 仅在核实原工作区 Shell 提示符后允许跟随。拆开权限与属主写入，修复窄栏操作区溢出并补 Windows Workbench 验收。 |
| `295c052b3b46100808c086f83e78ac894d140f5c` | #7 Windows 验收证据。 |

## 实测结果

- **H6.1**。原 `897cd78a` 组合中，H10 文件设置用例先保存 `remoteOnLeft=true`。同一 Playwright worker 的重启沿用设备数据。H6.1 进入时远端已在左，点击交换后本机在左符合界面契约。测试现在验证两栏按实际原顺序互换，并验证远端目录仍是 `/home/test/subdir-a`。单跑 1 项通过，H10 → H6.1 同 worker 的精准组合 2 项通过。新建文件操作使窄栏溢出的问题由现有 SSH 换行布局吸收，组合不再由相邻栏拦截点击。 [原组合日志](<D:/Document/code/huhu/temp/issue-baseline/897cd78a-window-candidate.log>) · [原失败 trace](<C:/Users/cdewta/AppData/Local/Temp/huhu-t18v-task13/897cd78a-h61.zip>) · [单跑](<C:/Users/cdewta/AppData/Local/Temp/huhu-t18v-task13/h61-exact.log>) · [组合](<C:/Users/cdewta/AppData/Local/Temp/huhu-t18v-task13/h61-h10-final.log>)
- **H6.2**。960×600 Windows Workbench 实际点击读取 UID、权限和链接目标，保存权限、跨目录移动，并在拒绝路径校对原权限及字节。Engine 回环夹具证实同一修订并发仅一次写入，另一主机内容及属主不变。权限和属主各自使用一笔句柄写入；SFTP v3 的路径重命名使用版本复核及拒绝覆盖，协议无法提供 inode 级条件重命名。 [SSH 模块日志](<C:/Users/cdewta/AppData/Local/Temp/huhu-t18v-task13/delivered-ssh-tests.log>) · [OpenSSH 句柄实现](https://github.com/openssh/openssh-portable/blob/master/sftp-server.c)
- **H6.4**。工作台连接隔离回环 SSH 服务，启动真实 Windows Git Bash。正向从实际工作目录读回源文件，反向默认关；打开反向后，只对当前空闲的原 Bash 发送一次目录切换。真实目录名含单引号与命令替换外形，实际进入该目录且未创建哨兵文件。全屏、交互读取、SFTP 待响应期间的终端输入、切换分栏及关闭 Shell 逐项复核，旧动作没有补发；关闭后私有临时目录清空，试验启动文件和源字节保持。SSH 请求的 PTY 由回环服务接收，Git Bash 由夹具通过标准输入输出管道转接，原生 PTY 作业控制另验。 [最终 Workbench 日志](<C:/Users/cdewta/AppData/Local/Temp/huhu-t18v-task13/delivered-workbench.log>)
- **最终运行**。生产桌面构建标记 `9eb3e7c`。组合 Playwright 7 项通过，同 worker 覆盖 H10 设置、H4.2、H6.1–H6.4 及 H7.1/H7.2。SSH 模块 12 个测试文件、74 项通过。SSH TypeScript、改动范围内格式和 lint、SSH 文件 CSS 及 `git diff --check cfbce161..HEAD` 通过。Git 工作树干净，已清理本任务创建的 10 个临时依赖 junction。 [构建](<C:/Users/cdewta/AppData/Local/Temp/huhu-t18v-task13/delivered-desktop-build.log>) · [证据](<D:/Document/code/huhu/temp/issue-worktrees/task-cutover/.agents/dev/changes/2026-11-19-issue-7-ssh-module/evidence/H6.2-H6.4-file-follow-windows.md>)

原型资源包六文件实际指纹与确认记录相符，为 `0a890ec3a9f26bbedc304f7b61e9cb41975d8b48df4ca2a96a33ee05fb473d2b`。目录集成复用 Motty 固定版本 `2daa9db582e16edf60a60b7ada26f47f808f973c` 的私有启动文件与 Shell 提示符思路。远端目录作为文件浏览数据；反向动作只消费原 SFTP 校对过的一次性目录选择。 [已确认原型](<D:/Document/code/huhu/temp/issue-worktrees/task-cutover/.agents/dev/changes/2026-11-19-issue-7-ssh-module/prototype-review.md>) · [ssh2 SFTP 接口](https://github.com/mscdex/ssh2/blob/master/SFTP.md)

## 全规格验收余项

F08 的实际 SCP 回退和 F09 的独立特权 SFTP 尚未交付。当前普通 SFTP 后端及服务拒绝 SFTP 时的能力缺口均在界面明确显示。本轮 Windows 夹具缺少具备 sudo 的隔离回环账户，也缺少 Zsh 运行时。Zsh 启动适配已接入，真实 Zsh 及原生 PTY 验收仍待相应夹具。包含显式登录命令的分栏使用常规连接路径。遇到输入归属无法确认的情况，目录跟随保持暂停。

## G5c.1 与 H11 下一轮派发依据

1. **先做 SSH 内部资源投影**。优先使用主机、路由、连接尝试及信任待答、Shell、文件会话、传输任务的现有稳定 ID 和实际状态。H10 目前显示零个可外部开放的 SSH 工具。G5c.1 可以先通过公共只读目录列出合成样例，再用授权回环验证真实投影，目录读取保持零拨号。SSH 负责领域资源和 handler，#6 继续拥有目录、入口绑定及策略。
2. **信任待答按原始连接尝试核对**。以 `attemptId + hop + promptId` 对应当次待答和目标指纹，复核端点授权、主体、Vault、对象范围及路由版本。旧提示、错跳、错对象和撤权缓存走拒绝用例。目录投影携带可审查的状态、对象版本和必要指纹，凭据及原始终端内容留在 SSH 所属域。已有 changed-key 通过独立查证流程处理。
3. **H11.2/H11.3 后续验收**。先测试已授权作业与有界 UTF-8 按字节游标，再由 CLI 和本地 MCP 对照同一主机、等待项、作业和文件会话的标识与结果。重复意图重用原任务，撤权、跨对象和错主体均拒绝。本任务新增属性、目录跟随与主机相关入口维持当前暴露策略。 [G5c.1](<D:/Document/code/huhu/temp/issue-worktrees/task-cutover/.agents/dev/changes/2026-11-19-issue-6-unified-tools-web/tasks/G5c.1-ssh-consumer.md>) · [H11.1](<D:/Document/code/huhu/temp/issue-worktrees/task-cutover/.agents/dev/changes/2026-11-19-issue-7-ssh-module/tasks/H11.1-resource-catalog.md>) · [H11.2](<D:/Document/code/huhu/temp/issue-worktrees/task-cutover/.agents/dev/changes/2026-11-19-issue-7-ssh-module/tasks/H11.2-session-jobs.md>) · [H11.3](<D:/Document/code/huhu/temp/issue-worktrees/task-cutover/.agents/dev/changes/2026-11-19-issue-7-ssh-module/tasks/H11.3-entry-parity.md>)

## Lead 验收
