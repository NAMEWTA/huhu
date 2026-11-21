# 任务报告

- 共享根：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout
- pane_id：w4:pD
- task：task01.md
- 任务文件：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pD/task01.md
- 报告文件：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pD/report01.md
- 执行结果：done

## 结论

**C06 与 H05 同源，修复点有两处。** 编辑器已接受整段输入并更新了 ProseMirror 和 Y.XmlFragment，自适应桥却还没把末批事务转换为 Markdown。笔记退出保存读取了会话中的上一版，评论提交读取了 React 状态中的上一版。在真实 Electron 中减慢渲染进程就能观测到两个旧值。另一次受控实验只在退出或点击前调用现有交付函数，便可在同一轮操作中看到 Markdown 从旧值变成完整输入。对本报告复现的两种症状，因果判断为高确定度。

### C06 · 关闭前的最后输入

1. 主进程的应用退出与窗口关闭都经过 `requestFlush`。它发送 `huhu:flush`，收到回执或到达 3 秒上限才继续。预加载脚本等渲染回调结束后回执，工作台并行等待已注册的 flushers。路径见 `apps/desktop/src/main/index.ts:58、91、382`、`apps/desktop/src/preload/index.ts:46`、`apps/desktop/src/renderer/main.tsx:277`、`packages/workbench/src/state/flushers.ts:9`。
2. `plugins/notes/src/ui/documents/useDocumentSession.ts:50` 为会话注册 `s.flushForExit()`。该函数先调 `drain()`，再按自动保存设置写笔记或草稿。`DocumentSession.ts:188、192、198、251`。失败现场实际注册的编辑器 drainer 数是 0。仓库中 `attachDrainer` 的调用只出现在 `plugins/notes/test/document-session.test.ts:87`；生产代码没有把富文本端口接入这一层。另一路显式保存或由文档宿主发起的 flush 已有正确顺序，见 `plugins/notes/src/ui/NoteDocument.tsx:105、122、151`。
3. 6 倍渲染 CPU 降速的首个笔记样本中，最后一次有效结算耗时 54.9 ms。退出时观察到下列值。主进程在发出请求后 673 ms 收到了回执，应用写入的正是旧版本。这个样本排除了退出超时、中文输入法仍在组合、存储层截断字符串三种解释。

```text
EXIT  PM="重开初始关闭前的最后输入"  XML正文=<paragraph>初始关闭前的最后输入</paragraph>
      timer=true  pending=9  xmlDirty=true  textDirty=false  drainers=0  compositionstart=0
      Y.Text = lastEmitted = session = "# 重开\n\n初始关\n"
SAVED rev=2  body="# 重开\n\n初始关\n"
DISK  "# 重开\n\n初始关\n"
```

磁盘 JSON 转义结果也澄清了“标题尾符号”。标题后的两个换行仍在，原始字符串中没有 `·`。使用 Playwright 1.65.0 对上述字符串直接执行同一个失败的 `toContain` 断言，就会在标题后显示 `·`。现有 `editor-s2b.spec.ts:85` 关闭后直接读文件，尚未真正重启第二个应用实例。

### H05 · 撤销后立即提交评论

1. `packages/editor/src/host/hocuspocus-provider.ts:63` 将 `default` 片段和 `source` 文本交给同一座桥。`packages/editor/src/vendor/open-knowledge/server-bridge/server-observers.ts:1546、1587–1631` 记录上次有工作结算的耗时。超过 12 ms 后，后续事务可合并到 150–1500 ms 的计时器内，连续输入最多推迟 3000 ms。小文档也能触发；大于 400 个顶层块时会直接按慢结算启动。桥写回 Y.Text 后，`packages/editor/src/rich/RichMarkdownEditor.tsx:147–161` 的观察器才排入交付微任务。`emitNow` 本身已同步 `settleNow → 读 Y.Text → onChange`（同文件 100–109 行）。
2. `packages/editor/src/rich/compact.tsx:73`、`plugins/tasks/src/ui/compact.tsx:17` 把变化传给 `CommentComposer.setText`。普通发表与发表并关闭都进入 `plugins/tasks/src/ui/TaskDetail.tsx:237–245、256–263`。提交函数用当前渲染闭包的 `text.trim()` 作为 `tasks.comments.add` 的 body，两个包装组件均未把编辑器端口传到这里。
3. 同一 6 倍降速实验的首个评论样本，上一次有效结算 19.2 ms。点击回调入口同时取样，编辑器已经完成撤销和第二次输入，Markdown、上次交付值和请求体仍一致地停在第一笔。测试等到了第 31 条评论，最后一条只显示「撤」。

