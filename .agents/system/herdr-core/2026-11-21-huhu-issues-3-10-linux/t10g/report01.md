# 紧凑编辑器候选修复

- 执行结果 `done`，候选已写入，运行结果待 Lead 验收。
- Lead `t3p`，worker `t10g`，机器 `wta-ubuntu`。
- 工作树 `/home/wta/projects/huhu/temp/issue-worktrees/agent-linux`，基线 `4ae7e7e4`。
- 任务文件 `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t10g/task01.md`。
- 依据为同主题 `t10c/report01.md` 和 integration `test-results/` 中 G07、H05 三例及 OP-D18 的原始 `trace.zip`。G07 在真实点击后找不到目标编辑器。H05 两个发表用例在点击前已读到新文本，撤销用例在点击前读到空 source。OP-D18 只留下最终 DOM 空选区，原点击落点、焦点与模型选区仍未知。

## 候选改动

- G07 的同窗口已解析 wikiLink 文档分支沿用同文件资产分支的 `window.location.hash`，继续用 `toInternalHashHref` 编码文档和锚点。回归用例保留原节点、两种剪贴板 MIME、文件字节和目标正文断言。测试先在当前 URL 设置非空 query 探针，再真实点击 wikiLink。`HashChangeEvent.newURL` 记录宿主消费前的片段和原路径与查询串，随后断言目标文档标签激活、`performance.timeOrigin` 相同、消费后的 URL 恢复为点击前的 URL。 [产品改动](../../packages/editor/src/vendor/open-knowledge/app/src/editor/extensions/wiki-link.ts) [G07 用例](../../tests/e2e/knowledge/compact-inbox.spec.ts)
- H05 两个发表入口各用干净草稿，复用 `holdBridgeTimers` 见证首段进入 source，再真实追加末字。提交前 DOM 必须是完整正文，source 必须等于首段，仅容许一个规范尾换行。连续两次点击沿用同一浏览器任务，继续断言精确的 `taskId` 和正文只发送一次、重开后仅有一条人类评论，以及发表并关闭进入 `completed`。撤销覆盖独立走真实 Ctrl/Meta+Z 至空再发表。新增用例用真实全选和 Backspace 使 DOM 空白，同时断言 source 仍是首段。两个空稿用例都检查零添加请求及零人类评论。档案失焦用例作为慢桥对照。 [H05 用例](../../tests/e2e/knowledge/compact-submit.spec.ts)
- OP-D18 用 `Range.getBoundingClientRect()` 测量普通正文「参」字中心，核对命中段落后发送真实鼠标点击。只读探针记录可信 click 和每次相关 keyup 的事件目标、焦点、DOM anchor/focus 与偏移、ProseMirror `from/to/anchor/head`，写入 `compact-task-selection` JSON 附件。用例继续检查「参考」选区、无批注浮层、编辑器焦点和保存后的 Research 引用。产品键盘分支未改。已有 trace 尚不足以判断旧点击是否命中 wikiLink。 [OP-D18 用例](../../tests/e2e/knowledge/editor-compact-commands.spec.ts)

## Lead 串行复跑

1. 在包含产品补丁的桌面产物上复跑 `tests/e2e/knowledge/compact-inbox.spec.ts` 的 `G07 收件正文的普通段落与原 OK 阅读器复制两种 MIME 一致，富格式保持原节点`。再跑 `tests/e2e/knowledge/journey.spec.ts` 的 `A02/A03/OP-D11`，覆盖笔记编辑器中双链的 Enter 入口。
2. 复跑整个 `tests/e2e/knowledge/compact-submit.spec.ts`。核对普通发表与发表并关闭两例在点击前的 DOM 和 source 分歧、撤销至空与删除至空各自零请求，以及档案失焦对照。如果分歧断言先失败，优先定位首段结算和后续定时器的调度。
3. 复跑 `tests/e2e/knowledge/editor-compact-commands.spec.ts` 的 `OP-D18 紧凑任务描述保留文本命令和 @，隐藏文档级命令与批注`。从附件比较 click、Home、两次 Shift+ArrowRight，以及批注快捷键。预期 Home 归到词首，两次右扩依次得到「参」和「参考」。若精确点击后仍失败，以首个偏离步骤区分焦点变化、浏览器选区和模型同步。

## Vendor 登记

Open Knowledge（Inkeep，GPL-3.0-or-later）固定提交 `44a2e0a6acce5952da0764746e3693fded5025b4` 的 `packages/app/src/editor/extensions/wiki-link.ts` 映射至本次修改的 `app/src/editor/extensions/wiki-link.ts`。本地上游副本同文件包含 `location.assign` 的文档支路和 `location.hash` 的资产支路。建议 Lead 在 `packages/editor/src/vendor/open-knowledge/PATCHES.md` 登记文档支路的同文档片段导航适配，来源沿用 `docs/upstream/ledger.md` 的 R-46。 [上游文件](https://github.com/inkeep/open-knowledge/blob/44a2e0a6acce5952da0764746e3693fded5025b4/packages/app/src/editor/extensions/wiki-link.ts)

## 未运行的验证

按任务要求未启动应用、未运行 Playwright/E2E、单测、类型检查、lint、构建、打包、依赖安装或 vendor 台账检查。候选保持未暂存、未提交。integration 中已有的测试运行由 Lead 收取。

`hc send t3p` 因 Core 锁文件所在文件系统只读返回 `unavailable`，报告留在任务指定的隔离树内供 Lead 收取。

### Modern Web Guidance

使用本机缓存的 `modern-web-guidance` 完成片段导航、文字范围与键盘焦点的 `search`，取回 `js`、`highlight-text-ranges` 和 `accessibility`。`js` 未涵盖片段赋值的导航算法，因此用 WHATWG HTML 的 `Location.hash` setter 核对其复制当前 URL 后更新片段。`Location.hash` 和 `Range.getBoundingClientRect()` 均为 Baseline Widely available，现有运行记录为 Electron 44.9.1 / Chromium 152.0.7977.167。 [WHATWG HTML](https://html.spec.whatwg.org/multipage/nav-history-apis.html#dom-location-hash) [Location.hash 兼容性](https://developer.mozilla.org/en-US/docs/Web/API/Location/hash) [Range 兼容性](https://developer.mozilla.org/en-US/docs/Web/API/Range/getBoundingClientRect)

- `highlight-text-ranges` 指出 “Set range start/end on text nodes, not element nodes.” 我把 Range 两端设在普通文字的 Text 节点上，仅用矩形定位首字的真实点击。
- `accessibility` 要求 “Validate Sequential Navigations using keyboards alone”。我保留真实方向键和快捷键，通过只读采样检查焦点与选区。
