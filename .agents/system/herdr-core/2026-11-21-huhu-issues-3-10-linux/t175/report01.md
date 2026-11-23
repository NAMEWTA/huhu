# t175/task01　非 SSH 性能失败诊断

Lead t3p，worker t175，task01.md，执行状态 done（只读分析）。integration 的 HEAD 为 4a54f0a9fc0a2dbc46aae816b4c0ae9399a59b73。先查任务退出，再用低开销按键驱动查终端采样。前者吞掉原始断言，还消耗整轮退出预算；后者已有证据指向采样机会不足。编辑器与插件的端到端超限成立，当前产物还不能把毫秒数归给某个产品函数。

## 两版实际测到了什么

每个候选、每个场景各一次。Linux、生产构建入口、Playwright 1.65.0、Xvfb、一个 worker。当前驱动使用独立 HOME/XDG、DBus 和全机重型任务锁。每轮 CPU 负载、缓存冷热和调度延迟没有随这五个样本完整记录，不能从两轮差值判定代码变快或变慢。当前 failed 组共 11 项，8 失败、3 通过。下表只列本次分工。

| 场景 | 05a748b6 | 4a54f0a9 | 可确认的结果 |
| --- | --- | --- | --- |
| 2,000 篇笔记，inbox 停用 / 启用 | 912 / 216 ms | 64 / 414 ms | 两轮各有一个方向超过 300 ms，方向相反。当前冷启动 1,845 ms。两个版本都在 RSS 检查前失败。 |
| 1 MiB Markdown 首开 | 898 ms | 679 ms | 均超过 500 ms。当前文件 1,048,630 字节，444,016 个 JS 字符，18,897 行。 |
| 5,000 段富文本输入 | p95 17.1，最大 31.2 ms | p95 18.8，最大 27.7 ms | 均为 80 键，均超过 16 ms。夹具 217,895 字符，在富文本模式测量。 |
| 1,000 份任务副本及原模板 | 最大 50 ms，0 次 >66 ms | 最大 133 ms，10 次 >66 ms | 两次均 1,001 个 DOM 行、滚动距离 62,956 px。仅当前滚动断言失败，两次随后均未正常退出。 |
| 10 MiB 终端输出期间搜索框输入 | 旧搜索框定位超时，未得到 p95 | 5 个有效样本，p95 / 最大均为 29.7 ms | 当前通过了开始、结束和双帧完成检查。至少 10 键的断言失败，后续 100 ms 断言没有执行。 |

本轮日志 [followup-failed](followup-failed-4a54f0a9.log)，[完整归档](followup-failed-artifacts-4a54f0a9)，[旧版日志](../../../agent-linux/temp/final-audit/targeted-failed-05a748b6.log)及[旧版归档](../../../agent-linux/temp/final-audit/failed-artifacts-05a748b6)。逐个用 Python zipfile 读取 ZIP 内 test.trace，按 callId 配对 before.startTime 与 after.endTime，保留缺失的 after、stdout 和断言错误。它们记录的是测试步骤，没有浏览器或 Engine CPU 栈，也没有 HTTP 分段。两个版本之间 perf.spec.ts 对前四项无改动，终端用例改过驱动。稳定归档和独立保全中的当前滚动 ZIP 的 SHA-256 均为 bc64972e7f19725504dae06698fbc0e0a52d39264c69d9e47769dc9443a4197c。

## 1. 千行任务与退出，分别定位

