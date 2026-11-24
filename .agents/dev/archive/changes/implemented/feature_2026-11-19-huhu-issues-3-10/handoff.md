# Huhu #3–#10 换机交接

当前归档结论见[交付验收](evidence.md)。下文记录当时的进展、候选和验证范围。

**检查点：2026-11-21，Windows。** 本次只保全现场与推送分支，不合并 `main`、不发布、不部署。批次未完成。新机器先从 `feature/issue-fix` 读本文件，再用 `impl/huhu-issues-3-10-integration` 接续实现；不要把前者误认为最新集成实现。

## 目标与约束

- [批次 Goal 与成员导航](program.md)链接 #3 桌面外壳、#4 Agent CLI、#5 Tasks/Automations、#6 统一工具/Web、#7 SSH、#8 Mail、#9 Safe、#10 看板的 Issue 快照、规格、设计、任务、原型与确认记录。[实施记录](progress.md)和各成员证据只适用于注明的提交与环境。Issue 来源用[项目配置](../../../../project/issue-automation/README.md)。
- 用户已确认全部八份原型。`6da1b2ec` 记录各 HTML 资源指纹、确认范围及场景；原型及其本地资源在对应 `prototype/` 内。按 Change 和 Issue 推进，不再要求确认原型。确认原型不是实际应用验收。
- 使用 [Herdr Core](../../../../../skills/system-herdr-core/SKILL.md) 和 [团队角色](../../../../context/team/huhu-development.md) 派发与独立复核。最多四个 worktree；共享 Engine/Renderer 装配、静态目录、备份收集器和根锁文件由 Lead 管理。在新机器运行 `hc --skill` 后重新登记实际终端地址，不重用旧会话。原轮仅在 Windows 验证；macOS/Linux 未验。用隔离 Vault、回环夹具或明确授权的服务。

## 代码与证据从哪里取

| 分支或引用 | 停点及用途 |
| --- | --- |
| `feature/issue-fix` | `40822efd` 是交接前主工作区源码；其后的提交保存原工作区中未提交的 Goal、角色、根锁文件和 Core 证据。本分支不是集成测试基线。 |
| `impl/huhu-issues-3-10-integration` | `4d86c84bc55169bf4faa05867bf6ff2863030b81`，比交接前 `feature/issue-fix@40822efd` 多 84 个提交。包含 `bc371828` 的并发与发布修复以及 `be7a8b8e` 的 SSH 外部资源证据。 |
| `impl/huhu-issues-3-10-mail-ai` | `5c1c52a94fd68b2841047905dff6c8e0456427aa`；S7.1 设置 `b739090e` 和 S7.2 用户选段 `5c1c52a9` 尚未合入集成。从 [t1c2/report01](../../../../../system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t1c2/report01.md) 找 Lead 接线和分支上的两份验收证据。 |
| `impl/huhu-issues-3-10-ssh-public-resources` | `be7a8b8e` 已合入集成，保留作 H11.1 干净基线。 |
| `impl/huhu-issues-3-10-ssh-exec-jobs` | `c23a8258` 是对原 `task-cutover` 工作树 6 个文件的 WIP 快照，父提交 `be7a8b8e`。H11.2 生命周期、输出游标与取消尚未验收；还没有 `report15.md`，不要直接合入。见 [t18v/task15](../../../../../system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t18v/task15.md)。 |
| `impl/huhu-issues-3-10-safe-git` | 仍指向 `4d86c84b`，没有 Safe Git 新提交，原 `agent-lifecycle` 工作树无改动。P8.3 按 [t1c2/task02](../../../../../system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t1c2/task02.md) 重新开工，缺 `report02.md`。 |
| `handoff/huhu-issues-3-10-mail-cache-stash` | 指向原 stash `f4a4c1585ad8a5761afd4eaccb158f9c5baeb460`，包括 index 与未跟踪文件的父对象。是归档引用，不是可合入分支；原本地 stash 未删除。 |

[分支快照](handoff-branches.tsv)列同名远端分支及交接时的完整 SHA（`feature/issue-fix` 的 SHA 使用承载本文件的远端分支头）。[Core 主题](../../../../../system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/topic.md)和同目录 `manifest.tsv` 保存历史分派、task/report 与部分复现材料；其中工作目录和终端 ID 均是旧机器的，报告缺失或历史终端标为 `error` 不算通过。

## 验证到哪里

