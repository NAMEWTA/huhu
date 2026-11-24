# 任务报告

- 共享根：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout
- pane_id：w4:pE
- task：task05.md
- 任务文件：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pE/task05.md
- 报告文件：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pE/report05.md
- 执行结果：done
- 审查目标：`e85d2818e25373c16ad486f741f43fab100ad334`，对照 `cf882bd`

## 结论

**接受两个提交的实现。** 首次列举竞态已修复，键盘用例同步正确，候选全量的两条用例都首跑通过。新 G07 计时仍覆盖原工作台和引擎就绪条件，能去掉旧定位器的确认滞后。最终配对没有识别出工作台或收件箱所测端点超出同构建波动的回退。工作台 p95 仍高 24.4 ms，首页内容完成和其他冷启动入口未测。保留这些范围和数值后，本轮未发现需要退回代码的阻断。最终发行包已通过检查。F09 严格性能门槛独自失败，按既定 Issue 口径登记。

## `affeb58` · 文件树与键盘路径

- **此次空树竞态的修复成立。** 文件列举 effect 只依赖 `deps`。`ResourceTree` 用当前 Engine 客户端作为唯一依赖，隐藏规则、目录根和回调经 ref 取最新值。关闭新建对话框带来的 `onHide` 更新只会重设菜单钩子。即便语言就绪带来的 `FileTree` 首次挂载发生在同一提交，文件 `GET /api/documents?showAll=true` 的路由仍在。正常卸载仍注销路由，真实 Engine 客户端变更仍会重新注册。保留空文档兜底符合其他先于文件树挂载的调用方行为。pD 的时序日志对 `cf882bd` 和 main 都复现旧缺陷，因此这是既有问题在候选期被识别并修复。 [路由 effect](/home/wta/projects/huhu-wt-review/packages/editor/src/host/explorer.tsx:77) · [依赖生命周期](/home/wta/projects/huhu-wt-review/plugins/notes/src/ui/explorer/ResourceTree.tsx:73) · [文档兜底](/home/wta/projects/huhu-wt-review/packages/editor/src/host/host-fetch.ts:11) · [pD 分析](/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pD/report04.md)
- **首次列举受控用例能识别原回归。** 临时副本只控制语言启用后的首挂、创建成功后的对话框关闭和同批隐藏回调变更。释放前要求刷新已发生、笔记已落盘且树还未挂载。测试同时断言首个带文档数组的根响应、真实 `onListed` 数据及可见树行。在 `cf882bd` 的判红中，后来刷新已补齐树行和 `rootPaths`，首个响应仍为 `[]` 使断言失败。修复版同用例 1/1。该对照证明命中了原竞态。 [门控与断言](/home/wta/projects/huhu-wt-review/tests/e2e/knowledge/explorer-first-listing.spec.ts:44) · [旧版判红](/tmp/huhu-task09.DG2BIT/first-listing-confirmed-red.log:11) · [修复后通过](/tmp/huhu-task09.DG2BIT/first-listing-green.log)
- **当前构建上的测试可用，字符串插桩有维护成本。** 块前缀、每个标记必须唯一，找不到、改写目标片段或重复都会直接失败。构建副本不会因为缺少标记而跳过用例。守卫确认了字面锚点和部分可见时序。若以后同名代码表示的调用点改变，匹配唯一仍不能保证触发原竞态。另一个边界是 `firstRootResponse` 当前保存首个含数组的成功结果，若首请求报错或不同并发请求先返回，最终绿色不足以保证发出的第一条请求成功。改动 bundler、路由顺序或挂载逻辑后，宜验证副本的构建 SHA、同次提交的回调身份变化，并按请求发起顺序记录首条状态。当前这类潜在假绿在已验证的空响应路径上没有发生。 [插桩唯一性](/home/wta/projects/huhu-wt-review/tests/e2e/knowledge/explorer-first-listing.spec.ts:18) · [响应采样](/home/wta/projects/huhu-wt-review/tests/e2e/knowledge/explorer-first-listing.spec.ts:65)
- **a11y 焦点同步成立。** 树行可能早于模态框完成。现在确认对话框退出、文档标签可见，再聚焦具名导航内的任务按钮，验证实际焦点和 Enter 后的模块挂载，覆盖了原超时路径。pB 日志为 a11y 4/4，键盘压力零重试 30/30，相关工作流 46/46。现有用例末尾按 ArrowDown 后只检查任务文件数，尚未证明任务持久化为标题中的「勾选」状态，这是既有覆盖缺口，可独立补充。 [a11y 用例](/home/wta/projects/huhu-wt-review/tests/e2e/a11y.spec.ts:64) · [压力日志](/tmp/huhu-task09.DG2BIT/keyboard-pressure.log) · [工作流日志](/tmp/huhu-task09.DG2BIT/explorer-workflows.log)

