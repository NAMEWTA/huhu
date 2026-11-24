# F09 查找替换键盘路径

基线是 `closeout/issue2-integration` 的 `88fdabd`，合入提交为 `0308796`。候选行为与测试构建取自 `8cbf09f4a5672ae402b40ebac78f8d0d6223ea8c`。原始日志集中在 `/tmp/huhu-parity06-kHwIIe/`。

## 调用路径

固定 OK 上游 `44a2e0a` 的 `packages/app/src/components/EditorArea.tsx:1571` 挂载 `FindReplaceController`。上游的 window `keydown` 先检查可编辑、源码模式、已消费和 IME 组合，再调用 `isOverlayLayerOpen`。该 helper 会从 document 查询对话框、菜单、列表框和 Radix 浮层，随后才有平台快捷键匹配。Huhu 在 `ffbafa8` 把同一控制器挂到富文本笔记，沿用上游判断顺序时，实时预览每个普通键都付出全页查询。独立诊断的三个按键 trace 记录了 main 0、引入版 80、候选 80 次查询。

现在先用现有快捷键表匹配查找、替换，以及栏打开时的前后匹配和 Escape。只有这几类按键才检查浮层，且仍按原先顺序消费事件。查询保持 document 作用域，以便窗口级快捷键继续给挂载在编辑器之外的浮层让路。匹配结果滚动仍使用活动编辑器的 `view.dom`。栏自身的 Enter 和 Escape 处理继续通过输入框事件判断 IME 状态。组合期间不执行替换。

## 回归

- 在真实 Electron 中计数原浮层选择器的 `document.querySelectorAll`。原构建输入 `abc` 得到 3 次调用，回归判红。修复后正文与查找输入框各输入 `abc`，查询增量均为 0。Ctrl/Mod+F 打开查找并增加查询计数，证明探针有效。窗口中挂载并聚焦编辑器以外的菜单后，Escape 保留查找栏。移除菜单后，Escape 关闭查找栏。
- 既有查找替换用例覆盖打开、搜索、F3、打开替换、组合态 Enter 放行、全部替换、Escape、保存及重开。另跑斜杠菜单、离线表情、独立 IME 以及 B06 的真实输入序列。见 `red.log`、`focused.log`。
- 独立 Chromium 158.0.8127.18 在没有 Electron preload 的浏览器夹具中通过，正文和查找框的普通按键查询增量均为 0，Ctrl+F 和 Escape 生效。见 `browser.log`。

### Modern Web Guidance

- **`ime-safe-enter-submit`**：保留控制器和输入框的原生组合判断，让输入法确认键先由输入法处理。指南说明组合确认事件带有 “`isComposing` set to `true`”。
- **`identify-inp-causes`**：按指南区分 “event handlers JavaScript for the interaction (processing duration)” 和随后渲染。用上游 trace 的查询次数与本轮同选择器回归确认移除的是事件处理成本，配对测试沿用项目的 DOM 更新探针。

## F09 配对测量

对照使用独立 detached worktree 的 main `9f870c0fad0c1d0538b9783214d2f4a3a3278b10`。先按锁文件安装并构建。候选使用原工作树，分别以两处构建的 `build-info.json` 核对提交。两份 `tests/e2e/perf.spec.ts` 的 SHA-256 同为 `a831428ea4e1e77f7dc96ee073fc1351987f933cf23f5a83de571890768a150e`。

同一 Linux VMware 主机、8 个逻辑 CPU，Node 26.11.1、pnpm 12.10.1、Playwright 1.65.0、Electron 44.9.1。每轮使用 Xvfb 单 worker、新 Electron 进程与新临时 Vault。起跑前等 1 分钟负载低于 4，避开其他测试或构建。记录 `uptime` 和测试期间的全机 CPU idle。输入固定 5,000 段，每轮 80 个 ASCII 键，以捕获 keydown 至首个编辑区 DOM mutation 计算 p95。

命令为 `HUHU_PERF_STRICT=1 xvfb-run -a pnpm e2e tests/e2e/perf.spec.ts -g '编辑输入延迟'`，各轮仅另加独立输出目录。顺序为每轮 main → 候选。第 4 轮 main 第一次在输入前等待 ProseMirror 挂载 15 秒超时，保留原始日志并立即重跑同一位置。该初次没有输入样本（起跑负载 2.24，CPU idle 79.2%）。

| 轮次 | main 起跑负载 | main CPU idle | main p95 (ms) | 候选起跑负载 | 候选 CPU idle | 候选 p95 (ms) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 3.87 | 74.3% | 19.8 | 3.38 | 76.3% | 21.5 |
| 2 | 3.00 | 75.8% | 21.6 | 2.84 | 75.9% | 22.2 |
| 3 | 2.70 | 75.9% | 26.7 | 2.33 | 76.5% | 20.1 |
| 4 | 2.03 | 75.5% | 26.0 | 2.10 | 75.7% | 20.9 |
| 5 | 2.07 | 76.3% | 22.4 | 2.04 | 76.4% | 23.1 |

main 的各轮 p95 中位数为 **22.4 ms**，范围 **19.8–26.7 ms**。候选为 **21.5 ms**，范围 **20.1–23.1 ms**。中位数差 **0.9 ms**，处于双方各自的轮间波动内（main 跨度 6.9 ms，候选跨度 3.0 ms）。本批未检出候选相对 main 的回退。严格 16 ms 门槛两侧均为 **0/5**，10 个有效轮分别因该门槛返回 126。

同法运行 `-g '打开 1 MiB'`。main 194 ms，起跑负载 1.88、CPU idle 72.7%。候选 433 ms，起跑负载 2.13、CPU idle 74.3%。两次均低于 500 ms 并退出 0。这是各一次门禁结果。

原始逐轮记录见 `measurements.tsv`、`perf-*.log` 和独立 Playwright 输出目录。命令驱动为日志目录的 `benchmark.py`，两个构建的元数据分别为 `main-build-info.json` 和 `candidate-build-info.json`。