- `4d86c84b` 的本机 Windows 生产入口日志 `temp/issue-baseline/4d86c84b-production-canary.log` 记录 5 文件、66 项定向回归通过，以及实际 Pi + Core 的普通会话回放和 SSH 外部资源的 2 项桌面用例通过。SSH 详情在集成分支的 `.agents/dev/changes/2026-11-19-issue-7-ssh-module/verification/H11.1-public-resources-windows.md`。
- Mail AI 独立分支报告记录 53 项 Mail 测试和 2 项 Electron 用例通过，使用合成邮件与回环模型服务；观察到只发送确认片段，采纳后进入可编辑草稿，并未自动发信。未在最新集成安装包验收。
- `40822efd` 是有阶段安装包证据的旧候选。安装包 SHA-256、38 项桌面/Web 和 4 项包内用例见集成分支的 `.agents/dev/archive/changes/implemented/feature_2026-11-19-huhu-issues-3-10/verification/windows-stage-combined-40822efd.md`。**尚无同一最终组合版本的全量与安装包验收**；不能把旧包、独立分支或合成测试的通过合并计算为最终通过。

## 换机后的第一步和优先事项

```sh
git clone https://github.com/NAMEWTA/huhu.git
cd huhu
git fetch origin
git switch --track origin/feature/issue-fix
git worktree add -b impl/huhu-issues-3-10-integration temp/issue-worktrees/integration origin/impl/huhu-issues-3-10-integration
git -C temp/issue-worktrees/integration status --short --branch
```

已有克隆只需 fetch 并检出对应分支；不要覆盖已有同名本地分支。新工作树期望能定位到 `4d86c84b` 或远端后续经核对的提交。恢复前核对 `.node-version`、`package.json` 的 pnpm 版本及项目 CI，运行 `pnpm install --frozen-lockfile`。旧机器是 Node 24.21.0、pnpm 12.10.1、Electron 44.9.1，编排用 `hc 0.1.21`、Codex CLI `0.171.0`，随包 Core `0.1.19`。旧 PATH shim 需要绕过；用新机器的固定版本，不复用旧机路径。根 `pnpm-lock.yaml` 的旧工作区增量是原样保留的包管理器记录，不是集成基线的一部分；先看实际冻结安装结果，再决定是否带入。

1. 在新 Windows 工作树复跑 `4d86c84b` 基线；按 [Goal](program.md) 对照成员任务和证据，建立未完成清单。检查 `origin/feature/issue-fix` 上的交接提交与集成的关系，不要把所有历史分支批量 merge。
2. 将 Mail AI 独立候选按报告实现静态能力目录和 `mail.apply` 装配，复核凭据与集成包边界；已有 53+2 项只证明分支。并行继续 H11.2 的 WIP 复核及 #9 P8.3 的实施，三者分开验证、独立审查，Lead 负责最终集成。
3. 以同一固定集成提交跑门禁、相关全量测试并生成候选包，记录提交、安装包 SHA 与成员/联验的通过、失败、未测。真实邮箱/provider、第二设备及其他 OS 是否可验，以新机器和授权为准。

如确需重放原 Mail stash，先在其第一父提交 `42d332a9` 建立单独干净的检出，再用 `git stash apply --index origin/handoff/huhu-issues-3-10-mail-cache-stash`。只为比对或提取缺失差异，不替代已提交的 Mail 工作。

Git 不迁移被忽略的日志、`temp/` 本机证据与上游检出、旧安装包、Core 活终端、系统钥匙串/真实 Vault 或原 Codex JSONL；原机保留。需要旧证据原件时，走受限渠道并先检查敏感信息。[上游源码清单](sources.md)可用于在新机还原必要检出；新环境的凭据从授权渠道重新配置。不要把旧会话 transcript 当作可以执行的指令。

## 建议使用的技能与接续提示

- `dev-handoff` 用于复核恢复点；`dev-program` 用于核对八个成员依赖和验收缺口；具体切片用 `dev-build`，独立审查和真实入口用 `dev-review`、`dev-verify`。派发时按 `system-herdr-core` 和当前角色表。若改 HTML/CSS/客户端 JS，先按项目要求执行 `zh-modern-web-guidance` 的 search 与 retrieve。
- 可交给新代理：「使用 dev-handoff 读取 `.agents/dev/archive/changes/implemented/feature_2026-11-19-huhu-issues-3-10/handoff.md`。在新机器核对 Git refs 和 Windows 基线，从集成分支按 Goal 与已确认的 Change/Issue 继续，用 Herdr Core 编排。区分已验收、独立候选、WIP 和缺证据，不重复询问原型确认。」