## `6d76add` · G07 指标与时钟

- **保持了原 G07 的工作台代理指标。** 起点仍在驱动发起 Electron 启动前，新端点在渲染器一次检查工作台布局盒可见和「引擎就绪」。旧路径仍并行输出。两次检查需同时成立，省去了 Locator 的最高 500 ms 级重试退避和驱动回传延迟。Playwright 1.65 的 `polling: "raf"` 会先立即检查，再在失败时逐帧轮询，精确含义是脚本安装后的首次观测时刻。若安装较晚，测不到先前已满足的帧。pG 的诊断里 `firstWindow` 约 460–470 ms，满足条件约 1,040 ms，给这批样本留有明显观测余量。 [计时实现](/home/wta/projects/huhu-wt-review/scripts/measure-notes-startup.mjs:62) · [Playwright 轮询实现](/home/wta/projects/huhu-wt-review/node_modules/.pnpm/playwright-core@1.65.0/node_modules/playwright-core/lib/coreBundle.js:26046) · [pG 同启动两端点](/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pG/report01.md:17)
- **时钟换算成立，精度受跨进程校准约束。** `(renderer.timeOrigin + renderer.now()) - (node.timeOrigin + launchStart)` 把两个相对时间还原为以 Unix 纪元为参考的毫秒，再求持续时间。两个 API 各自使用单调时间，在同主机、相近启动且时钟稳定的对照中合理。两个运行时独立估计纪元，遇到系统时间校正、漂移或异常首次探测仍有误差。当前没有逐样本的安装时间、时钟偏移/往返界和异常值上界。数量级小于测量噪声的差值不适合做无回退的确定性结论。 [换算位置](/home/wta/projects/huhu-wt-review/scripts/measure-notes-startup.mjs:81) · [W3C High Resolution Time](https://www.w3.org/TR/hr-time-3/#sec-time-origin) · [Node.js 计时 API](https://nodejs.org/api/perf_hooks.html#performancetimeorigin)
- **首屏业务数据和其他模块的范围需如实标注。** 两个版本的 `HomeModule` 在 `home.summary` 未就绪时都能渲染占满区域的同名空容器，原、新端点都有机会在卡片出现前命中。因此本指标能识别工作台外壳与引擎就绪变慢，无法排除卡片加载或首个真实交互变慢。收件箱仍按旧口径，从工作台切换到收件箱外壳首次可见，计时在两只时钟都完成后才开始。它可代表此启动场景的非知识库模块初次进入，其数据呈现和直接冷启入口均未覆盖。首篇笔记保留真实键盘打开到可编辑且含目标文字的计时，延迟进入编辑器仍会在 `noteMs` 反映。 [G07 条文](/home/wta/projects/huhu-wt-review/.agents/dev/archive/changes/implemented/feature_2026-11-14-knowledge-ok-parity/spec.md:79) · [工作台旧门槛](/home/wta/projects/huhu-wt-review/tests/e2e/perf.spec.ts:30) · [首页空容器](/home/wta/projects/huhu-wt-review/packages/workbench/src/home/HomeModule.tsx:120) · [收件箱与首篇笔记](/home/wta/projects/huhu-wt-review/scripts/measure-notes-startup.mjs:103)
- **历史差值缩小有独立依据，正式结论仍需同时读两端点及 A/A。** pG 在同一次启动中比较原 locator 与实际观测帧，20 对配对中位分别为 +90.2 与 −11.7 ms，新端点 p95 仍高 26.2 ms。旧测量受驱动等待影响明显，真实小幅回退仍需量化。新脚本两个模式均交替顺序和隔离 profile/Vault，配对取同一编号，两侧分别统计 nearest-rank p50/p95，有失败返回非零。pA 只在较早构建做 2+2 对流程冒烟。正式结果须看完整配对数、尾部、A/A 波动、旧端点和运行负载。A/A 用同一产物估计噪声，不能覆盖两个产物间的系统偏差。 [统计实现](/home/wta/projects/huhu-wt-review/scripts/measure-notes-startup.mjs:151) · [pG 20 对诊断](/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pG/report01.md:33) · [pA 过程证据](/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pA/report09.md)

## 最终测量与交付门禁

### G07 · 最终候选的 20 对与 A/A

已核对候选构建 `e85d281`、基线构建 `9132640`、两批各 40 个原始样本、交错顺序、nearest-rank p50/p95 和配对中位数。两批均退出 0。A/B 起跑一分钟负载 **1.94**，实际满足启动前小于 2。两批采样期间记录到 **1.94–4.72**，A/A 在 A/B 之后直接开始，最近一条负载为 **3.55**。因此 A/A 可用于观察同构建波动，其负载与 A/B 起跑条件有差异。 [候选构建](/tmp/claude-1000/-home-wta-projects-huhu/c2410bfd-f61b-4b17-99f5-52f055b662c9/scratchpad/int9/build-info.json) · [基线构建](/home/wta/projects/huhu-wt-rc4/apps/desktop/out/build-info.json) · [负载采样](/tmp/claude-1000/-home-wta-projects-huhu/c2410bfd-f61b-4b17-99f5-52f055b662c9/scratchpad/int9/g07-load.txt)

| 指标（ms） | rc.4 p50 / p95 | 候选 p50 / p95 | 候选减 rc.4 配对差中位数 | 较慢对数 |
| --- | ---: | ---: | ---: | ---: |
| 工作台与引擎就绪，浏览器端点 | 1059.6 / 1132.9 | 1055.0 / 1157.3 | −8.6 | 9/20 |
| 工作台，旧 locator 端点 | 1413.5 / 1572.1 | 1443.8 / 1526.7 | +22.1 | 12/20 |
| 收件箱首次外壳可见 | 68.9 / 78.9 | 66.9 / 83.3 | +2.2 | 11/20 |
| 首篇笔记可编辑 | 72.7 / 81.3 | 465.6 / 486.6 | +396.4 | 20/20 |

工作台实测中位数没有显示回退。最终 p95 比 rc.4 高 **24.4 ms**，pG 在较早候选重测也高 **26.2 ms**。同构建 A/A 的两侧 p95 相差 **44.4 ms**，配对差中位 **−14.5 ms**。收件箱 A/B 的 p95 差为 **+4.4 ms**，A/A 两侧相差 **9.9 ms**。这些差值与同构建波动相近，支持「当前工作台与收件箱所测端点未识别出超出噪声的回退」。样本量和负载差异仍不足以排除可重复的小幅尾部变化。旧端点两侧取到的值通常分别比各自浏览器端点晚 **332.1 / 353.2 ms**。首篇笔记慢约 **0.4 秒** 在 20 对中方向一致，必须如实记入 G07。规格要求记录该项耗时。最终 A/B 与 A/A 未带 `--trace-modules`，懒加载证据沿用 pG 的 CDP 记录和本轮无入口依赖变化的代码核对。 [A/B 原始数据](/tmp/claude-1000/-home-wta-projects-huhu/c2410bfd-f61b-4b17-99f5-52f055b662c9/scratchpad/int9/g07-rc4.jsonl) · [A/A 原始数据](/tmp/claude-1000/-home-wta-projects-huhu/c2410bfd-f61b-4b17-99f5-52f055b662c9/scratchpad/int9/g07-aa.jsonl) · [编辑器加载时机原始资料](/tmp/pg07/modules)

### G06 · 最终候选门禁

- 格式、lint、typecheck、build、knip、notices、补丁登记和 vendor 重放均退出 0。项目单测 **1006 通过、1 跳过**，vendor 单测 **6391 通过、4 跳过**。固定上游重放 1346 文件零差异。 [门禁记录](/tmp/claude-1000/-home-wta-projects-huhu/c2410bfd-f61b-4b17-99f5-52f055b662c9/scratchpad/int9/progress.log) · [项目单测](/tmp/claude-1000/-home-wta-projects-huhu/c2410bfd-f61b-4b17-99f5-52f055b662c9/scratchpad/int9/test.log) · [vendor 单测](/tmp/claude-1000/-home-wta-projects-huhu/c2410bfd-f61b-4b17-99f5-52f055b662c9/scratchpad/int9/test:vendor.log) · [重放](/tmp/claude-1000/-home-wta-projects-huhu/c2410bfd-f61b-4b17-99f5-52f055b662c9/scratchpad/int9/replay.log)
- 全量零重试 **239 通过、1 失败、4 跳过**，21.7 分钟。新增首次列举 #86、键盘 #3、模板继承 #22 和 A07 拖放 #201 均通过。4 跳过为默认未启用的 10 万文件用例以及 3 个截图用例。唯一失败 F09 为 5000 行文档、80 次输入 p95 **21.3 ms**，高于严格 **16 ms**。旧 main 配对中位 p95 为 22.4 ms。按 Issue F09 的「测量并记录」口径留红，应继续与严格项目门槛一并说明。 [全量结尾](/tmp/claude-1000/-home-wta-projects-huhu/c2410bfd-f61b-4b17-99f5-52f055b662c9/scratchpad/int9/e2e-full.log:396) · [性能数据](/tmp/claude-1000/-home-wta-projects-huhu/c2410bfd-f61b-4b17-99f5-52f055b662c9/scratchpad/int9/e2e-full.log:238) · [历史同机对照](/home/wta/projects/huhu-wt-review/.agents/dev/archive/changes/implemented/bug-fix_2026-11-18-issue2-closeout/verification/parity/f09-findreplace.md:22)
- `e85d281` 的 Linux ASAR 核对 **51,020 条**且读回同一 SHA，打包 E2E **4/4**，Debian amd64 构建退出 0。压缩安装包从 rc.4 的 **141,619,672 B** 增至 **225,420,312 B**（**+83,800,640 B，+59.17%**）。构建日志记录候选 `rich` JS 为 **5,206,092 B**，`host-fetch` JS **2,902,075 B**，`explorer` JS **712,146 B**。按 Q9 记录增长。 [ASAR](/tmp/claude-1000/-home-wta-projects-huhu/c2410bfd-f61b-4b17-99f5-52f055b662c9/scratchpad/int9/asar.log) · [打包验收](/tmp/claude-1000/-home-wta-projects-huhu/c2410bfd-f61b-4b17-99f5-52f055b662c9/scratchpad/int9/e2e-packaged.log) · [最终 Debian 大小和指纹](/tmp/claude-1000/-home-wta-projects-huhu/c2410bfd-f61b-4b17-99f5-52f055b662c9/scratchpad/int9/deb-size.txt) · [rc.4 同格式基线](/home/wta/projects/huhu-wt-review/.agents/dev/archive/changes/implemented/bug-fix_2026-11-18-issue2-closeout/verification/layout/g07-budget.md:119) · [最终块体积](/tmp/claude-1000/-home-wta-projects-huhu/c2410bfd-f61b-4b17-99f5-52f055b662c9/scratchpad/int9/g07-rc4.jsonl:2)

## 分级

- **阻断 · 本轮未发现新的产品阻断。** G06 的最终候选记录已收齐。G07 若按本次沿用的工作台与收件箱外壳端点，现有证据支持未识别到超出噪声的回退。若签收口径要求 p95 点估计不得增加，或要求首页数据完成与各非知识库入口都无回退，相关条件仍未确认。最终台账应采用可由现有测量支持的口径。
- **应修 · 正式测量的低负载门槛应明确退出并单独核对 A/A 起跑。** `final.sh:11–15` 等待循环耗尽后仍执行采样，A/A 也没有重新等负载回落。本轮 A/B 的 1.94 证明实际达到了起跑负载门槛，A/A 的负载偏高应保留说明。以后应让门槛超时可见并记录两批各自的起跑、进程条件和逐轮负载。 [运行包装器](/tmp/claude-1000/-home-wta-projects-huhu/c2410bfd-f61b-4b17-99f5-52f055b662c9/scratchpad/int9/final.sh:10)
- **应修 · 回归用例的构建与首请求证据。** 捕获第一条根请求的发起顺序和 HTTP 状态，明确探针是否实际改变了目标回调身份，并在日志中读回测试副本的构建 SHA。这样未来重构后仍能区分用例在覆盖原竞态、产物不符和首请求失败后自愈。当前判红及候选集成结果足以验收这次修复。 [受控用例](/home/wta/projects/huhu-wt-review/tests/e2e/knowledge/explorer-first-listing.spec.ts:44)
- **可选 · 提升指标与键盘末步的可观察性。** 可并列采集主探针安装时刻、跨进程校准样本和工作台实际内容首次呈现，以复核很小的时差。若需要验证键盘完成任务，应断言实际持久化状态，或把现有标题改成测试覆盖的操作。

## 审查范围

- 已切到 detached `e85d281`。核对 `cf882bd..e85d281` 四个文件、含新增回归用例，`git diff --check` 通过。
- 本轮只做静态审查、查证公开计时 API 和读日志。没有启动测试、构建、Electron 或测量。分支结果对应其运行产物，最终门禁按候选构建标识、日志与样本核对。

## Lead 验收

Lead（2026-11-19）：接受。affeb58 与 6d76add 均成立。G07 在台账中按可支持口径写明：工作台外壳 + 引擎就绪、收件箱外壳首次可见，配对中位与 A/A 波动并列，同时列出 p95 点估计 +24.4 ms / +4.4 ms、A/A p95 两侧差 44.4 / 9.9 ms，以及首页卡片数据和直接冷启入口未测。应修两项（测量包装器负载门槛超时可见、回归用例首请求与构建 SHA 可观察）与可选项登记为后续，不阻断。H02 守护回归（token-map `:root`）由 pB task10 处理；F09 由 pG task02 分析。
