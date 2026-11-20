# Huhu Issue #3–#10 实施记录

## 2026-11-20 启动与首批验证

本地集成分支 `impl/huhu-issues-3-10-integration` 位于 `D:/Document/code/huhu/temp/issue-worktrees/integration`。基线 `bf3942e456c03cd7a4a4070e230557bb45e1ca9c` 已含 `origin/main@f16f614` 的 #2 收尾。对 apps、packages、plugins、scripts、tests、vendor、package.json 和 pnpm-lock.yaml 比对，#2 最终代码候选 `ce913d2` 与该基线无差异。[#2 验收台账](../2026-11-18-issue2-closeout/acceptance.md)

原工作区原有的 program.md 和 model-roles.md 修改留在原处。经项目 GitHub 来源读取，#3–#10 均开放、零评论，正文逐份与现有 `source.md` 完全匹配。八份原型目录运行 fingerprint.mjs `--expect` 均匹配。已请求用户按指纹与场景确认，回复后写入相应 `prototype-review.md`。

| Issue | 本轮产物与状态 | 下一交付点 |
| --- | --- | --- |
| #3 | `51d0863` 修正桌面收不到文档保存回执时误放行。新增关窗入口的故障注入回归，待 Windows 桌面依赖完成后执行。 | S1a-01 保存回归；S1a-02/S1a-03 故障反馈、请求世代和退出与看板离场的契约。 |
| #4 | W6.0 派至 Core `t19`，已观察实际工作。 | 独立审查后交 Agent 与 Tasks 消费。W8.3 等 #5 T7.1，再用同包分别执行 W8.2 和 T7.2。 |
| #5 | [T0.1](../2026-11-19-issue-5-task-automation/evidence/T0.1-provider-evidence.md) 已从 Codex 及 Pi 实际读取一轮结果和原生 ID；原生问答与恢复待实测。 | T1.1 的条件写与保存后零启动；体验按原型确认范围推进。 |
| #6 | `ca8290d` 合入 [G1.1 能力盘点](../2026-11-19-issue-6-unified-tools-web/evidence/G1.1-action-inventory.md)，覆盖 209 项定义和三条隔离样本。 | `t1c/task02` 实施 G1.2 静态目录；后续 G2 用同一 Engine Dispatcher 接入授权。 |
| #7 | [H1.1 源码核对](../2026-11-19-issue-7-ssh-module/evidence/H1.1-upstream-map.md)记录四条入口和两份上游许可证。 | H1.2 核对执行组件、分发与授权测试主机。 |
| #8 | [S0.1 源码核对](../2026-11-19-issue-8-mail-module/evidence/S0.1-source-baseline.md)记录预设、正文、投递、备份和 AI；上游远端备份为占位。 | S0.2 合成样本验证定位、断线和投递结果。 |
| #9 | `t1b/report01` 的 Windows 夹具覆盖 Electron 44.9.1 utilityProcess、main safeStorage 和独立 Node，记录重启、绑定、清理和并发写入。 | `t25/task01` 实施 P0.2 私有版本事务，后续完成本机依赖装配并以 P10.2 验证真实消费者及新格式备份。 |
| #10 | `1057af9` 将 W02-01 读布局接到 Engine。首次读内存构造一个稳定的专注样本，完整种子由 W05-12 确认。空板、格式错误及只读来源有 Engine HTTP 用例，待依赖安装后执行。 | 验证 W02-01，再稳定写事务与 W03-01 可信贡献。W04-07 等 #3 的退出契约。 |

## 平台与运行证据

- Windows x64，构建号 26300，Node 24.21.0，pnpm 12.10.1。锁定 pnpm.exe 运行 `install --frozen-lockfile`，Core `t1d` 退出 0。Electron 可执行文件版本 44.9.1。项目锁定的 Herdr Core 是 0.1.19，Windows x64 的发布压缩包经 fetch-herdr.mjs 校验，调度用的本机 hc 为 0.1.21。
- `173baab` 上 `lint` 与 `typecheck` 退出 0。Engine/Home 回归中的 W02-01 两项通过。旧备份夹具改用 Windows 目录联接后保留同一悬空目录安全检查，已通过 ACC-SY-08。现有 ACC-AG-10 的业务断言执行后，Windows 偶有进程尚持有退出的临时 Vault；`7f012b0` 按现有 e2e 清理范式加入有界重试，运行结果待 `t29`。
- `ubuntu26` 已经 Core 连接并只读核对，报告 Linux x86_64、Wayland，可用 Xvfb 与 dpkg。macOS 尚无实机证据。
- 任务与报告见原工作区 `.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/topic.md`。当前报告、独立审查和合入以实际终稿、候选提交及检查输出为准。

同一组合候选的安装包、八项验收与三条联验路径仍待交付。
