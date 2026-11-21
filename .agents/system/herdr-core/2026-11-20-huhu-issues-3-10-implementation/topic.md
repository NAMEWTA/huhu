# Huhu Issue #3–#10 本地实施

## 目标与验收

- 交付 program.md 中的八项 Change、同一组合版本的本地集成提交、候选安装包、成员验收和组合联验。
- 共同基线为 `bf3942e456c03cd7a4a4070e230557bb45e1ca9c`。主会话在 `D:/Document/code/huhu/temp/issue-worktrees/integration` 整合。原工作区已有未提交的 program.md 与 model-roles.md；保留原处。
- GitHub 来源仅只读。推送、外部合并、发布与部署等待用户另外授权。使用隔离测试 Vault、合成凭据、明确授权的测试主机和邮箱。保护真实库及 provider 历史。

## 共享位置与负责人

- Lead 为本次外部 Codex 会话，通过共享根读取报告并用 hc 观察执行状态。
- Core 为本机 Windows 默认连接 `wta`，ID `346bd5608735e3fcb27f9d01f5c8008e`，Core 0.1.21，Codex CLI 0.171.0。
- 共享根 `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation`。目录由 `encodeURIComponent(terminal_address)` 产生。Lead 与 worker 使用同一本机绝对路径，身份须核对 `HC_TERMINAL_ID`。
- `t19` #4 W6.0 回执与双 ACK，gpt-6.2-sol / high，工作目录 `D:/Document/code/huhu/temp/issue-worktrees/receipt`。
- `t1c` #6 G1.1 能力目录与授权的动作盘点，gpt-6.2-sol / high，工作目录 `D:/Document/code/huhu/temp/issue-worktrees/capability`。
- `t1b` #9 P0.1 / P0.2 本机保护取证与凭据合同分析，gpt-6.2-astra / high，工作目录 `D:/Document/code/huhu/temp/issue-worktrees/credentials`。

## 首批与写入归属

- 独立审查 `t20`，gpt-6.2-sol / xhigh。直接在已提交的 receipt worktree 读取 W6.0 实际候选，业务文件只读。
- `t1c` 的 G1.1 盘点已核验，接续 G1.2。Engine 装配在本切片由 t1c 独占。
- `t1b` 的 Windows 保护分析与事务证据已核验。实现会话 `t25`（gpt-6.2-sol / high）接手 credentials worktree，拥有私有凭据事务。
- `t3b`（gpt-6.2-sol / high）负责 #10 Widget 贡献合同，独立 worktree，范围见 task01。

- 回执的共享导出由 W6.0 当前 worker 独占。后续公共能力目录与授权由 #6 当前 worker 接续，等使用同一公共 barrel 的任务交回后安排。
- Renderer 装配、插件全局注册、Vault 包收集器和根锁文件由 Lead 独占。G1.2 交回后 Engine 装配回到 Lead。#3 的关闭链路由 Lead 推进。
- 依赖、产品确认与最终验收见原工作区 program.md。参考上游源码均在原工作区 temp/sources。

## Windows 返工与复核轮

- 用户确认本轮只在 Windows 验证，并要求最多四个 worktree。当前为原工作区、集成、capability、credentials。完成的侧检出退役后再分配槽位。固定包已保存，桌面试验 checkout 已取消登记。
- `t5r` 为 #6 安装失败回滚的返工实现者，独占其 Engine 装配文件。`t4x` 已复验上一候选，预留给同一 #6 返工的独立复核。
- `t5t` 为 #9 私有凭据回收与并发取用的返工实现者。`t4z` 已核对 #9 和 #10 的冻结候选，预留给后续复核。
- `t54` 已审 #4 W1.1 和 #5 T1.1，预留给其收尾复核。剩余 Widget 修复待有实施检出槽位。
- 以上审查者读取 Git 对象和系统临时快照，无独立开发 worktree。Renderer 装配、插件全局注册、Vault 包收集器及集成根锁由 Lead 持有。原工作区 program.md、model-roles.md 与期间观察到的独立 pnpm-lock.yaml 差异留在原处，未纳入集成。
- `t5t` 交回 `86f810e`，关闭 pane 并退役凭据检出。`t4z` 从 Git 对象独立复核。原槽位用于 `t6n` 的 Tasks 隔离检出，先修 T1.1 正文 hash，再推进 T1.2 私有持久受理。
- `t5r` 交回 `c70a987`，关闭 pane 并退役能力检出。`t4x` 独立复核 G1.2/G2.1。原槽位用于 `t6s` 的 Widget 隔离检出，修订 W03-01 贡献所有权与快照。
- `t6s` 交回 `7e9ceda`，关闭 pane 并退役 Widget 检出。`t4z` 按冻结对象独立复核。原槽位用于 `t79` 重开凭据检出，修复 `t4z` 的首次初始化中断探针。
- 用户明确最终本地合入 `feature/issue-fix` 并清理本批次辅助 worktree。仍按 Windows 验证、最多四个检出、关闭已完成的 Core pane。原分支有既有 program.md、model-roles.md、pnpm-lock.yaml 差异，最终合入前核对并保全。远端写入按单独授权。
- `t79`、`t6n` 的实施已回收窗格及检出槽位，精确候选保留供 `t4z`、`t54` 独立复核。`t80` 接 #4 W1.1/W1.2，`t88` 接 #7 H2.1 后端。工作树计原根、集成、receipt、SSH 共四个。
- `t88` 交回 `3889134`，pane 闭合及 SSH 检出退役。`t4z` 只读复核。原槽位用于 `t9k` 的 Mail/S1a.1，依赖已合入 `2758912` 的私有凭据和 `5beba4c` 的进程内入口。此时为原根、集成、receipt、Mail 四个检出。

## Windows 本地候选与执行参数

- 原工作区和集成 worktree 当前均指向 `3290af19c012c320bb4c7d89c2ab66baf36357ae`。保全原工作区三个既有修改的 SHA-256 字节。集成候选通过全仓类型、lint 与构建，包和全量测试单独取证。
- 用户更新了新 Codex pane 的启动参数，使用 `--dangerously-bypass-approvals-and-sandbox -c service_tier=fast`。由 `hc get --json` 核对 `t161`（独立审查，sol/xhigh）与 `t162`（Mail 实施，sol/high）的实际 argv。已有 `t12p`、`t135` 的切片完成后保全报告并关闭 pane。
- 四个注册 worktree 分别为原工作区、集成、Agent 停止和 Mail 草稿／附件。`t161` 独立审查的两个提交为 `da65316` 和 `37bcc52`，它使用一次性 Windows 归档。`t162` 沿用 Mail worktree，未增加登记。

## 2026-11-21 完整原型确认后的派发

用户在批次会话确认 #3–#10 的全部原型，实施直接按 Change 和 Issue。八份指纹复算匹配，确认记录为集成提交 6da1b2ec。继续仅在 Windows 使用项目固定 pnpm 12.10.1 执行自动化验证。Core 在本机启动 t179（SSH 导入 UI）、t17c（Mail 工作区）和 t17b（固定提交独立审查）。实现者用 gpt-6.2-sol / high / fast，审查者用 gpt-6.2-sol / xhigh / fast，均通过实际地址投递编号任务。Lead 负责任务与自动化生产调用者切换及共享入口集成。

### t17b 审查状态

已确认独立审查终端通过指定模型开始检查两个固定提交并尝试复跑。Core 后续报告 error，Codex 界面显示网络安全分类拦截，未发布 report01.md。Lead 沿用已完成的本地运行证据，独立审查未计入通过。关闭不再复用的审查终端。
