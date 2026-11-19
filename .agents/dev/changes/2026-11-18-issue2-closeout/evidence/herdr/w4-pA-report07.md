# 任务报告

- 共享根：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout
- pane_id：w4:pA
- task：task07.md
- 任务文件：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pA/task07.md
- 报告文件：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pA/report07.md
- 执行结果：done

## 结论

Embed 的属性输入框、Callout 属性和表情结果已按当前中文可达名称定位。Embed 点击占位后自动聚焦到「来源」输入框的原断言通过。代码块的「隐藏 HTML 预览」名称原本就能定位，实测缺陷是鼠标进入沙箱预览后工具栏仍不可点击。修复后保存重开、鼠标切回源码及原有键盘场景均通过。

四个目标各独立三次通过。知识库全量显式启用两次自动重试后退出 0，95 项首次通过、2 项重试通过、1 项按配置跳过。前两轮默认零重试未能全绿，四个指定用例均通过。

## 产物与改动

- 工作树 `/home/wta/projects/huhu-wt-parity`，分支 `closeout/issue2-parity`，最终提交 `f9238bb1620b9cd16cf72812b913c24ae93faead`。工作树干净。合入候选 `33e2113` 的提交为 `6ecc0d9`。
- `e99571c46e25b1f60683a20481531a2dd1d75381` 提交了产品修复和两份用例。沙箱预览内页转发真实鼠标进入、离开的布尔状态。代码块仅接受当前预览 iframe 的状态，继续使用原有悬停样式和键盘焦点。沙箱和 CSP 原样保留。已登记 `PATCHES.md` 并刷新重放清单。
- 更新 `editor-parity-closeout-remaining.spec.ts` 和 `editor-s3-matrix.spec.ts`。表情的搜索仍输入英文别名，点击「拉炮彩带」并断言实际插入 🎉。跟进提交 `88bbc30` 收紧同文件另一条斜杠测试的落盘检查，等两次 `/表格` 输入都保存后再比较重开前后的字节。
- 原始日志和 trace 在 `/tmp/huhu-parity07-tPFY8N/`。逐项基线和运行结果已写入 `.agents/dev/changes/2026-11-18-issue2-closeout/evidence/parity/runs.md`。

## 验证

| 验收要求 | 实际检查与结果 | 证据位置 |
| --- | --- | --- |
| Embed | 独立 3 通过。点击占位自动聚焦「来源」，编辑、保存、重开、URL 显示和无外部请求均通过。 | `repeat-embed.log` |
| 代码块预览 | 基线指针三次命中前段，等 iframe 内容显示后仍可复现。修复后独立 3 通过，保留鼠标切回源码、键盘设置和对话框、保存重开以及源码断言。独立 Chromium 浏览器也可鼠标切回源码。 | `pointer.log`、`pointer-loaded.log`、`repeat-codeblock.log`、`browser.log` |
| Callout | 独立 3 通过。「提示框属性」及中文字段可操作，警告类型、折叠状态、保存重开与展开均通过。 | `repeat-callout.log` |
| 表情 | 完整 36 项斜杠矩阵独立三次均通过。三份结果各含 36 个命令及真实表情插入，页面异常为空。 | `repeat-emoji.log`、`delivery-emoji/**/slash-matrix.json` |
| 构建、静态和 vendor | `pnpm lint`、`pnpm format:check`、`pnpm build`、编辑器类型检查均退出 0。预览 DOM 和 CSP 专项 20 项通过。差异登记 267 条，无缺项或多余。1,346 个 vendor 文件从固定上游重放，集合及字节零差异。 | `lint-final.log`、`format-check-final.log`、`build-delivery.log`、`typecheck-editor.log`、`vendor-preview.log`、`patches.log`、`replay.log` |
| 知识库默认全量 | 第一轮 94 通过、3 失败、1 跳过。失败为评论正文挂载、斜杠夹具落盘、鼠标选区。修订落盘夹具后，三项各复跑三次均通过。第二轮 96 通过、1 失败、1 跳过。脚注用例选区为空，单项复跑三次通过。 | `knowledge-full.log`、`fixture-reruns.log`、`b06-reruns.log`、`knowledge-rerun.log`、`footnote-reruns.log` |
| 知识库完整复验 | 单 worker、`--retries=2`。95 首次通过、2 个 flaky 重试通过、1 跳过，退出 0。脚注按钮未出现后第二次重试通过，块类型「文本」按钮未出现后第一次重试通过。四个目标均首次通过。 | `knowledge-complete.log` |

## 阻碍与接续

任务范围内无阻碍。默认零重试全量仍有偶发失败，最终全量通过使用了显式重试。脚注和块类型气泡的跟进证据保存在全量 trace 中。

## Lead 验收

（Lead 追加，2026-11-19）**验收：通过**。零重试下的偶发失败，由 Lead 在空闲机器上的最终全量运行中判断。
