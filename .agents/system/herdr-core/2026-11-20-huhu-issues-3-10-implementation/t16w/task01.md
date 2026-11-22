# #5 T5.3 · 规则发生与冻结入选名单

终端 t16w，任务 task01.md，报告 report01.md。现有 agent-lifecycle worktree 已切至独立 `impl/huhu-issues-3-10-task-occurrence`，父 `891c20e1c747534fa62634f7f107efcc89da7374`。按 `.agents/dev/changes/2026-11-19-issue-5-task-automation/tasks/T5.3-scan-occurrence.md`，复用已合入的 T4.2 日历分类、`automations` 当前规则版与 `Tasks` 的 `TaskRuleDispatch.acceptRule`，实现规则 ID＋scheduledForUTC 的持久 occurrence、手动独立 invocation、已筛选的任务输入与补充指令快照、逐项稳定派遣标识和写后恢复。已有发生重交沿用原规则和名单，真实两个规则与一个人工入口竞争仅一个有效任务接受。验证在发生落盘、逐项受理和状态更新之间中断后的原项一次补齐，并核对停用后的既受理记录语义。先通过既有内部服务注册／实际 Engine 测试装配，生产现有外部入口的唯一切换交 T7.1，避免并行旧 supervisor 与新写者。可复用本地 `agent-autoloop` 参考，但按实际源码与许可证记录。可写范围 plugins/automations 后端及对应任务文档，涉及共享插件注册或 Tasks 对外契约时报告 Lead。按 Windows、隔离 Vault／合成执行器，无真实外部服务、UI、根锁、其他 worktree 或新增登记。报告已实测场景和剩余调度／刊登范围，清理临时验证窗格。

用户已更新验证范围。后续在当前环境只用锁定 pnpm 跑项目自动化测试，例如 pnpm exec vitest run，不另开图形应用或 Windows、Linux、macOS 实机。保留已取得的证据并继续原切片。
