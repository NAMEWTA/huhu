# 任务报告

- 共享根：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout
- pane_id：w4:pD
- task：task02.md
- 任务文件：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pD/task02.md
- 报告文件：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pD/report02.md
- 执行结果：done

## 结论

**这项可复现的逐键回退由 parity 的 `ffbafa8` 引入。** 该提交以 `9f870c0` 为直接父提交。新增的查找替换控制器在普通字母的每次 keydown 上遍历整个页面查找浮层。三份按键期 trace 中，这个查询在父提交出现 0 次，在该提交和最终候选都出现 80 次。仅调整判断顺序后，最终候选五轮的 p95 中位数由 **26.8 降至 20.2 ms**，五轮均有改善。对引入点和调用机制的确定程度高。

**F09 仍未达标。** 本机同批 main 五轮中位数 18.9 ms，session 三轮中位数 23.3 ms。历史 session 的 14.1 ms 没有在本批复现。已确认的查询在本批低负载 trace 中直接占用约 2.1 ms/键。整个历史 10–18 ms 差额无法归给单一提交，机器一分钟负载低于 4 也无法消除跨轮抖动。建议先消除这次新引入的每键全页查询，继续按 ≤16 ms 验收。

## 产物与改动

报告为唯一交付物。工作目录 `/home/wta/projects/huhu-wt-analysis`，detached HEAD `190605a96eba6c84ea157f1cc0d47b5b224a9124`。首次引入点 `ffbafa8479039e6f008f5a76e9ba6326d8736f1d`，父提交 `9f870c0fad0c1d0538b9783214d2f4a3a3278b10`。业务源码零改动，无新提交。诊断探针位于本工作区，实验改动仅作用于生成的 renderer bundle。探针、实验改动及本次创建的八个 scratch worktree 均已清理。还原后的 rich bundle SHA-256 为 `afbfd71353be1ec73aebd04657c5b8c2685ab081be5be267027043d7a648934a`，Git 工作区干净。

## 验证

| 验收要求 | 实际检查与结果 | 证据位置 |
| --- | --- | --- |
| 身份、版本与构建 | Herdr 本地继承连接，`pane current --current` 返回 `w4:pD`，清单指向 `task02.md active`。候选依次执行指定 checkout、frozen install 和 build。各历史点独立 detached worktree、同样安装和构建，核对 out/build-info.json 与 SHA。 | topic.md、manifest.tsv、各点 build 日志 |
| 同机配对 | wta-ubuntu，VMware，i7-12700，8 个可用 CPU，Linux x86_64，Node 26.11.1、pnpm 12.10.1、Playwright 1.65.0、Electron 44.9.1 / Chromium 152.0.7977.167。分版本交错或逆序，单 worker，每次新进程、新 Vault、新 userData、同一 Xvfb 命令。正式延迟轮每次记录 uptime 并等待 1 分钟负载 <4，起跑时排除其他 Vitest、Playwright 和 TS 编译。有效轮全机 CPU idle 为 71.8%–77.2%（整条命令的 /proc/stat 差值）。 | 下表、`measures.tsv`、`cpu.tsv`、每轮日志 |
| 计时与工作量 | 严格命令 `HUHU_PERF_STRICT=1 xvfb-run -a pnpm e2e tests/e2e/perf.spec.ts -g '编辑输入延迟'`，仅另指定独立输出目录。夹具为标题加 5,000 段、每轮 80 个 ASCII a。48 个有效轮均采到 80 键。p95 取第 76 小值，从 document 捕获 keydown 到首个编辑区 DOM mutation 回调。不含下一帧绘制。 | `tests/e2e/perf.spec.ts:126–174`，各版本测试文件 SHA-256 相同 |
| 配对剖析 | 独立诊断轮用 CDP Profiler（请求间隔 500 µs）和 Tracing，仅包住 80 键循环，以 keydown / DOM 的 User Timing 成对裁剪。三版都得到 80 对标记，核对 5,001 个顶层块及连续 80 个 a 确实进入编辑器。诊断轮不纳入正式 p95。 | 下方 trace、profile 与 selectors 片段 |
| 查找替换行为 | 临时前置快捷键判断后，真实 Electron 查找栏、F3 定位、替换框、组合态 Enter、替换全部、Esc、保存及重开用例通过，1 passed。 | `tests/e2e/knowledge/editor-parity-closeout.spec.ts:28`、`run-functional-gated.log` |

### 各版本严格结果

负载和 p95 按该点的有效轮次一一对应，单位 ms。“中位数”是各轮 p95 的中位数。最后一列是严格门槛通过轮次。前三组覆盖主线、session、layout、parity、集成及同构建实验。补测的顺序、时间和最大值都保存在原始 TSV。

