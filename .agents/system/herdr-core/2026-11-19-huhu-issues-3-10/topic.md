# Huhu GitHub Issues #3–#10 规划

## 目标与验收

- 目标 — 用户确认处理全部八个 Issue。当前分支 `feature/issue-fix`，基线 `9f870c0fad0c1d0538b9783214d2f4a3a3278b10`。
- 验收 — 每个 Issue 有来源快照和本地规划；接口与架构有实质取舍处比较方案、推荐方向，标出产品待决问题、依赖和验收办法。
- 约束 — 本轮只写 Markdown 规划及本协议记录，产品代码、代码骨架、HTML 原型、外部写入、提交及推送均不在本轮范围。

## 共享位置与负责人

- Lead — 当前外部 Codex 会话，直接从共享目录读取 report 并通过 hc 观察状态。
- Core 连接 — 本机 Windows，默认连接 `wta`，Core ID `346bd5608735e3fcb27f9d01f5c8008e`，版本 `0.1.21`。Lead 不在 Core 终端内。
- 共享根 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-19-huhu-issues-3-10
- 目录规则 — `encodeURIComponent(terminal_address)`。
- 路径及身份核对 — t1（#3、#10），t2（#4、#5），t3（#6、#7），t4（#8、#9） 均由同一 Core 在 D:/Document/code/huhu 启动，worker 读 task 时以自身 `HC_TERMINAL_ID` 核对。Lead 与 worker 共用本机绝对路径。

## 决定与交接

项目文件的唯一写入范围按各 task 划分。跨 Issue 的接口建议由 Lead 汇总，产品选择仍按其影响和依赖记录。详细结果见各终端报告。


## 续派

首次启动的 Windows workspace-write 模式无法写入 .agents，shell 设置也失败。Lead 核实 t1–t4 已停止原任务且没有写出业务文档，保留原 task 和 blocked 清单记录。续派 t5–t8 使用与 Lead 一致的本地执行模式，业务写入范围沿用原 task。t5 接续 t1，t6 接续 t2，t7 接续 t3，t8 接续 t4。

## 验收

Lead 已回读 t5–t8 四份终稿并逐组验收。八份来源身份、正文及评论数已与 GitHub 复核，八个 change 的四类文件及其本地链接已核对。实施顺序见 [规划总览](../../../dev/changes/2026-11-19-huhu-issues-3-10/program.md)。本轮只交付文档。