```text
SUBMIT  PM="真正的评论"  XML=<paragraph>真正的评论</paragraph>
        Y.Text="撤\n"  lastEmitted="撤\n"  tasks.comments.add.body="撤"
        timer=true  pending=12  xmlDirty=true  textDirty=false  composing=false  compositionstart=0
```

所以只等待 React 更新或调用尚未结算的 `getDraft()` 都无法保证正确。这里 `getDraft` 直接读取 `source`，而 `port.flush` 调用 `emitNow`，见 `RichMarkdownEditor.tsx:295、371–374`。以上样本均未经过真实系统输入法；B07 对组合期间交付的限制应保留。

## 产物与改动

报告为唯一交付物。代码依据为 `/home/wta/projects/huhu-wt-analysis` 的 detached HEAD `9f870c0fad0c1d0538b9783214d2f4a3a3278b10`。自适应调度来自 `cb2b36d`（P-S3-02）。无产品修复提交。退出 IPC、会话、桥、富文本和评论提交的临时埋点均已还原，探针测试及负载进程已清理。还原后重新运行 `pnpm build`，退出码 0；构建产物无探针标记，`git status --porcelain` 为空。

## 验证

Linux、Xvfb、Electron 44.9.1、Playwright 1.65.0。原版 `pnpm build` 通过。基线在 CPU 0–3 上共用两个持续占用 CPU 的 `yes >/dev/null` 进程，各用例重复 6 次，Playwright 单 worker、零重试。主要命令为：

```sh
xvfb-run -a pnpm e2e tests/e2e/knowledge/editor-s2b.spec.ts tests/e2e/knowledge/compact-cost.spec.ts \
  -g 'S2b：重开应用后|S2c：任务评论' --repeat-each=6
```

表内分子为**指定症状出现次数**。探针使用同一组测试步骤与断言。在受控组，仅将目标编辑器首笔有效结算的实耗时拉到至少 160 ms，后续调度、撤销、保存与提交均走原逻辑。提前交付对照组另外在最后一次输入返回后、原关闭或点击动作之前，调用一次当前编辑器的 `emitNow()`。这是根因对照，产品补丁仍待实现与验收。

| 验收或条件 | C06 退出丢字 | H05 提交旧评论 | 证据 |
| --- | ---: | ---: | --- |
| 未加探针的原版，CPU 竞争 | 1/6 | 0/6 | 退出失败回读「初始关」，其余 11 条通过 |
| 只读探针，同样的 CPU 竞争 | 0/6 | 0/4 到达提交 | 评论共启动 6 次，另 2 次在输入前的实例数量断言失败，分别为 28/30、29/30（原用例第 59 行） |
| 只读探针，输入前在 renderer 开启 CDP 6 倍 CPU 降速 | 5/5 | 4/5 | 笔记 5 次均落盘「初始关」且都收到 ack（299–1072 ms）；评论 4 次为「撤」，1 次提交完整 |
| 首笔慢结算，原动作 | 3/3 | 3/3 | 退出 3 次只写「初始关」，评论 3 次提交「撤」 |
| 同一慢结算条件，动作前调用现有交付函数一次 | 0/3 | 0/3 | 两个用例各 3/3 通过；每一次 PRE 都先观测到了旧值 |
| 历史独立记录 | 两轮全量各失败一次，三次定向中失败一次 | 两轮定向各提交一次「撤」，随后三次定向均通过 | `/home/wta/projects/huhu-wt-session/.agents/dev/changes/2026-11-18-issue2-closeout/evidence/session/runs.md:27–45`，未并入本轮分母 |

降速组在 CPU 4–7 上同样运行两个 CPU 负载进程，输入前用 Playwright CDP 会话执行 `Emulation.setCPUThrottlingRate({rate: 6})`；这一组没有人为改变桥的耗时或调度参数。为便于复核，下面保留首轮受控对照的磁盘读数，以及同一个 renderer 调用栈中交付前后的评论读数（摘取字段）：

