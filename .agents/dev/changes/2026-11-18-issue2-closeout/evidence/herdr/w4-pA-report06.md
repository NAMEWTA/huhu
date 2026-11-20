# 任务报告

- 共享根：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout
- pane_id：w4:pA
- task：task06.md
- 任务文件：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pA/task06.md
- 报告文件：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pA/report06.md
- 执行结果：done

## 结论

查找替换控制器的普通输入已跳过全页浮层查询。真实 Electron 回归中，原版 3 个普通字母触发 3 次查询，修复后在编辑器正文和已打开的查找框内均为 0。实际查找快捷键继续检查浮层，编辑区外的浮层保持键盘优先级。

低负载下的配对测量达到本任务的相对验收要求。main 输入 p95 中位数为 22.4 ms，候选为 21.5 ms，差 0.9 ms，落在双方各自的轮间波动内。严格 16 ms 门槛两侧均为 0/5。打开 1 MiB 文档分别为 194 ms 和 433 ms，两侧通过 500 ms 门槛。

## 产物与改动

- 工作目录为 `/home/wta/projects/huhu-wt-parity`，分支为 `closeout/issue2-parity`。开工合入集成 `88fdabd`，合并提交 `0308796`。最终分支提交 `a098015251ad69a5c79354c503e7305e53f8cbc9`，工作树干净。
- `dedfab7` 修复控制器判断顺序并登记 vendor 改动。最终被测构建 `8cbf09f4a5672ae402b40ebac78f8d0d6223ea8c` 调整了外部浮层测试的焦点前提。末次提交仅补证据。
- 上游 `EditorArea` 挂载的查找控制器在 window keydown 中先调用全页浮层 helper，再匹配按键。Huhu 先通过现有快捷键表识别查找、替换、打开时的前后匹配和 Escape，才检查浮层。为覆盖编辑器外的浮层，相关快捷键继续使用原来的 document 作用域。栏内 Enter 与 Escape 保持各自的 IME 判断。
- 刷新 `vendor-replay.json` 和 `vendor-replay.patch.gz`。更新 `evidence/parity/runs.md`，新增 `evidence/parity/f09-findreplace.md`。两份分别保存门禁结果、上游比较和逐轮配对表。main 通过独立 detached worktree 安装并构建，测完已清理该临时 worktree，保留构建元数据与原始日志。

## 验证

原始日志、逐轮记录及 Playwright 输出目录为 `/tmp/huhu-parity06-kHwIIe/`。

| 验收要求 | 实际检查与结果 | 证据位置 |
| --- | --- | --- |
| 普通输入查询回归 | 原版预期 0、实际 3，退出 126。修复后正文及查找输入框普通键增量 0，Mod+F 有查询并打开栏。编辑器外浮层获取焦点时 Escape 不关闭查找栏，浮层移除后 Escape 关闭栏。 | `red.log`、`focused.log` |
| 查找替换及键盘行为 | 6 个 Electron 定向用例通过，覆盖查找、F3、替换、Esc、IME、斜杠、表情与 B06。独立 Chromium 158.0.8127.18 的正文和查找框回归通过。 | `focused.log`、`browser.log` |
| `pnpm test:vendor` | 330 文件，6,391 项通过、4 项跳过，退出 0。包含查找扩展、匹配器、浮层 DOM、IME DOM 和链接浮层事件。 | `vendor.log` |
| 类型、lint、构建、格式、knip | `pnpm typecheck`、`pnpm lint`、`pnpm build`、`pnpm format:check`、`pnpm knip` 全部退出 0。main 冻结锁文件安装并构建也通过。 | `typecheck.log`、`lint.log`、`candidate-build.log`、`main-build.log`、`format-check-final.log`、`knip.log` |
| `ok-patches.mjs --check` 与 `--replay` | 差异登记 266 条，无缺项或多余登记。固定上游重放 1,346 文件，文件集合和字节零差异。均退出 0。 | `patches.log`、`replay.log` |
| F09 低负载交替配对 | 每轮 80 键。main 五轮 p95 为 19.8、21.6、26.7、26.0、22.4 ms，范围 19.8–26.7 ms。候选五轮为 21.5、22.2、20.1、20.9、23.1 ms，范围 20.1–23.1 ms。有效轮起跑负载 2.03–3.87。main 第四轮第一次在输入前等编辑器超时，零样本，补跑同一位置。两侧全部实测轮超过 16 ms。 | `measurements.tsv`、`perf-*.log`、`f09-findreplace.md` |
| 打开 1 MiB | main 194 ms、候选 433 ms，起跑负载分别为 1.88 和 2.13，均退出 0。 | `perf-1MiB-main-1.log`、`perf-1MiB-candidate-1.log` |

## 阻碍与接续

本任务无阻碍。两侧严格 16 ms 门槛仍未达到，已按要求记录供 Issue F09 整体验收使用。

## Lead 验收

（Lead 追加，2026-11-19）**验收：通过**。打开 1 MiB 的 194 / 433 ms 两边都低于 500 ms 门槛，但候选约慢一倍，在台账中如实记录，并交复审评估。
