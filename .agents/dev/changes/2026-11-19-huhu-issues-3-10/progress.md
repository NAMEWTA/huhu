# Huhu Issue #3–#10 实施记录

## 2026-11-20 启动与首批验证

本地集成分支 `impl/huhu-issues-3-10-integration` 位于 `D:/Document/code/huhu/temp/issue-worktrees/integration`。基线 `bf3942e456c03cd7a4a4070e230557bb45e1ca9c` 已含 `origin/main@f16f614` 的 #2 收尾。对 apps、packages、plugins、scripts、tests、vendor、package.json 和 pnpm-lock.yaml 比对，#2 最终代码候选 `ce913d2` 与该基线无差异。[#2 验收台账](../2026-11-18-issue2-closeout/acceptance.md)

原工作区原有的 program.md 和 model-roles.md 修改留在原处。经项目 GitHub 来源读取，#3–#10 均开放、零评论，正文逐份与现有 `source.md` 完全匹配。八份原型目录运行 fingerprint.mjs `--expect` 均匹配。已请求用户按指纹与场景确认，回复后写入相应 `prototype-review.md`。

| Issue | 本轮产物与状态 | 下一交付点 |
| --- | --- | --- |
| #3 | `51d0863` 修正桌面收不到文档保存回执时误放行。`f193612` 绑定窗口主文档。`3f45c00` 构建使用 `2c779bf` 的测试夹具跑完[两窗退出、自动保存与草稿恢复](../2026-11-19-issue-3-desktop-shell/evidence/S1a-03-quit-coalescing.md)，13 项通过。 | 故障反馈选项、退出参与者及菜单。 |
| #4 | W6.0 经三轮独立审查合入 `1b3b385`，回执合同及 Markdown 回归 55 项通过。[Windows Core](../2026-11-19-issue-4-agent-cli/evidence/W0.2-windows-core-lifecycle.md)实测子进程、握手 generation 与 doc/CAS。W1.1 `ce5289d` 已用锁定 Core 和合成 `.cmd` 实跑。 | `t54` 独立核对 W1.1，再接 W1.2 的持久启动对账。W8.3 等 #5 T7.1，同包分别执行 W8.2 和 T7.2。 |
| #5 | [T0.1](../2026-11-19-issue-5-task-automation/evidence/T0.1-provider-evidence.md)已从 Codex 及 Pi 实际读取结果和原生 ID。T1.1 `a5d82cb` 复现并修复过期编辑覆盖，验证保存和重开均未启动 CLI。 | `t54` 独立核对。真实原生问答、恢复和 Agent 派遣接线待后续。 |
| #6 | `ca8290d` 合入 [G1.1 能力盘点](../2026-11-19-issue-6-unified-tools-web/evidence/G1.1-action-inventory.md)。`t4x` 核对 `cc736e5`，确认两项返工和 G2.1 默认关闭、逐项授权、撤销、坏格式保护。[G6.1 监听生命周期](../2026-11-19-issue-6-unified-tools-web/evidence/G6.1-windows-listener.md)在 Windows 核对端口冲突和停止分享时控制端仍可调用。 | 复核安装回滚名称释放并合入目录和授权。G6.1 接入 Engine 和桌面，继续打包 Web、邀请和撤销。 |
| #7 | [H1.1 来源](../2026-11-19-issue-7-ssh-module/evidence/H1.1-upstream-map.md)与 [H1.2 Windows 构建](../2026-11-19-issue-7-ssh-module/evidence/H1.2-windows-executor-reference.md)有证据。Motty 参考二进制验证同级 Viva 和三项回环权限用例。 | 核对单一执行端接入、分发错误与实际授权 SSH 主机。 |
| #8 | [S0.1 来源](../2026-11-19-issue-8-mail-module/evidence/S0.1-source-baseline.md)与 [S0.2 TS/Rust 对照](../2026-11-19-issue-8-mail-module/evidence/S0.2-transport-probe.md)已实测同一 IMAP/API 和 SMTP 确认中断，分别关闭连接并在新进程读回投递身份。已选 TS Engine 路径。 | S1a.1 等 #9 模块凭据合同和生产接入。应用认证、真实邮箱和包内 Mail 待实测。 |
| #9 | `t1b` 实跑 Windows 本机保护。`t4z` 复验 `7174fc8` 的同进程事务、真实独立进程原生保护和故障窗口。 | 返工待重配实体阻塞回收及独立进程取用竞态，之后再做正式驱动装配和 P10.2。 |
| #10 | [W02-02 整板写](../2026-11-19-issue-10-widget-dashboard/evidence/W02-02-atomic-board.md)通过测试装配的 Engine 提交并重启读回。`t4z` 复跑 `15403bd` 的 Edge 与 Electron 静态 SSH Widget 投影。 | 修复注册描述与嵌套 Schema 可漂移。生产整板写者按 W06 切换，W04-07 等 #3 的退出契约。 |