```text
笔记 PRE  source="# 重开\n\n初始关\n"  xmlDirty=true  pending=10
     POST source="# 重开\n\n初始关闭前的最后输入\n"  xmlDirty=false
     DISK "# 重开\n\n初始关闭前的最后输入\n"
评论 PRE  source="撤\n"  pm="真正的评论"  lastMs=160  xmlDirty=true  pending=11
     POST source="真正的评论\n"  emitted="真正的评论\n"  xmlDirty=false
     SUBMIT body="真正的评论"
```

只看计时器存在与否不足以认定数据丢失。降速组通过的评论样本也有两个已排队的事务，但 `xmlDirty=false`，PM、Y.Text 和请求体已经一致。上述判断均比对了内容。

## 阻碍与接续

分析已完成。C06、H05 的产品验收仍待修复分支验证。建议复用现有端口与会话，各在消费数据的边界补齐一步。

- **笔记退出**。在 `NoteDocument.tsx` 将当前文档的可编辑端口注册到对应会话的 `attachDrainer`，端口替换、路径变化、卸载时解除配对。可沿用公开的异步 `port.flush()`，把 `DocumentSession.ts` 的 drainer 扩为 `() => void | Promise<void>`，让 `flushForExit`、`flush`、`keepDraft`、`dispose` 在读取文本前等待所有交付完成。不要把编辑器注册成与会话并发的第二个全局 flusher。保留现有自动保存写笔记、手动模式写草稿、版本化串行保存的语义。切 Vault 还有独立的 dirty 筛选（`useDocumentSession.ts:51`、`flushers.ts:29–39`），应在用户发起切换时先排空再枚举，以覆盖会话仍显示干净的窗口；这一分支属于代码推断，未计入本次复现。
- **紧凑评论**。在 `packages/editor/src/rich/compact.tsx`、公共声明 `packages/editor/src/rich/rich.d.ts` 和 `plugins/tasks/src/ui/compact.tsx` 透传已有 `onPort`。在 `TaskDetail.tsx` 绑定当前任务端口；两个发表按钮共用同一入口，先 `await port.flush()`，再从该端口取 `port.getDraft().trim()` 并判空，然后发请求。即便 flush 已安排了 `setText`，正在执行的闭包仍持有旧的 `text`。端口未就绪及请求在途时应防重入；空白校验取结算后的值，避免旧的空状态让首次立即点击也被丢弃。
- **F09**。两处改动只在关闭、切换、提交等显式动作执行。保留输入期间的 12 ms 阈值、合并计时器以及大文档源码优先加载；无需在每个按键序列化全文。修复后在无额外负载的同一台机器上运行 `HUHU_PERF_STRICT=1 xvfb-run -a pnpm e2e tests/e2e/perf.spec.ts -g '打开 1 MiB|编辑输入延迟'`，核对 5000 行输入 p95 ≤16 ms、1 MiB 到可编辑 ≤500 ms，再跑 `tests/e2e/knowledge/editor-s3-large.spec.ts` 的即时切源码/文件断言。本报告未对未实现的补丁作性能测量。
- **可稳定判红的笔记回归**。在真实挂载路径控制一次慢结算或挂住已排队的桥计时器，保留完整 PM 输入、旧 Y.Text 这一前置条件，随后直接 `app.close()` 或关闭窗口。自动保存断言完整文件字节且用同一 Vault 新启动实例回读；手动模式断言原文件不变且可恢复带末字的草稿。另覆盖立即切笔记、切 Vault，以及无编辑时字节和 mtime 不变。现有 session 单测手工注册了假的 drainer，还需覆盖生产连接及异步交付完成后才允许保存。
- **可稳定判红的评论回归**。用独立 H05 用例执行输入、撤销、输入新文、立即点击，控制桥保持待办，直接断言调用体和重开任务后的评论正文均等于「真正的评论」。分别走普通发表和发表并关闭，补撤销至空不发送、连续点击只发一次。30 个只读实例的成本用例可单独运行，实例挂载波动不会挡住正文断言。

已查阅 modern-web-guidance 的 `ime-safe-enter-submit` 与 `forms`。本轮只诊断按钮点击与应用退出，没有新增表单或键盘提交行为。

## Lead 验收


（Lead 追加，2026-11-18）**验收：通过**。根因有运行证据支持：退出时 drainers=0、提交时 Y.Text 仍是旧值，提前调用交付函数作对照后 0/3 失败。修复方案采纳，派给 w4:pC/task02.md 实现。
