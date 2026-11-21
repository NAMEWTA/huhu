# 任务报告

- 共享根：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout
- pane_id：w4:pC
- task：task05.md
- 任务文件：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pC/task05.md
- 报告文件：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pC/report05.md
- 执行结果：done

`done` 表示 worker 已完成所派任务并交回结果。Lead 在报告末尾记录验收。

## 结论

原用例把前一次保存留下的「已保存」当成了刚输入尾字的完成信号。自然桥接的复现中，ProseMirror 已含完整「切回后继续写」，当时的 `Y.Text`、磁盘与保存请求都未包含尾字。旧状态取样 965 ms 后，真实 `notes.save` 请求带上尾字，随后磁盘全文精确匹配。受控慢桥先写入「切回后」，再追加「继续写」，也观察到旧状态先于最终保存请求，随后真实自动保存写入完整文件。以上证据定位的是测试读盘过早，本次轨迹没有出现尾字被丢弃或覆盖。

## 产物与改动

在 `/home/wta/projects/huhu-wt-session` 的 `closeout/issue2-session` 分支提交 `db92ad12a1a5b147c0b761c6eb7f5104b5dfc88b`，工作区干净。生产代码沿用原有实现。

- `tests/e2e/knowledge/journey.spec.ts` 等待最终精确文件内容，再检查「已保存」。完整文件比较同时核对原正文、链接、标题、`zip: 007` 和换行。前段批注写入后，通过两个已打开的文档标签切换，保留冷笔记字节与 mtime 不变的检查。
- `.agents/dev/changes/2026-11-18-issue2-closeout/evidence/session/review-fixes.md` 与 `runs.md` 记录根因、负载复跑和全量失败。原始日志和 trace 位于 `/tmp/huhu-session-05/`。

## 验证

| 验收要求 | 实际检查与结果 | 证据位置 |
| --- | --- | --- |
| 原版负载复跑至少 20 次 | 四路 CPU 负载下 6/20 通过。6 次到达末段后读盘缺尾字，8 次更早在冷笔记切换后仍显示「日志」。 | `baseline.log`、`baseline-results/`、`baseline-load.log` |
| 观察输入、桥接、真实请求与最终落盘 | 自然桥探针在修正前段导航后 2/2 完整落盘，其中一次捕获先读到旧状态。两次受控样本验证同一顺序。另一次受控复测取样时桥已结算，未执行该次最终断言。 | `probe-slow.log`、`probe-followup-{slow,natural}.log` |
| 改后的完整旅程负载复跑 10 次 | 10/10 通过，退出 0。 | `loaded.log`、`loaded-load.log`、`loaded-results/.last-run.json` |
| 全量知识库和工作流 E2E | 已运行 `xvfb-run -a pnpm e2e tests/e2e/knowledge tests/e2e/workflows`。142 通过、4 失败、1 默认跳过。完整旅程通过。 | `full.log`、`full-results/` |
| 全量失败定位 | `Embed` 与 `underline` 为 task04 已归 w4:pA 的英文定位超时。H03 超时点与 task03 一致，等待气泡「粗体」。ACC-WB-03 回到甲库时等待树中的「草稿甲」超时，未进入草稿恢复断言。H03 和 ACC-WB-03 单独复跑各 3/3，后者偶发的树入口缺失原因仍未确定。 | `full-results/`、`retry-h03.log`、`retry-wb03.log` |
| 静态检查 | `pnpm lint` 和 `pnpm format:check` 均退出 0。 | `lint.log`、`format.log` |

## 阻碍与接续

本任务无阻碍。全量门槛仍有上述四项失败，分别保留 trace 和原始日志。

## Lead 验收


（Lead 追加，2026-11-19）**验收：通过**。有根因证据（测试读盘过早，真实保存后来写全）；负载下 10/10 通过。ACC-WB-03 的偶发入口缺失，由 Lead 在集成全量中继续观察。