**实际等待点。** 测试在启动后的空库用 API 建模板，再同步写 1,000 个独立 Markdown 文件。看到第一行即开始。正对照在 6 个 rAF 中注入 120 ms 阻塞，实际取 91 个程序化滚动帧间隔。两次正对照均过。当前 trace 的滚动 evaluate 共 3,055 ms（旧版 1,921 ms，均含正对照）。dzvl@46 的 toEqual 留下 10 个超限间隔，dzvl@48 在 48,627.773 ms 进入 Close context，到用例超时仍缺 after，约 54 s 未返回。随后日志另报 worker teardown 超时。旧 ddce@46 通过、ddce@48 同样缺 after，说明修复滚动本身还不足以解释退出。rAF 间隔含绘制、线程调度和后台干扰，不能从 133 ms 推出有一个 133 ms 的 JS 函数。 [用例](../../tests/e2e/perf.spec.ts#L183) · [独立保全](followup-task-scroll-evidence-4a54f0a9/trace.zip)

**两条产品路径可能同时存在。** TaskTable 对各组直接 map，每行有交互控件，随数据刷新会重新构建整组。与此同时，启动后批量写文件可以触发 watcher 的一批变更，Engine 逐路径发布 vault.fileChanged。工作台针对每条事件发起查询失效，其中包括 tasks、home、health。任务模块订阅 tasks.list；每次真正执行 TasksService.list 都会进入 SemanticRepository.scanKind，同步枚举、stat、读文件并解析 frontmatter，再投影 DTO。失效次数、实际发出的请求次数以及真正完成的扫描次数可能不同。当前 trace 没有任何一个计数。旧版等量 DOM 滚动达标，所以先于虚拟化查这两条路径的占比。 [列表渲染](../../plugins/tasks/src/ui/TaskViews.tsx#L70) · [事件发布](../../apps/engine/src/boot.ts#L596) · [查询失效](../../packages/workbench/src/engine-client/query.ts#L37) · [任务投影](../../plugins/tasks/src/engine/service.ts#L188) · [同步扫描](../../packages/vault/src/semantic/repository.ts#L55)

**退出路径。** 本机 Playwright 1.65 的 Electron custom close handler 调用 app.quit() 并等应用退出事件。Huhu 的 before-quit 拦截第一次退出，每窗发 huhu:flush；renderer 的 connectWindowExit 依次报告 checking、必要时 waiting、flushing，再等 runFlushers。即使只看任务，常驻 FocusPauseOnClose 仍调用 home.focus.get，运行中才更新。main 在 checking 无进展或 flushing 未回执达到 3 s 时，可返回 stay 或进入原生对话框；waiting 正常允许等人。所有窗口同意后才 engine.stop()，发送 shutdown 并设 15 s 兜底，最后再 app.quit()。后台重扫排队拖慢 focus 请求、渲染器迟迟未处理检查、原生提示等待或已取消退出，均有不同观测签名。当前没有回执阶段证据；15 s 兜底单独也不足以说明约 54 s 的等待。 [main 许可与提示](../../apps/desktop/src/main/index.ts#L73) · [before-quit](../../apps/desktop/src/main/index.ts#L601) · [renderer](../../apps/desktop/src/renderer/main.tsx#L330) · [常驻 flusher](../../packages/workbench/src/home/FocusPauseOnClose.tsx#L6) · [Engine stop](../../apps/desktop/src/main/engine-supervisor.ts#L264)

**Lead 最小探针与修复条件。**

1. 同一轮建库前挂上旁路计数，标记写完、首行、控制段、滚动开始与结束。每秒汇总 vault.fileChanged 数量、tasks.list 发起/成功/取消次数、scanKind 次数及累计耗时。CDP 取 renderer 的 RunTask、Recalculate Style/Layout/Paint、JS 栈，配合 Engine CPU 和事件循环延迟。留一段等长空闲 rAF 作对照；正式判定仍用原 91 帧和原阈值。记录首尾任务 ID、实际 scrollTop 和折叠状态，防止滚错容器也通过。
2. 在 app.close **之前**用 app.evaluate 在 main 安装旁路记录，按 requestId 记 before-quit、huhu:exit-progress/flushed、dialog.showMessageBox 的标题与出现时间、shutdown/child exit、will-quit、process exit。记录写入当前诊断目录或转发到驱动 stdout，避免依赖即将关闭的 page；对话框包装仍调用原函数并返回真实 Promise。renderer 同步记参与者/各 flusher 起止，Engine 记收到 home.focus.get 和 shutdown 的时间。参考已有退出用例的 IPC/对话框观测点。若卡在 checking/waiting，找实际参与者/提示；若 flushing 超时并出现保存提示，按 requestId 查 focus 请求发出、受理、完成与回执；若已经许可才查 Engine 停止、第二次 quit 和 Electron 的关闭事件。用操作系统窗口关闭复核真实桌面路径。若只有驱动挂且 main 已正常退出，再诊断 Playwright teardown。 [既有退出测试](../../tests/e2e/knowledge/session-flush.spec.ts#L1175)
3. 单变量对照保留原始“批量写入后立即滚动”，另做同一 1,001 条、相同渲染的“已索引且查询结束后滚动”。若只有前者差且存在重复完成的全扫，先按 vault/查询键合并刷新，并保证末次变化触发最终一致读取、外部创建/改名/删除仍可见。若两者都在静稳期出现布局或绘制热点，再复用 DataTable 的 TanStack virtualizer；任务组标题、折叠、焦点、选中、跨视口滚到首尾单独验收。Huhu 已有实现，另可参考 temp/sources/orca 的 AiVaultSessionVirtualList 分组与动态高度。只在测到的退出阶段修复，不改变保存许可含义。 [DataTable](../../packages/ui/src/components/DataTable.tsx#L37)

## 2. 10 MiB 终端洪流，先修采样供给

当前 trace 在 Enter 后至首次读到 done 约 1.1 s。循环只发出 6 次 search.press，外层耗时依次为 441、138、92、121、70、84 ms；相邻的 7 次 done 查询耗时约 38、53、1、6、9、14、1 ms。6 次动作中只有 5 个 keydown 处在有效窗口；trace 没有记录排除的是哪一键、真实首个数据时刻或 441 ms 的内部分布。仅移除 done 查询也不能保证发出 10 键。5 个样本的最近秩 p95 就是最大值。旧版停在已失效的搜索框定位，无法做延迟 A/B。 [采样代码](../../tests/e2e/perf.spec.ts#L258)

1. 做原驱动与新驱动同负载对照。预先解析并验证真实搜索框，先从终端执行命令，再一次性聚焦搜索框并核对 activeElement；用 page.keyboard.press 交替输入 a/Backspace，移除每键 locator 解析及 evaluate(done)。可用一次性的暴露回调由页面在检测到结束标记时通知驱动停止，循环保留原时间/次数保护。若首焦点即消耗大段窗口，诊断中先聚焦搜索框，让已准备好的生产者通过独立开始信号启动同一满速 10 MiB 输出，记录放行与首帧的差值。各键仍走浏览器真实键盘路径，逐键等待派发，避免在同一帧堆一批键。
2. 页内记录首个真实输出、结束标记、各次可信 keydown 的时间/目标、输入框值变化及两个 rAF，区分入窗前、窗内、窗后样本。保留原 DOM 开始条件、producer 字节计数与尾标、所有窗内在途样本完成、单轮至少 10 键、p95 ≤100 ms；同时观察样本是否覆盖输出前中后段、是否都挤在同一个绘制批次。窗口过短仍报采样不足。不要用人为放慢生产者、多轮不足样本拼接或结束后补键获得通过。
3. 若驱动已足够快而收不到按键，逐段对齐 Engine attach.onData、WebSocket binary、TerminalView 的 term.write 提交/完成、首段与末标可见时刻，以字节数/帧数/持续时间分辨生产快、桥背压或渲染队列占满。已有桥在 ws.bufferedAmount 达 4 MiB 时限制 CREDIT。wc -c 计的是 tee 的管道副本，终端的换行转换也会改变原始字节数；在诊断夹具单独确认 TTY 写成功、负载标记序列完整，再归因产品吞吐。已有复核记录提供了失败对照。 [终端桥](../../plugins/agent-cli/src/engine/terminal-bridge.ts#L86) · [xterm 写入口](../../packages/ui/src/components/TerminalView.tsx#L100) · [TTY 计数复核](t15y-report02.md)

## 3. Inbox 启停，先分开 API 往返与生命周期

测试用 Node 的 Date.now 包住 page.evaluate → renderer fetch → Engine dispatcher → JSON 回来并检查 ok。当前搜索索引探针 evaluate 耗时 595 ms，之后停用/启用的 evaluate 为 62/412 ms；旧版分别约 61、912/212 ms。旧版的 912 ms 明确属于停用。等 indexing=false 只证明索引的该状态；首页卡片请求、事件队列、渲染器空闲程度仍未知。ok 本身也不足以证明启用返回的业务状态为 active。 [用例](../../tests/e2e/perf.spec.ts#L48)

inbox 无硬依赖，当前其他内置 manifest 也没有对 inbox 的硬依赖，apply 创建轻量 service、绑定 8 项能力。停用释放 Cordis scope；内核将变更串行、发布 plugin.stateChanged，写入内置偏好。前台同时对 plugins/capabilities/home/health 查询失效，首页的汇总及 recent notes 可重新枚举笔记、读取最近正文。旧停用慢和新启用慢均与这种竞争相容，但没有采样证明首页查询占了哪一调用的预算。 [inbox 清单](../../plugins/inbox/huhu-plugin.json) · [生命周期](../../packages/kernel/src/plugin-manager.ts#L92) · [串行调用](../../packages/kernel/src/capabilities/system.ts#L174) · [偏好写入](../../packages/kernel/src/exposure.ts#L108) · [首页汇总](../../apps/engine/src/boot.ts#L373)

Lead 用一个 requestId 关联三份局部时长：驱动往返、页内 fetch 到头部/读完 JSON、Engine HTTP 入站到 dispatcher 返回。同时在 Engine 标记串行队列等待、apply/fiber.await 或 dispose、events.publish 同步订阅者、偏好读写；计数同期首页查询和响应尺寸。不同进程以各自单调时钟算时长，避免直接减两个 performance.now。诊断轮另从 Node 直接调用同一 desktop 端点以区分 renderer 调度，正式轮保留原入口、2,000 篇与紧邻的停用/启用；核对转换结果 disabled/active、能力可见性、重启偏好。若内核阶段短而首页请求累计长，先合并同一变化触发的重复读取；若偏好、订阅者或 scope 独占预算，只优化该段。GatewayAudit 对工作台调用不记 ms，不能用其空记录推出生命周期很快。

## 4. 1 MiB 打开，查首开模式和就绪探针

原计时从 pointerdown 到页内 rAF 发现 .cm-content 标题，且 document.body.innerText 满足四位以上行数。当前 treeSettled 的 501 ms 在 t0 前；Wait for function 外层为 618 ms，与 679 ms 端到端重叠。行数依赖 useDeferredValue(text) 的全文统计；整个 body.innerText 还可能要求同步布局。该条件既不核对精确行数，也不验证编辑区当前可写。不能扣掉 501 ms，或只用标题/第一个节点出现替换终点。 [计时](../../tests/e2e/perf.spec.ts#L98) · [文档状态栏](../../plugins/notes/src/ui/NoteDocument.tsx#L66)

代码已在知识库挂载时预载编辑器。DocumentSession.loadFile 并发读 notes.read 与 notes.draft.get，磁盘变更竞态可触发重读。NoteDocument 初始 live，在载入后的 effect 按 256 Ki 字符阈值切 source。RichMarkdownEditor 仅在 acquireProvider 时按当下 mode 决定 lazyRich，随后 hydrate、CM EditorState.create/new EditorView。应验证首次 cold mount 是否短暂走富文本、是否仅 Y.Text 初始化、动态块是否已求值；从源码推不出此次多建了富文本。历史 S3 在源码优先已生效时也记录过 451 ms 及多次 520–630 ms；另有“从源码切实时预览”的 profile，场景不同。 [载入](../../plugins/notes/src/ui/documents/DocumentSession.ts#L244) · [模式选择](../../plugins/notes/src/ui/NoteDocument.tsx#L107) · [provider](../../packages/editor/src/rich/RichMarkdownEditor.tsx#L252) · [上游适配](../../packages/editor/src/vendor/open-knowledge/app/src/editor/SourceEditor.tsx#L215) · [S3 记录](../../.agents/dev/archive/changes/implemented/feature_2026-11-14-knowledge-ok-parity/evidence/s3/verification.md)

Lead 在点击前同时装原探针及局部 MutationObserver 标记。分段记录 pointerdown、click/open、两项 API 各自结束/重读次数、snapshot.loaded、chunk ready、首次 mode、provider.synced 与 richReady、CM 构造起止、正文可编辑且可见、精确状态行。计时结束后另核对 CM doc.length=444016、doc.lines=18897、最后一段内容及一次可保存编辑。若差值集中在探针，单独 A/B 原 body.innerText 与局部 .notes-document-status textContent，保留完整载入与可编辑两个条件。若首次实际建 rich，把首次有效 mode 定在 acquire 之前；若只有 CM 慢，按栈缩小到初始化扩展或重复扫描；若出现重复请求，按 diskRevision/seq 证明合法重读与冗余读取的边界。复用既有 lazyRich、CM 缓存及 perf-note-journey.ts 的局部正文/可写验证。源码首开、切到富文本、草稿恢复与全量保存分别回归。 [旅程探针](../../tests/e2e/perf-note-journey.ts#L55)

## 5. 5,000 段实时预览，修正分段证据并保留端到端门槛

测试观察 ProseMirror 子树首次变更，用 document capture keydown 起表。rg 检查 __huhuPerf 只有用例中的初始化和读取，没有产品写入 cm/onChange/toString 数组。med([]) 回落 0，这三个“0.0 ms”没有样本。第 47 个 Type 在本轮耗时 2,274 ms，旧版也有一次 2,344 ms 的 Type。外层时间包含派发、按下/抬起及等待等，不等于 p95；当前键内最大 27.7 ms 也无法排除键与键之间的停顿。 [输入探针](../../tests/e2e/perf.spec.ts#L128)

Huhu 已有针对普通顶层段落插入的 ProseMirror 快路径、CSS 大文档渲染优化、以及在 renderer 本地运行的 Yjs 桥延期结算。后者在大于 400 块时从首次编辑即可延期，停顿后结算并设 3 s 上界；保存/换模式/卸载需要 settleNow。历史五轮交错优化后 p95 中位 10.6 ms，持续输入仍观察到约 1.8–1.9 s 的键间停顿。它支持优先区分逐键扩展工作与偶发整篇序列化；当前不能把 18.8 ms 或第 47 键直接归给任一方。 [历史同夹具对照](../../.agents/dev/changes/2026-11-18-issue2-closeout/evidence/herdr/w4-pH-report01.md) · [桥调度](../../packages/editor/src/vendor/open-knowledge/server-bridge/server-observers.ts#L1577) · [出口结算](../../packages/editor/src/rich/RichMarkdownEditor.tsx#L214)

Lead 在当前 80 次真实 ASCII 输入上按序号记录驱动下发、页内 keydown/beforeinput/input、正确文本节点变更和下一个 keydown。增加 PM transaction 分段、普通段落守卫命中/回退、Y 事务、runAfterAll/emitNow、React commit 与 Layout 样本。每阶段报 n、p50、p95、max，空数组报“未采到”。独立验证最终文本确实多了 80 个 a，保存、切源码立即取得最后一个字符。若多次慢键伴某个插件回退，全程对照现有 paragraph-fast-path 等价性测试，只改命中的扩展；若慢段发生在两键之间且命中桥结算，单独优化结算并保全 flush/IME/撤销语义。修复约 2 s 间隙与通过 16 ms 的 DOM 指标各自举证。temp/sources/open-knowledge/packages/app/src/editor 的 SourceEditor/TiptapEditor 与 packages/server/src/server-observers.ts 可作上游对照，其桥运行在服务端；Huhu 的补丁与本地 provider 是当前实现基准。

## 复测安排与未运行的验证

Lead 在 t174 结束后复用 run-followup-source.sh 的隔离环境、候选 build-info 校验与 /tmp/huhu-heavy.lock；每次只跑一个场景。以下命令是隔离环境内的 Playwright 调用，使用独立已有产物之外的输出目录。冒号后为当前用例行号。

```sh
HUHU_PERF_STRICT=1 pnpm exec playwright test tests/e2e/perf.spec.ts:183 --workers=1 --retries=0 --output=/tmp/t175-scroll-baseline
```

终端、插件、首开、输入依次换为 245、32、88、150 并为每次运行另取目录。诊断轮可复用 scripts/trace-notes-startup.mjs 的 CDP Profiler 和页内 mark 机制；其 --profile-inbox 量的是点击进入收件箱，需将采集区间放在这里的真实动作周围。正式测量关掉额外 profile，保持原 Playwright trace 配置、工作量、严格门槛和所有业务断言。选择修复后按 A/B 交错各至少五次，报告每轮数据、中位数、范围、每轮样本数以及实际应用/Engine 退出结果。只有一次侧录的数据只用于定位。 [现有 CDP 探针](../../scripts/trace-notes-startup.mjs#L75) · [隔离驱动](run-followup-source.sh)

另有 Notes 组 31 通过、1 失败。session-flush.spec.ts:878 首次 engineReady 等待 20 s 时找不到 engine-state；还没执行 manualSave、打开笔记、挂路由或切 Vault。作为独立启动问题，单项从 launch 即记录窗口 URL、load 失败/renderer gone、renderer console/pageerror 与 supervisor ready/exit，区分启动页、恢复页、工作台未挂载。此项只作 Lead 的后续定位，不据此归因任务滚动或退出。 [受阻用例](../../tests/e2e/knowledge/session-flush.spec.ts#L878) · [独立保全](followup-notes-two-doc-evidence-4a54f0a9/trace.zip)

本轮只读复核两版日志、trace、源码、上游和既有测量，未执行 E2E、实际 CPU profile、压力测试、构建或全仓检查。未改源码，未验证候选修复效果。复核前端指南使用本机缓存的 modern-web-guidance search “measure interaction latency” 与 retrieve “identify-inp-causes,interactions-in-complex-layouts,performance”，用于拆分输入处理、布局与呈现。实际采集先检查当前 Electron 的 process.versions.chrome 与 PerformanceObserver.supportedEntryTypes，缺少 long-animation-frame 条目时可用 Electron contentTracing 对齐时间线。

Lead验收：诊断边界清楚，根因未知项保持待剖析；不把两次样本算优化。接续Lead串行性能采样。