| 提交和用途 | 起跑 1 分钟负载 | 各轮 p95 | 中位数 | ≤16 ms |
| --- | --- | --- | ---: | ---: |
| `9f870c0` · main，引入点的直接父提交 | 3.90 / 2.15 / 1.91 / 1.85 / 2.20 | 18.9 / 18.9 / 19.2 / 26.6 / 17.2 | 18.9 | 0/5 |
| `eeb4413` · session，退出前结算 | 3.00 / 2.59 / 2.42 | 23.3 / 27.8 / 19.7 | 23.3 | 0/3 |
| `784058e` · layout，详情栏及主题 token | 2.11 / 2.22 / 2.53 | 18.4 / 53.6 / 42.2 | 42.2 | 0/3 |
| `5f71479` · layout，首次合入前的分支头 | 2.02 / 1.82 / 1.69 | 23.2 / 18.7 / 18.0 | 18.7 | 0/3 |
| `ffbafa8` · parity，首次挂载查找替换 | 1.84 / 2.16 / 2.17 / 2.21 / 2.01 | 25.5 / 32.1 / 22.1 / 28.4 / 31.3 | 28.4 | 0/5 |
| `e212033` · parity，首次合入前的分支头 | 1.35 / 2.11 / 2.39 | 20.7 / 31.9 / 22.1 | 22.1 | 0/3 |
| `03dc93b` · 首次集成 | 2.57 / 2.57 / 2.24 | 24.8 / 23.7 / 25.2 | 24.8 | 0/3 |
| `2abe8a2` · parity，新增表情等壳层入口 | 2.01 / 2.60 / 2.75 | 20.5 / 26.3 / 32.7 | 26.3 | 0/3 |
| `190605a` · 最终候选 | 3.41 / 2.37 / 1.71 / 2.36 / 1.92 | 26.8 / 21.7 / 21.2 / 33.0 / 33.6 | 26.8 | 0/5 |
| 实验 A · 最终候选，仅将快捷键判断前置 | 2.79 / 2.37 / 2.33 / 2.12 / 2.09 | 21.4 / 19.6 / 19.0 / 20.2 / 25.0 | 20.2 | 0/5 |

layout 的早期提交有两次特别慢，起跑负载 2.22 / 2.53 时达到 53.6 / 42.2 ms。随后单独做 main → layout → layout → main，负载依次为 1.93 / 2.06 / 3.03 / 2.36，p95 为 27.7 / 26.0 / 26.6 / 23.1 ms。两对差值方向相反，layout 分支头的中位数也接近同期 main。目前无法将早期 layout 的离群值归给主题 token。最终候选直接观察到的查找浮层扫描已经出现在单独的 parity 分支中。

不计入上表的预跑中，main 在起跑负载 3.96、其他 Vitest 正在执行时得到 37.8 ms。随后增加了竞争测试进程检查。另有 4 次正式尝试在输入前等待编辑器超时（5f71479 ×2, ffbafa8 ×2），均无输入样本，已独立登记并补测。历史记录中，pA 的守卫启用/移除中位数为 26.7/26.8 ms。pE 的首次集成为 17.9 ms，pC 的 session 空闲轮为 14.1 ms。它们属于各自原测批次。

### 调用栈与耗时

1. **引入点。** `git show ffbafa8 -- packages/editor/src/rich/RichMarkdownEditor.tsx` 显示该版第 424 行首次在就绪的文档编辑器中挂载 `FindReplaceController`，最终候选为同文件第 477 行。即使查找栏关闭，`packages/editor/src/vendor/open-knowledge/app/src/editor/find-replace/FindReplaceController.tsx:213–217,252` 的 window keydown 处理器仍先调用浮层检查，随后才判断 find / replace。该组件的 transaction 订阅在第 184 行已经检查查找栏是否打开。
2. **新增工作。** `packages/editor/src/vendor/open-knowledge/app/src/lib/overlay-layers.ts:1–15` 对 document 运行包含五组浮层选择器的 `querySelectorAll`。CPU 栈为 `onKeyDown → isOverlayLayerOpen → Document.querySelectorAll → querySelectorAll`。在最终候选生成包的 `rich-D_fmTkBC.js:46550`、`host-fetch-BP7VsSz5.js:49479` 可对到源码。下表的“栈采样”以 isOverlayLayerOpen 为祖先，分母为落入 80 个计时窗口的全部样本。

| 按键期诊断 | 起跑负载 | 浮层查询次数 | 查询总计 / p50 / p95（ms） | keydown 分发总计（ms） | 浮层栈采样 |
| --- | ---: | ---: | --- | ---: | ---: |
| `9f870c0` | 2.68 | 0 | 0 / — / — | 50.4 | 0 / 4584 |
| `ffbafa8` | 2.58 | 80 | 174.4 / 2.1 / 2.7 | 229.4 | 284 / 4871 |
| `190605a` | 2.23 | 80 | 173.8 / 2.1 / 2.8 | 230.8 | 293 / 5104 |

