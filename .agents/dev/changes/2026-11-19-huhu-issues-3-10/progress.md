# Huhu Issue #3–#10 实施记录

## 2026-11-20 启动与首批验证

本地集成分支 `impl/huhu-issues-3-10-integration` 位于 `D:/Document/code/huhu/temp/issue-worktrees/integration`。基线 `bf3942e456c03cd7a4a4070e230557bb45e1ca9c` 已含 `origin/main@f16f614` 的 #2 收尾。对 apps、packages、plugins、scripts、tests、vendor、package.json 和 pnpm-lock.yaml 比对，#2 最终代码候选 `ce913d2` 与该基线无差异。[#2 验收台账](../2026-11-18-issue2-closeout/acceptance.md)

原工作区原有的 program.md 和 model-roles.md 修改留在原处。经项目 GitHub 来源读取，#3–#10 均开放、零评论，正文逐份与现有 `source.md` 完全匹配。八份原型目录运行 fingerprint.mjs `--expect` 均匹配。已请求用户按指纹与场景确认，回复后写入相应 `prototype-review.md`。

| Issue | 本轮产物与状态 | 下一交付点 |
| --- | --- | --- |
| #3 | `51d0863` 修正桌面收不到文档保存回执时误放行。`ea1acc3` 的 Windows 实机用例通过，挂起保存时窗口和 Engine 留存，恢复后重开能读到最后输入。 | S1a-01 的手动模式与草稿故障；S1a-02/S1a-03 故障反馈、请求世代和退出与看板离场的契约。 |
| #4 | W6.0 候选 `3804140` 已由 `t20` 独立复核。确认评论 ID 往返可破坏补送去重、原生暂停 JSON Schema 导出缺口以及浏览器与 Node 的导出边界。 | `t19/task02` 返工后由 `t20` 复审，沿同一合同接 Agent 与 Tasks。W8.3 等 #5 T7.1，再同包分别执行 W8.2 和 T7.2。 |
| #5 | [T0.1](../2026-11-19-issue-5-task-automation/evidence/T0.1-provider-evidence.md) 已从 Codex 及 Pi 实际读取一轮结果和原生 ID；原生问答与恢复待实测。 | T1.1 的条件写与保存后零启动；体验按原型确认范围推进。 |
| #6 | `ca8290d` 合入 [G1.1 能力盘点](../2026-11-19-issue-6-unified-tools-web/evidence/G1.1-action-inventory.md)，覆盖 209 项定义和三条隔离样本。 | `t1c/task02` 实施 G1.2 静态目录；后续 G2 用同一 Engine Dispatcher 接入授权。 |
| #7 | [H1.1 源码核对](../2026-11-19-issue-7-ssh-module/evidence/H1.1-upstream-map.md)记录四条入口和两份上游许可证。 | H1.2 核对执行组件、分发与授权测试主机。 |
| #8 | [S0.1 源码核对](../2026-11-19-issue-8-mail-module/evidence/S0.1-source-baseline.md)记录预设、正文、投递、备份和 AI。[S0.2 样本](../2026-11-19-issue-8-mail-module/evidence/S0.2-transport-probe.md)已走通 IMAP UID、API 字符串 ID、SMTP 结果未知与新进程读回。 | 比较 Rust 适配的实际必要性，确认取消、认证和打包路径后推进 S1。 |
| #9 | `t1b/report01` 的 Windows 夹具覆盖 Electron 44.9.1 utilityProcess、main safeStorage 和独立 Node，记录重启、绑定、清理和并发写入。 | `t25/task01` 实施 P0.2 私有版本事务，后续完成本机依赖装配并以 P10.2 验证真实消费者及新格式备份。 |
| #10 | `1057af9` 将 W02-01 读布局接到 Engine。首次读内存构造一个稳定的专注样本，完整种子由 W05-12 确认。空板、格式错误及只读来源有 Engine HTTP 用例，待依赖安装后执行。 | 验证 W02-01，再稳定写事务与 W03-01 可信贡献。W04-07 等 #3 的退出契约。 |

## 平台与运行证据

- Windows x64，构建号 26300，Node 24.21.0，pnpm 12.10.1。锁定 pnpm.exe 运行 `install --frozen-lockfile`，Core `t1d` 退出 0。Electron 可执行文件版本 44.9.1。项目锁定的 Herdr Core 是 0.1.19，Windows x64 的发布压缩包经 fetch-herdr.mjs 校验，调度用的本机 hc 为 0.1.21。
- `173baab` 上 `lint` 与 `typecheck` 退出 0。旧备份夹具改用 Windows 目录联接后保留同一悬空目录安全检查，ACC-SY-08 通过。`7f012b0` 为已退出进程的测试目录引入有界清理重试。随后 `t29` 的 Engine/Home 两文件共 51 通过、6 跳过，含 W02-01 的两个 HTTP 用例和真实 Herdr shell 路径。
- `6e820fa` 上全量 `pnpm test` 观察到 936 通过、21 失败、52 跳过。失败包括 Windows 符号链接权限、Git/Vault 测试超时、索引和监听顺序。原始输出位于原工作区 `temp/issue-baseline/windows-unit-t2c.log`。
- `t28` 在 Windows 完成桌面编译，生成 Electron 44.9.1 的应用。CSS 守护把平台路径误认为自有 CSS，报告 A 304、B 12、C 0 并退出 1。`76862e6` 以项目相对路径和本机分隔符识别上游目录，同一产物重跑守护后恢复到已登记的 A 10、B 12、C 0，18 个守护单测通过。
- `t2h` 初次桌面用例在等待进入编辑器设置时超时，已保全 Playwright trace。`ea1acc3` 从常用自动保存路径验收，`t2w` 于 14.2 秒通过关窗回归。
- `7d4fef5` 上复跑 `pnpm build` 退出 0，桌面构建标识也读回该提交。Windows 阶段安装包由 `t38` 生成，用于提前核对打包及安装入口，批次共同候选仍等 T7.1 与其余集成。
- `ubuntu26` 已经 Core 连接并只读核对，报告 Linux x86_64、Wayland，可用 Xvfb 与 dpkg。macOS 尚无实机证据。
- 任务与报告见原工作区 `.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/topic.md`。当前报告、独立审查和合入以实际终稿、候选提交及检查输出为准。
- 已归档并关闭 22 个用完的 Core 命令 pane，以及已完成分析、不再复用的 `t1b`。命令退出状态及输出保存在原工作区 `temp/issue-baseline/core-finished/`，分析报告留在主题目录。`t20` 等待复审，实施终端按 manifest 当前任务继续。

同一组合候选的安装包、八项验收与三条联验路径仍待交付。
