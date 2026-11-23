# #7 H5.3 会话录制回放报告

- 共享根 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux`
- terminal_address — `t4x`，本机 `wta-ubuntu` 默认 Core。环境终端 ID 与 topic、manifest 中的活跃任务一致。
- task — `task01.md`
- 任务文件 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t4x/task01.md`
- 报告文件 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t4x/report01.md`
- 执行结果 — `done`，待 Lead 验收
- 代码 — `/home/wta/projects/huhu/temp/issue-worktrees/agent-linux`，分支 `impl/huhu-issues-3-10-h7-recording-playback`，基线 `690e90978b6a012cead9f6bdd47ed93f13b65550`。六个文件的改动留在工作树。

## 实现

- 现有「会话日志」选中录制后显示全文。已停止且有文本时间轴的录制可以从头播放、暂停、继续和用进度条定位。切换录制或筛选会话会卸载旧播放器。编辑搜索词会暂停并显示整份录制中的高亮匹配。使用已有 Huhu 按钮、搜索框、表单和日志入口。核对到确认的六文件原型指纹 `0a890ec3a9f26bbedc304f7b61e9cb41975d8b48df4ca2a96a33ee05fb473d2b`，`auxiliaryView` 覆盖日志入口和活动列表，播放控件的交互依据 H5.3 实施验收。 [切片规格](/home/wta/projects/huhu/temp/issue-worktrees/agent-linux/.agents/dev/changes/2026-11-19-issue-7-ssh-module/tasks/H5.3-terminal-history.md) · [原型确认](/home/wta/projects/huhu/temp/issue-worktrees/agent-linux/.agents/dev/changes/2026-11-19-issue-7-ssh-module/prototype-review.md)
- 服务沿用每 Shell 独立的捕获监听和原子保存。新增可选时间轴，使用距离开始的单调毫秒和净化后的文本末端偏移。停止时冻结时长。时间轴达到 2,048 个检查点时扩大时间分组，密集写入按组内最后一次捕获的时间一起出现，捕获顺序和正文完整保留。继续使用每份 256 KiB 原始输出、每文件 1.75 MiB 和最多 60 份存档的限制。旧文件和时间轴无法校验的文件直接显示保存的文本。 [录制服务](/home/wta/projects/huhu/temp/issue-worktrees/agent-linux/plugins/ssh/src/engine/terminal-recordings.ts) · [共享数据结构](/home/wta/projects/huhu/temp/issue-worktrees/agent-linux/plugins/ssh/src/shared/recordings.ts)
- 捕获跨块 UTF-8 解码和控制序列清理发生在生成可见偏移前。回放输出以 React 文本节点显示，链接限于正文中完整可见的 HTTP(S) 地址，只有点击才调用既有外部打开路径。播放器使用本地时间和文本切片。 [日志面板](/home/wta/projects/huhu/temp/issue-worktrees/agent-linux/plugins/ssh/src/ui/TerminalRecordings.tsx) · [布局](/home/wta/projects/huhu/temp/issue-worktrees/agent-linux/plugins/ssh/src/ui/ssh.css:1008)

## 上游依据

参考本机 Motty `v0.4.12` 解引用提交 `102228261703d8f22c5eb98b1c500e2a24889dee`，许可证 Apache-2.0。其 `internal/workbench/terminal_recording.go` 使用相对时间保存有序事件，`internal/sessionlog/{model,store}.go` 按记录标识管理事件、限定时间轴容量并封存结束后的历史。本切片借鉴相对时间与有界事件这两个设计思路，使用 Huhu 的 JSON 文本偏移、现有 SSH 输出监听和 React 纯文本回放。采用量为设计参考，零上游代码或资源复制。共享台账由 Lead 维护。 [终端录制](https://github.com/t8y2/motty/blob/102228261703d8f22c5eb98b1c500e2a24889dee/internal/workbench/terminal_recording.go) · [日志模型](https://github.com/t8y2/motty/blob/102228261703d8f22c5eb98b1c500e2a24889dee/internal/sessionlog/model.go) · [日志存储](https://github.com/t8y2/motty/blob/102228261703d8f22c5eb98b1c500e2a24889dee/internal/sessionlog/store.go) · [许可证](https://github.com/t8y2/motty/blob/102228261703d8f22c5eb98b1c500e2a24889dee/LICENSE)

## 验证

| 场景 | 结果 | 证据 |
| --- | --- | --- |
| 捕获顺序、时间、跨块 UTF-8、停止点和按 Shell 隔离 | 通过。两份并行模拟录制使用不同标识，第一份重读为 `中🙂` 与第二段文本，时间点为 140 ms、300 ms，停在 500 ms，迟到输出未进入文件。第二份含自身 100 ms、600 ms 的输出。OSC 与 SGR 控制序列无可见正文，HTML 样例是原样字符串。 | [manager.test.ts](/home/wta/projects/huhu/temp/issue-worktrees/agent-linux/plugins/ssh/test/manager.test.ts:469) |
| 旧文本、无效时间轴回退 | 通过。旧 JSON 原文可读，切入代理对中间的时间索引被忽略。 | [manager.test.ts](/home/wta/projects/huhu/temp/issue-worktrees/agent-linux/plugins/ssh/test/manager.test.ts:520) |
| 密集写入、上限和截断编码 | 通过。超过检查点限制的写入仍保存到捕获字节上限，截断位置在中文字符内时保留前面的完整文本，文件小于 1.75 MiB。 | [manager.test.ts](/home/wta/projects/huhu/temp/issue-worktrees/agent-linux/plugins/ssh/test/manager.test.ts:541) |
| 真实日志页交互 | 已编写「H5.3 回放已停止的录制，可暂停并按时间定位，切换 Shell 保持隔离」。用两台回环夹具，覆盖显式开始及停止、播放中切会话、键盘定位、暂停、完整链接和文字高亮，并核对回放期间两个 Shell 的输入都没有增加。按任务约定留给 Lead 执行。 | [remaining.spec.ts](/home/wta/projects/huhu/temp/issue-worktrees/agent-linux/tests/e2e/ssh/remaining.spec.ts:144) |

Node `24.21.0`、pnpm `12.10.1` 下运行 `pnpm --config.verifyDepsBeforeRun=false exec vitest run plugins/ssh/test/manager.test.ts -t 录制`，3 项通过，19 项按名称筛选跳过。此前运行同一个文件的全部用例得到 4 通过、18 失败及 1 个未处理错误。旧用例尝试绑定回环时返回 `listen EPERM: operation not permitted 127.0.0.1`，其中一项认证用例等待监听后超时。

六个改动文件的格式、五个 TS/TSX 文件的 oxlint、SSH 样式的 stylelint 及 `git diff --check` 均通过。SSH 插件 `tsc --noEmit` 在 `apps/engine/src/boot.ts:52` 报 `TS2307`，依赖 `@huhu/herdr-client` 的类型声明未解析。全量测试、构建、打包、截图与运行中的桌面端验收由 Lead 完成。

## Modern Web Guidance

先运行 `modern-web-guidance@latest search`，技能版本 `2026_11_10-47b4c80e`。查询为 `seek playback range slider` 与 `display untrusted text safely`。执行 `retrieve` 获取 `slider`、`brand-consistent-forms`、`security` 和 `html`。桌面依赖 Electron 44.9.1 捆绑 Chromium 152.0.7977.167。Web 端按 Baseline Widely available 核对原生 range 与计时接口，沿用共享表单主题，浏览器可以采用原生控件颜色。 [Electron 版本](https://releases.electronjs.org/release/v44.9.1) · [HTML range 规范](https://html.spec.whatwg.org/multipage/input.html#range-state-(type=range)) · [单调计时规范](https://www.w3.org/TR/hr-time-3/#dom-performance-now)

- **`slider`**　我把格式化的实时时间放在普通 DOM 中并同步到滑块的 `aria-valuetext`，用有标签的原生 range 保留键盘和触控操作。指南要求 “expose it in ordinary DOM content and update `aria-valuetext` when changed”。
- **`security`**　我继续用 React 文本节点显示捕获内容与搜索高亮，按指南的 “Prefer `textContent` or `innerText` over `innerHTML` when setting text content” 处理录制中的标记文本。

## 阻碍与接续

当前沙箱禁止回环监听。默认 Core 的锁所在文件系统为只读，`hc get t4x`、`hc get t3p` 和发布后的 `hc send t3p` 均返回 `cannot open core lock`，回告消息未投递。同号报告已发布到共享根。

## Lead 验收

由 Lead 复核后填写。

已核对六文件产物。工作树提交 4eade18a，集成提交 67d1f008。Lead 环境下 SSH 单包类型检查、manager.test.ts 的 22 项（含回环）和 remaining.spec.ts 语法检查均通过。桌面回放 E2E 待运行。