父子提交的 keydown 分发相差 179.0 ms，其中 174.4 ms 可直接量到浮层查询。相同窗口内 Layout 总时长为 244.8 / 226.5 / 227.4 ms，UpdateLayoutTree 为 20.7 / 20.1 / 19.9 ms。这组 trace 中增长集中在按键处理器。三份样本的共同热点包括 ProseMirror 的 `DOMObserver.flush → readDOMChange → dispatchTransaction → applyTransaction`。诊断中的 Document 方法包裹仅统计计时区间内的 document 查询。父提交的 0 指特定浮层查询。原测试打印的 CM 三段中位数均为 0，本次实时预览使用 ProseMirror，因果判断采用上面的实际栈。

### 修复范围与预期

**最小改动为调整查找控制器的判断顺序。** 在 `FindReplaceController.tsx:213` 保留只读、源码、已消费事件和组合输入检查，先用现有平台快捷键匹配识别 find、replace，以及已打开时的 next、previous 和 Escape。其余键直接返回，仅候选命令检查浮层键盘所有权。保留浮层优先级、现有触发顺序与平台绑定。

同构建原版与实验 A 五轮按组相减，p95 分别减少 5.4 / 2.1 / 2.2 / 12.8 / 8.6 ms。**可复验的修复预期是这条路径从每 80 键查询 80 次降至 0 次，首次五组配对下 p95 约 20 ms（19.0–25.0 ms），后续独立批次见下表。** 五组方向一致，而查询本身在低负载每键 p95 仅 2.7–2.8 ms。尾部分位数还受其他工作及跨轮波动影响，不能把五组差值全当成该函数的独占耗时。

为估算剩余空间，另在实验 A 上限制两项已有的全文扫描。`packages/editor/src/vendor/open-knowledge/app/src/editor/extensions/bare-html-image-decoration.tsx:123,182` 在 docChanged 时重建裸 HTML 图片装饰。`packages/editor/src/vendor/open-knowledge/app/src/editor/extensions/code-block-lowlight-plugin.ts:99–100` 分别遍历新旧文档查找代码块。两文件从 main 到候选无差异。最终候选中 `findRenderableBareHtmlImages` 和 `findChildren` 分别命中 231 和 140 个包含该帧的窗口样本。实验只在单个 ReplaceStep 于普通段落插入纯文本、修改后该段不含 `<` 时映射已有装饰，其余事务仍走原路径。

| 补充对照 | 起跑负载 | 各轮 p95（ms） | 中位数 | ≤16 ms |
| --- | --- | --- | ---: | ---: |
| 仅快捷键前置 | 2.36 / 2.28 / 2.06 | 36.0 / 46.0 / 28.8 | 36.0 | 0/3 |
| 再对两个装饰插件走局部路径 | 2.71 / 1.99 / 1.84 | 34.7 / 30.8 / 31.0 | 31.0 | 0/3 |

后续时段，实验 A 自身的 p95 已漂移至 28.8–46.0 ms，即使起跑负载都在 2–3 左右。两插件局部路径三轮为 34.7、30.8、31.0 ms，方向并不完全一致，也没有达标。它们是旧版本共有的成本，本次观察不足以把这项扩展改动列为必需修复，或保证原问题会从 25–34 ms 降至历史 14 ms。第二项实验只验证 5,000 段的输入路径。涉及 HTML 图片、代码块、撤销及协作更新的行为需在正式实施前分别验证。

## 阻碍与接续

定位任务已完成。执行期间集成分支推进到 `88fdabd`，本报告的最终候选固定为任务指定的 `190605a`。**F09 关闭条件仍需候选实测通过。** 建议 Lead 合入最小修复后在相同真实编辑入口复核，确认普通字母不会触发浮层扫描、快捷键与浮层优先级正确，并报告至少三轮低负载 p95。若仍超过 16 ms，可从两版共有的事务和布局成本继续收敛。现有数据不能给出历史 14.1 ms 与今天每一毫秒差异的唯一解释。

诊断参照 modern-web-guidance 的 performance、identify-inp-causes，将 JavaScript、Layout 和 UpdateLayoutTree 分别归集。正式指标保持项目既有的 DOM 探针口径。

本机原始测量证据位于 `/tmp/huhu-f09-pd02.1KM1ic`：`measures.tsv`、`unmeasured.tsv`、`cpu.tsv` 及相应 run 日志。`profile-{9f870c0,ffbafa8,190605a}.cpuprofile`、`.trace.json`、`.selectors.json`、`.txt` 保存三点 CPU 栈、两端标记、查询耗时和摘要。数值与判断已在报告内列全。临时目录按系统清理周期保留。

## Lead 验收

（Lead 追加，2026-11-19）**验收：通过**。回退点（ffbafa8，查找替换控制器每键做全页查询）有 trace 证据；修复转 w4:pA/task06。Lead 判断：Issue 对 F09 的原文要求是测量并记录；16 ms 是项目性能用例的门槛，今天 main 本身也测得 18.9 ms。候选版本须与 main 在同批配对测量中达到同一水平，并如实记录两边相对 16 ms 门槛的情况。
