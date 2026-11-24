# 紧凑编辑器 E2E 只读诊断

- 执行结果 — done，worker t10c，Lead t3p，本机 wta-ubuntu，任务 task01.md。
- 任务文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t10c/task01.md
- 报告文件 — /home/wta/projects/huhu/temp/issue-worktrees/integration/temp/final-audit/t10c-report01.md（Lead 授权的工作区路径，供 Lead 复制归档）。
- 证据版本 — integration HEAD `4ae7e7e40eb3ffef39f2cf039124f9cf5cb6f030`。运行记录为 `/home/wta/projects/huhu/temp/issue-evidence/huhu-2026-11-22/e2e-4ae7e7e40eb3ffef39f2cf039124f9cf5cb6f030/run.log`。下文源码与 `test-results/` 均相对于 integration。

| 失败 | 判断 | 优先动作 |
| --- | --- | --- |
| G07 收件正文双链 | 产品导航回归，高置信。目标文件存在，点击后返回首页 | 修正同窗口双链的片段导航，保留真实点击和笔记正文断言 |
| H05 两种发表、撤销至空 | 三条用例的旧缓冲前提过时，高置信。提交处理均未执行 | 用普通编辑制造真实待结算状态，并保留撤销、请求次数、正文和重开验收 |
| OP-D18 紧凑选区 | 空选区已证实。触发环节尚不能定案 | 精确命中可编辑文字，保留真实按键，分步记录 DOM 与编辑器选区 |

## G07 · 点击收件正文的「下一页」

**证据。** `compact-inbox.spec.ts:40–92` 的六种选区、两种剪贴板 MIME、富节点、快速切换和文件字节检查均已越过。原始 `test.trace` 记录第 91 行的真实点击完成；第 92 行找不到编辑器。对应 `test-results/knowledge-compact-inbox-G0-*/error-context.md` 的页面只有工作台标签，“最近笔记”中仍有「下一页」及目标正文。普通阅读或复制链路没有在这次失败。

**原因。** `interaction-layer.tsx:350–375` 将点击交给注册的 wikiLink；`packages/editor/src/vendor/open-knowledge/app/src/editor/extensions/wiki-link.ts:245–274` 对已解析文档执行 `location.assign('#/…')`。桌面默认入口为 `huhu-app://workbench/index.html`（`apps/desktop/src/main/index.ts:143–145`），源码和实际产物 `apps/desktop/out/renderer/index.html:10` 都含 `<base href="/">`（提交 `d039bc48`）。这个相对 URL 指向根路径的片段，pathname 从 `/index.html` 变为 `/`。主协议把根路径重新送到 index.html（同一 main 文件 302–306），桌面新挂载的 UI 以 home 为唯一标签（`apps/desktop/src/renderer/main.tsx:126–131`）。这解释了完整首页快照。原始 trace 没有记录导航 URL 或 document 生命周期，完整重载属于高置信推断。

**应走的路径与最小改动。** 在同窗口、已解析文档的 wikiLink 主动作中，使用该文件资产分支已有的 `window.location.hash = …` 写入原有编码器生成的片段。保留文件路径、query 以及现有分流。这样原页面的 `OkRoot.tsx:92–106` 能收到 hashchange → `rich/compact.tsx:45–52` 转为 `下一页.md` → `InboxModule.tsx:232–237,389–397` 调用 `requestOpenPath` 并切到 notes → `NotesModule.tsx:405–419` 消费路径。记录 vendor 补丁来源。复跑时在测试进程记录主框架导航前后的 URL、`performance.timeOrigin` 或测试页面实例标记，并核对激活的笔记标签和正文；同文档导航应保留原页面实例。若页面实例保留但笔记仍未打开，再观察哪一个已挂载的 OkRoot 消费了 hash。全局 base 还用于浏览器深链的资源加载，无需改动。

## H05 · 普通发表、发表并关闭、撤销至空

**证据。** `compact-submit.spec.ts:38` 两次实收“撤销后立即发表的正文”及末尾换行，`:78` 实收空串。三个 `test-results/knowledge-compact-submit-*/trace.zip` 都在首次提交点击之前进入清理。本轮无法据此判断重复请求、内容落盘及关闭状态。相同 helper 的档案失焦用例 `:87` 在本轮第 35 项通过，其中第 105 行实际要求 source 不含末字；同轮四条收件或任务编辑的撤销、IME 与保存用例也通过。

**机制。** `session-slow-bridge.ts:9–38` 只在指定 Y.Doc 的 afterAllTransactions 派发中改变耗时采样和 100–1500 ms 计时器。桥先同步结算，超过 12 ms 后可推迟后续事务；显式 settleNow 可排空队列（`packages/editor/src/vendor/open-knowledge/server-bridge/server-observers.ts:1580–1617`）。`TiptapEditor.tsx:248` 使用 `document-history.ts:12–35` 的共享 Y.UndoManager；它同时追踪 source 和富文本片段，并把桥投影并入用户编辑的撤销条目。用例先确认「旧正文」已真实进入 source，再撤销该编辑，因而 source 可以直接回到空。拦截桥计时器无法冻结撤销事务自身对 source 的修改。两条新文本用例最后已经收敛的确切时刻缺少事务级 trace；不能据此认定计时器整体失效。`RichMarkdownEditor.tsx:213–225,267–279,536–539` 的显式 flush 与 Y.Text 变化后的微任务也能驱动交付。生产提交在 `plugins/tasks/src/ui/TaskDetail.tsx:249–274` 先同步占用提交标志，再 flush、读 draft、判空和调用引擎。旧基线曾实际双发旧正文或空提交，见 `.agents/dev/archive/changes/implemented/bug-fix_2026-11-18-issue2-closeout/verification/session/c06-h05-fix.md`。