## 平台与运行证据

- Windows x64，构建号 26300，Node 24.21.0，pnpm 12.10.1。锁定 pnpm.exe 运行 `install --frozen-lockfile`，Core `t1d` 退出 0。Electron 可执行文件版本 44.9.1。项目锁定的 Herdr Core 是 0.1.19，Windows x64 的发布压缩包经 fetch-herdr.mjs 校验，调度用的本机 hc 为 0.1.21。
- `173baab` 上 `lint` 与 `typecheck` 退出 0。旧备份夹具改用 Windows 目录联接后保留同一悬空目录安全检查，ACC-SY-08 通过。`7f012b0` 为已退出进程的测试目录引入有界清理重试。随后 `t29` 的 Engine/Home 两文件共 51 通过、6 跳过，含 W02-01 的两个 HTTP 用例和真实 Herdr shell 路径。
- `6e820fa` 上全量 `pnpm test` 观察到 936 通过、21 失败、52 跳过。失败包括 Windows 符号链接权限、Git/Vault 测试超时、索引和监听顺序。原始输出位于原工作区 `temp/issue-baseline/windows-unit-t2c.log`。
- `t28` 在 Windows 完成桌面编译，生成 Electron 44.9.1 的应用。CSS 守护把平台路径误认为自有 CSS，报告 A 304、B 12、C 0 并退出 1。`76862e6` 以项目相对路径和本机分隔符识别上游目录，同一产物重跑守护后恢复到已登记的 A 10、B 12、C 0，18 个守护单测通过。
- `t2h` 初次桌面用例在等待进入编辑器设置时超时，已保全 Playwright trace。`ea1acc3` 从常用自动保存路径验收，`t2w` 于 14.2 秒通过关窗回归。
- `t3k` 从 `f193612` 使用两个 worker 重跑全量测试，仍以 1 退出并报告 `ERR_IPC_CHANNEL_CLOSED`，没有完整计数。保留原始输出。
- `1b3b385` 的固定检出完成冻结安装和 `pnpm build`。`t46` 通过两项 Windows Electron 关窗测试，覆盖延迟保存和顶层重载中止旧请求。测试用隔离窗口、Vault 和用户目录。
- 固定检出重新打出的 Windows 阶段 NSIS 通过全部 ASAR 内文件校验。`t5g` 同一轮三项 Windows 包内冒烟通过。首轮 `7d4fef5` 阶段包因扫描后读取到变更文件而损坏，已保全失败记录。见 [Windows 打包对照](windows-stage-packaging.md)。
- `ubuntu26` 已只读核对为 Linux x86_64、Wayland，可用 Xvfb 与 dpkg。用户答复「暂仅在 Windows 继续」，本轮没有在该主机写入或运行候选。Linux 与 macOS 的安装包和实机验收均待相应平台授权与环境。
- 任务与报告见原工作区 `.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/topic.md`。当前报告、独立审查和合入以实际终稿、候选提交及检查输出为准。
- 用户限制最多四个 worktree。退役已交付的实现检出及固定包检出先降至两处，计原工作区和集成分支，再按返工范围分配。候选分支和提交保留。用完的 pane 按实际退出状态关闭，命令输出在原工作区 `temp/issue-baseline/core-finished/`，工作分派、研究和独立审查在实施主题目录。

同一组合候选的安装包、八项验收与三条联验路径仍待交付。
