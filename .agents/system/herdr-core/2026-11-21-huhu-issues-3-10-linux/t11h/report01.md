# 手动保存后继续输入导致提前写盘

候选提交 `4ae7e7e40eb3ffef39f2cf039124f9cf5cb6f030`，任务 `t3p / t11h / task01.md`。实际失败用例在 `tests/e2e/shell.spec.ts:1636`，断言在第 1674 行。trace 内的测试源码与该提交的整份文件逐字节一致。

**判断**：第一次点“保存”触发的 `DocumentSession.flush()` 可以把点击之后的新输入一并写入文件，即使自动保存一直关闭。这是生产代码中可以定位的竞态，也是本次提前写盘最有依据的解释。现有 trace 能确认按键与磁盘内容的顺序，但缺少渲染进程收到首个保存回执的时间，以及第二次写入的调用来源，因此尚不能唯一归因。

## 失败记录

| trace 步骤 | 实际观察 |
| --- | --- |
| `@237`、`@241–242` | 设置开关已关闭，磁盘 `.huhu/settings.json` 的 `editor.autosave` 为 `false`。字号与宽度也已持久化。 |
| `@253–255` | 输入“手动保存的正文”，等 2.5 秒后读取笔记文件，正文仍未写入。 |
| `@256–259` | 点“保存”。第一次磁盘轮询即读到正文，内层断言结束于 2700579.153 ms，开始输入“，快捷键保存”于 2700579.634 ms，两者相隔 0.481 ms。 |
| `@260–263` | 输入返回后再等 1.5 秒，读得完整的“手动保存的正文，快捷键保存”。负断言失败；第 1675 行的 Ctrl+S 从未执行，关闭窗口发生在失败之后。 |

现场索引为 `/home/wta/projects/huhu/temp/issue-evidence/huhu-2026-11-22/` 下的 `full-e2e-failures.json` 第 135–138 行、`full-e2e-triage.md` 第 440–458 行和 `e2e-4ae7e7e40eb3ffef39f2cf039124f9cf5cb6f030/result.json`。该用例运行 9851 ms，配置为 1 个 worker，本次 retry 为 0。原始附件在 integration 工作树的 [trace.zip](<../../../integration/test-results/shell-设置：编辑器页的开关真正生效（关闭自动保-80a41-”时写入；行号、字号、宽度）；外观的导航宽度与紧凑布局/trace.zip>)。压缩包内只有测试步骤、测试源码和错误附件，没有网络请求、保存回执或组件活动日志。

## 从按钮到文件

1. **设置已经到达文档。** `packages/workbench/src/settings/SettingsModule.tsx:126` 的开关经第 73、44–47 行写入设置并更新当前 Vault 的查询缓存。`plugins/notes/src/ui/NoteDocument.tsx:54–58` 读取同一设置，第 363–365 行只在手动模式且可写时显示本次点击的按钮。`plugins/notes/src/ui/documents/useDocumentSession.ts:49` 优先读缓存，再回退到视图最近的设置。`DocumentSession.ts:201–215` 仅在自动保存开启时安排 800 ms 定时器。第一次输入的磁盘结果与手动模式一致。
2. **文件先可见，回执稍后才可能到达。** `NoteDocument.tsx:128,143,364` 将按钮绑定到 `void session.flush()`；点击返回时，测试没有等待这个 Promise。`plugins/notes/src/engine/service.ts:585–587` 先写文件，再刷新索引。`plugins/notes/src/engine/index.ts:550–554` 随后等待批注重定位、发出变更通知，才返回版本。第 1670 行读到第一段时，渲染进程仍可能在等待回执。
3. **同一次点击可以产生两次写入。** `plugins/notes/src/ui/documents/DocumentSession.ts:233–255` 按当时的文本和 revision 写出第一段 A。如果这期间输入 B，旧回执正确地把会话留在 dirty。但外层 `flush()` 在第 360–373 行循环，再次排空编辑器，看到 A+B 与刚保存的 A 不同，就用更新后的版本再调一次 `save()`。这一路径不读取自动保存开关。`git blame` 将该循环定位到 `a7365df3`。按钮和 Ctrl+S 都用这个入口，现场只执行了按钮。
4. **富文本输入能进入这个窗口。** `packages/editor/src/rich/RichMarkdownEditor.tsx:267–279` 以微任务交付已提交的编辑事务；第 213–225、537–539 行的编辑器端口也可立即结算并交付文本。`NoteDocument.tsx:133–139,189–197` 将端口挂到会话，输入直接更新 `session.setText`。其中的 300 ms 延迟用于大纲等父视图更新。编辑器端口交付文本后，由会话决定是否写文件。

## 测试顺序与其他候选原因

测试在第一段落盘后立即用 `page.keyboard.type` 输入第二段，既没有等待界面显示“已保存”，也没有重新确认编辑器焦点。因此它同时覆盖了“在途保存时继续输入”和“保存完成后再用快捷键”两种顺序。本次文件已经包含完整后缀，单纯丢失键盘焦点不能解释该结果。失败可定位到用户也能执行的点击后继续编辑。延长固定等待只会改变遇到竞态的概率。

`packages/workbench/src/shell/AppShell.tsx:323–327` 以模块选择决定知识库的 active。`plugins/notes/src/ui/NotesModule.tsx:82–110` 隐藏时调用 `flushForExit()`，返回时按条件恢复草稿；释放视图也走 `DocumentSessionRegistry.ts:30–40` 的结算路径。`DocumentSession.ts:332–337,377–384,518–522` 在手动模式把未保存文本写到草稿。第 418–432 行的脏文档轮询仅读磁盘。失败窗口内没有导航、改名、切模式或退出步骤。一次设置缓存短暂变为 true 的可能性缺少运行时观测；全量运行使用 Xvfb 和每例新建的临时 Vault，调度延迟可能扩大竞态窗口，现场没有证据把环境列为独立根因。

## 最小验证建议

1. **先验证会话语义。** 复用 `plugins/notes/test/document-session.test.ts:6–38` 的内存引擎及保存闸门，关闭自动保存，输入 A，像按钮一样调用一次 `flush()`。等首个 `notes.save(A)` 已发出，输入 A+B，再放行首个回执。记录写入文本序列、最终磁盘和 dirty 状态。当前循环预测同一次点击写出 A、A+B；手动保存的预期是只有 A，A+B 保持 dirty，下一次明确保存才写入。已有第 186–204 行的 C06 用例调用的是单次 `save()` 且开启自动保存，覆盖不到按钮的外层循环。
2. **要对应到真实入口，只需一个受控用例。** 复用 `tests/e2e/knowledge/session-flush.spec.ts:217,408` 的按能力过滤和暂扣响应方式，在隔离 Vault 中只拦当前文档的首个 `notes.save`。先让请求实际写盘，再暂缓向页面交回响应；确认磁盘为 A 后，聚焦编辑器并输入 B，确认编辑区出现 A+B，再放回执。在全程手动模式、同一活动文档、一次点击且无 Ctrl+S 的条件下计数保存请求，对照其文本、版本与磁盘。对照组只改变输入时点，等首个回执且 `save-state` 显示“已保存”后再输入 B。若后者仍提前写盘，再记录 `armAutosave()` 读取的设置值、`flush()` 调用来源和 active 变化。原有快捷键用例可用后一顺序检验 Ctrl+S；单独保留前一顺序检验生产竞态。

## 未运行的验证

本次仅核对候选源码、已有 trace 和报告。单元测试、E2E、GUI、真实 Vault、构建、打包及类型检查均未运行。上述两项验证是建议，运行结果待取得。