**最小改动。** 首选只调整此 spec 的前置操作。两个发表入口可在真实撤销后重新建立慢桥起点：在干净的编辑器中完成一次撤销并验空，再安装 helper，输入基准正文并见证 source 已结算，紧接着追加末字。提交前要求 DOM 等于完整正文、source 仍等于基准正文（容许规范末尾换行）；沿用同一轮两次按钮点击、单次带正确 taskId 的请求、唯一人类评论、重开及完成状态。为避免丢掉第三条的两层语义，保留真实 Ctrl+Z 至空后点发表零请求，再独立以慢桥下真实选中并删除基准正文构造 DOM 空而 source 非空，见证分歧后点发表零请求并核对评论列表。两段用独立草稿或干净实例。若要求在同一手势中覆盖两种状态，可在 source 已有基准文时暂缓后续结算，真实删除到空，再把临时输入分到独立撤销组，仅撤销临时输入；必须先证实此时 DOM 空且 source 仍旧才计入该覆盖。具体准备序列待 Lead 复跑。无需强写 Y.Text、倒退共享撤销实现或调长全局延迟。

## OP-D18 · 任务描述键盘选区

**证据。** `editor-compact-commands.spec.ts:18–32` 已看到允许的标题命令、被隐藏的文档级命令、@ 候选和 Enter 插入的 Research/ 双链。点击 `body.getByText(/参考/)` 后发 Home、两次 Shift+Right，最终 `getSelection().toString()` 为空。后面的批注快捷键、焦点和保存后引用尚未执行。此用例的 zip 只有 test.trace、源码和错误附件，没有浏览器帧快照、截图、点击坐标或按键后选区。仅凭空串无法确定是点中芯片、焦点离开、模型复位，还是光标停在段尾。

**复跑与最小分流。** `rich/at-reference.ts` 的候选命令插入原子 wikiLink，外层段落同时含「参考 」和一个 `contenteditable=false`、可聚焦的交互节点（`extensions/wiki-link.ts:64–78`）。按段落文本匹配的默认中心点击没有定义命中的是哪一个字符。先复跑原步骤，记录真实 pointer target、activeElement、浏览器 anchor/focus 节点和偏移、PM selection.from/to。随后只改变点击落点：借用 `editor-selection-focus.spec.ts:43–72` 的 Range 几何与选区探针，在「参」字矩形内发真实鼠标点击。Range 仅测坐标。确认焦点在 .ProseMirror，Home 到首字、两次 Shift+Right 依次选中「参」「参考」，同时记录模型选区。保留原快捷键、无批注浮层及持久化引用断言。精确点击成功且原点击未命中文字时只改该用例；若真实文字命中且仍丢选区，以第一个偏离的按键为回归入口，复查 `RichMarkdownEditor.tsx:364–402` 的 DOMObserver 同步及引用节点附近的选择处理。现有证据不足以修改产品键盘处理。第 74 项 B06 的 Home/Shift+End 已通过，支持继续聚焦紧凑实例。

## Lead 串行复跑与验证边界

1. 在包含导航修改的桌面产物上跑 `tests/e2e/knowledge/compact-inbox.spec.ts:40` 的 G07，随后跑 `tests/e2e/knowledge/journey.spec.ts:258` 的 A02/A03/OP-D11，分别核对只读紧凑正文鼠标激活与笔记编辑器 Enter 打开双链。
2. 跑整个 `tests/e2e/knowledge/compact-submit.spec.ts`，覆盖两个发表入口、撤销空提交、新增的待结算空提交检查和档案真实失焦对照。定向复跑时记录提交前两份正文、请求队列和重开结果。
3. 跑 `tests/e2e/knowledge/editor-compact-commands.spec.ts:6` 的 OP-D18，保存上述按键序列的采样。如果产品选区逻辑有改动，补跑 `tests/e2e/knowledge/editor-selection-focus.spec.ts:205` 的 B06 聚焦后 Home/Shift+End 回归。
4. 本次日志快照截至第 82 项，已完成项仅第 27、32、33、34、36 项失败；正在运行的全量结果以 t109 最终日志为准。运行数据标明 Electron 44.9.1、Chromium 152.0.7977.167。门户服务启动有显示警告，附近真实剪贴板、输入法、笔记及档案用例均能执行，目前没有证据把这五项归因于 Xvfb 或机器负载。

**未运行的验证。** 本 worker 仅读取源码、已有测试快照、原始 trace、构建产物与运行日志。未启动应用，未运行单测、E2E、全仓类型检查或打包，未修改代码、测试或配置。所有修复建议及其运行结果待 Lead 验证。

### Modern Web Guidance

我用本机缓存的 modern-web-guidance 搜索键盘焦点导航并取回 accessibility。该指南的 “Don't implement focus traps for native modal dialogs” 与当前原生 dialog 一致，焦点诊断保留实际鼠标与键盘输入。

## Lead收取
报告已收取；高置信导航回归与夹具前提差距进入隔离修复，选区问题待真实定向诊断。未据此签收修复。worker的hc回告因工作区权限取消，由Lead主动读取。
