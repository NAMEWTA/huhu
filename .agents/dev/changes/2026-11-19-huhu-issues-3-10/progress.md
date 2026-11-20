# Huhu Issue #3–#10 实施记录

## 2026-11-20 启动与首批验证

本地集成分支 `impl/huhu-issues-3-10-integration` 位于 `D:/Document/code/huhu/temp/issue-worktrees/integration`。基线 `bf3942e456c03cd7a4a4070e230557bb45e1ca9c` 已含 `origin/main@f16f614` 的 #2 收尾。对 apps、packages、plugins、scripts、tests、vendor、package.json 和 pnpm-lock.yaml 比对，#2 最终代码候选 `ce913d2` 与该基线无差异。[#2 验收台账](../2026-11-18-issue2-closeout/acceptance.md)

原工作区原有的 program.md 和 model-roles.md 修改留在原处。经项目 GitHub 来源读取，#3–#10 均开放、零评论，正文逐份与现有 `source.md` 完全匹配。八份原型目录运行 fingerprint.mjs `--expect` 均匹配。已请求用户按指纹与场景确认，回复后写入相应 `prototype-review.md`。

| Issue | 本轮产物与状态 | 下一交付点 |
| --- | --- | --- |
| #3 | `51d0863` 修正桌面收不到文档保存回执时误放行。新增关窗入口的故障注入回归，待 Windows 桌面依赖完成后执行。 | S1a-01 保存回归；S1a-02/S1a-03 故障反馈、请求世代和退出与看板离场的契约。 |
| #4 | W6.0 派至 Core `t19`，已观察实际工作。 | 独立审查后交 Agent 与 Tasks 消费。W8.3 等 #5 T7.1，再用同包分别执行 W8.2 和 T7.2。 |
| #5 | W6.0 任务明确 Tasks 持久消费与可重建结果约束。 | T0.1 provider 取证，T1.1 的条件写与保存后零启动；体验按原型确认范围推进。 |
| #6 | G1.1 派至 Core `t1c`，盘点能力来源与调用。 | G1.2/G2 的公共目录和授权，复用 Engine Dispatcher。 |
| #7 | [H1.1 源码核对](../2026-11-19-issue-7-ssh-module/evidence/H1.1-upstream-map.md)记录四条入口和两份上游许可证。 | H1.2 核对执行组件、分发与授权测试主机。 |
| #8 | [S0.1 源码核对](../2026-11-19-issue-8-mail-module/evidence/S0.1-source-baseline.md)记录预设、正文、投递、备份和 AI；上游远端备份为占位。 | S0.2 合成样本验证定位、断线和投递结果。 |
| #9 | P0.1/P0.2 派至 Core `t1b`，比较系统保护与进程隔离。 | 凭据替换与绑定合同交各模块。P10.2 核对真实消费者及新格式备份。 |
| #10 | `1057af9` 将 W02-01 读布局接到 Engine。首次读内存构造一个稳定的专注样本，完整种子由 W05-12 确认。空板、格式错误及只读来源有 Engine HTTP 用例，待依赖安装后执行。 | 验证 W02-01，再稳定写事务与 W03-01 可信贡献。W04-07 等 #3 的退出契约。 |

## 平台与运行证据

- Windows x64，构建号 26300，Node 24.21.0，pnpm 12.10.1。使用本地缓存的锁定 pnpm.exe 执行 `install --frozen-lockfile`，Core `t1d`。锁文件通过供应链检查，安装仍在下载和链接。Electron/Chromium、原生菜单与安装包 SHA 等实际运行后补齐。
- `ubuntu26` 已经 Core 连接并只读核对，报告 Linux x86_64、Wayland，可用 Xvfb 与 dpkg。macOS 尚无实机证据。
- 任务与报告见原工作区 `.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/topic.md`。当前报告、独立审查和合入以实际终稿、候选提交及检查输出为准。

同一组合候选的安装包、八项验收与三条联验路径仍待交付。
