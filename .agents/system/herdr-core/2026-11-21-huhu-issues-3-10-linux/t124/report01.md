# t124 手动保存与候选包夹具独审

Lead `t3p`，任务 `t124/task01.md`，审查完成。基线为 `4ae7e7e40eb3ffef39f2cf039124f9cf5cb6f030`，目标为 `agent-linux` 的当前工作树，包含四个候选包夹具与 spec。审查依据为任务文件、t11n/t11g 报告、当前代码和已有日志。

## 规格发现

### P1 · 档案路径变更仍会在正文有未保存修改时执行

任务提到 Lead 已补档案调用点，复核时 `ArchivesViews.tsx` 仍与基线一致。`ArchiveView.call` 用默认 `session.flush()` 保护移动、重命名和删除。关闭自动保存时，如果首笔保存回执返回前编辑器交付了新文本，`flush()` 返回成功时会话仍为 dirty，随即提交档案变更。异步确认期间关闭对话框即可重新编辑，界面没有取消已发起的档案操作。最后的编辑可能只留在旧路径会话或草稿，移动后的文件和被删除文件的回收版本缺少这些编辑。应让该包装器等待 `untilClean: true`，档案的显式保存按钮继续保存本轮正文。

[档案包装器](../../plugins/notes/src/ui/archives/ArchivesViews.tsx#L327) · [确认与改名](../../plugins/notes/src/ui/archives/ArchivesViews.tsx#L513) · [删除](../../plugins/notes/src/ui/archives/ArchivesViews.tsx#L561) · [对话框取消](../../packages/ui/src/components/Dialog.tsx#L43) · [手动回执和排空](../../plugins/notes/src/ui/documents/DocumentSession.ts#L359)

### P2 · 批注的两条落盘路径仍使用手动保存语义

复核时 `useCommentsBridge.ts` 和 `NoteDocument.tsx` 也仍与基线一致。按路径走会话默认 `flush()`，无选区版本的入口经编辑面或详情栏回调走同一个默认 `flush()`。带选区版本的创建和重定位有前后 revision 校验，新输入会触发重新选择提示。无选区版本的创建或重定位在首个回执成功后可继续，对应正文仍有未落盘修改。正文前置保存应有独立回调，两条批注路径都等到 `untilClean: true`。菜单、Mod+S 和按钮保留显式保存的默认语义。

[批注桥](../../plugins/notes/src/ui/comments/useCommentsBridge.ts#L24) · [共用回调](../../plugins/notes/src/ui/NoteDocument.tsx#L128) · [详情栏转发](../../plugins/notes/src/ui/NotesModule.tsx#L187) · [选区校验和无选区路径](../../packages/editor/src/host/routes/comments.ts#L127) · [重定位](../../packages/editor/src/host/routes/comments.ts#L175)

### P2 · 有旧回执在途时，后一次手动保存仍可能写入点击后的输入

t11n/task02 的契约以触发保存时的文本为准。当前保存 A 尚在途，用户输入 B 并再次保存，然后在 A 回执前输入 C，第二次 `flush()` 会在旧回执后重新结算并取样，实际发送 A+B+C。新编辑使按钮状态重新变为 dirty，因此按钮可以进入该路径，Mod+S 和菜单也共用这条路径。已有 37 项绿灯覆盖首笔回执在途时输入、回执完成后再保存，以及退出留草稿。并发两次明确保存仍需证明每次只提交其触发时已经交付的文本，并继续按旧回执推进预期版本。

[回执前重新排空与取样](../../plugins/notes/src/ui/documents/DocumentSession.ts#L233) · [等待并继续循环](../../plugins/notes/src/ui/documents/DocumentSession.ts#L360) · [按钮状态](../../plugins/notes/src/ui/NoteDocument.tsx#L358) · [已有回归时序](../../plugins/notes/test/document-session.test.ts#L109)

### P2 · G7.2 的尺寸断言可能漏掉观察期间发生的变更

探针在真实邀请会话内打开同一 Agent 会话的 socket，等到服务端降级通知和非空二进制数据才提交负向帧。当前顺序是等探针断开，再用桌面控制者键入 `stty` 读取尺寸。Core 在 detach 时会重算大小，控制者输入会重新取得尺寸主导权。若观察阶段发生过短暂误改，这两个动作都可能在读值前把尺寸恢复到基线。断言还使用文本前缀匹配，适合改为读取完整行列值。应在探针连接仍保持、控制端尚未发送新输入时观察尺寸，或用 Core 的尺寸事件覆盖整个窗口。桌面可执行命令、观察连接可接收输出、Web 接管及刷新后 PID 不变的正控都在。

已有双层防护。Engine 终端桥按观察态过滤输入和 resize，Core 也忽略观察连接对 PTY 的输入和尺寸影响。同包断言能观察最终 PTY 副作用。桥本身是否转发仍由现有桥接单测直接断言。探针的 10 秒计时器覆盖连接、收帧和关闭等待；成功分支只看 `sent`，应核对干净关闭及预期关闭码，当前附件也只记录关闭前的本地布尔量。

[同包探针和尺寸顺序](../../tests/e2e/workflows/web-terminal-widgets.spec.ts#L111) · [Web 会话和来源核验](../../packages/kernel/src/server/web-share.ts#L62) · [桥接过滤和 detach](../../plugins/agent-cli/src/engine/terminal-bridge.ts#L43) · [桥接单测](../../plugins/agent-cli/test/terminal-bridge.test.ts#L32) · [本机 Herdr Core 0.1.19 源码](/home/wta/projects/huhu/temp/sources/herdr-core/crates/herdr-core/src/viewers.rs#L242) · [候选依赖锁](../../scripts/herdr.lock.json#L6)

## 规范与夹具回查

- **P2 · Web 候选夹具的清理仍受用例主体期限限制。** Web 模式在用例函数中串行等待移除路由、关闭独立 Chromium 和回收候选桌面。主体超时时没有独立 Playwright fixture teardown 接管，前一步阻塞也会拖住后续桌面回收。桌面 profile 特意建在包装器清理目录之外。Git 已有专门 teardown 预算，可沿用该边界给 Web 三条用例处理超时和关闭失败。浏览器探针自身有 10 秒上限，刚性上限在外层清理仍有价值。[Web 清理](../../tests/e2e/workflows/web-terminal-widgets.spec.ts#L15) · [候选 profile](../../tests/e2e/helpers/candidate-desktop.ts#L87) · [Git teardown](../../tests/e2e/workflows/git-credentials-package.spec.ts#L21)
- **P3 · 旧 Mod+S 用例仍缺焦点和回执边界。** `shell.spec.ts` 在磁盘轮询命中后立刻往当前焦点键入，保存按钮点击已改变焦点，磁盘回读也可能早于 UI 处理回执。第一段后等 `save-state` 到「已保存」，重新点正文并移到文末。Mod+S 后也等状态确认，再录入离场草稿。新的 C06 用例已经点正文并单独控制真实回执。[旧用例](../../tests/e2e/shell.spec.ts#L1695) · [新 C06 回执控制](../../tests/e2e/knowledge/session-flush.spec.ts#L59)
- `candidate-desktop.ts` 的环境字符串索引已显式声明。仅 Git 和 Web Terminal/Widgets 选择在启动前停用目录中的 CLI，设置格式沿用产品 schema，检测返回 `installed: false`、`skipped: true`。检测在定位、运行版本命令和 Pi 帮助探测前跳过停用项。系统 Git、普通 shell 和其他夹具的启动参数保持各自入口。[候选桌面](../../tests/e2e/helpers/candidate-desktop.ts#L259) · [探测器](../../plugins/agent-cli/src/engine/detect.ts#L151)
- `git-credentials-package.spec.ts` 的独立收尾预算与各请求期限已接上。记录脱敏附件或清除凭据失败后仍尝试回收两台服务及桌面。`git-auth-fixture.ts` 先关监听和连接，再逐组发送终止请求，最后限时收集退出结果。一个 CGI 终止失败仍会继续尝试其余组。清理失败会带阶段附件，主体失败时保留首错。静态路径未复见 t115 报告的索引类型和 Git 清理无界等待问题。[Git 资源所有权](../../tests/e2e/workflows/git-credentials-package.spec.ts#L21) · [HTTPS 和 CGI 回收](../../tests/e2e/helpers/git-auth-fixture.ts#L99) · [清理错误收集](../../tests/e2e/helpers/candidate-desktop.ts#L29)
- W05/W06 先证明真实能力目录包含目标项，再过滤浏览器发现响应。读场景有邻卡真实写入和桌面回读正控。写场景有禁用按钮、无写请求和相同的任务状态与版本，证据覆盖目录驱动的界面退化。[目录和业务断言](../../tests/e2e/workflows/web-terminal-widgets.spec.ts#L182)

## 保存调用方与已有验证

- 普通笔记生命周期的停放、释放和关窗都走 `flushForExit()`。窗口关闭时渲染器先阻止交互，再结算编辑器。手动保存回执推进版本后，新编辑按该版本写草稿，自动模式仍排空，落盘失败后可走草稿路径。富文本卸载先结算编辑再释放会话。路径菜单和目录操作走 `flushPaths`，Vault 切换确认保存走 `registerDirtyDoc`，均请求排空。笔记模式切换和 HTML 回预览也请求排空，过期模式请求凭序号丢弃。普通文本和 JSON 的显式保存直接走串行 `save()`，不受 `flush()` 默认参数差异影响。[退出与草稿](../../plugins/notes/src/ui/documents/DocumentSession.ts#L377) · [关窗](../../apps/desktop/src/renderer/main.tsx#L359) · [路径](../../plugins/notes/src/ui/documents/DocumentSessionRegistry.ts#L105) · [Vault 切换](../../plugins/notes/src/ui/documents/useDocumentSession.ts#L55) · [模式](../../plugins/notes/src/ui/documents/useFlushedMode.ts#L15) · [纯文本](../../plugins/notes/src/ui/viewers/TextFileView.tsx#L73)
- t11s 红灯日志为 35 通过、1 失败，回执回归实际写入 `A+B`，期望 `A`。t122 绿灯日志为 37/37，包含一次显式保存和退出草稿的回归。日志范围为 `document-session.test.ts`。[红灯](/home/wta/projects/huhu/temp/issue-evidence/huhu-2026-11-22/manual-save-red.log#L44) · [绿灯](/home/wta/projects/huhu/temp/issue-evidence/huhu-2026-11-22/manual-save-check.log#L5)

## 未运行的验证

本轮为静态审查。C06 真实回执、菜单与 Mod+S、Git P10.2、G7.2 和 W05/W06 的 Electron/Chromium E2E，单测、类型检查、lint、构建、打包及安装均未运行。本轮交付为此报告。
