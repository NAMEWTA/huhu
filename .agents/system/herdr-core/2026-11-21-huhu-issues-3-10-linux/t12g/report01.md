# Web 候选夹具修复

Lead `t3p`，worker `t12g`，任务 `t12g/task01.md`，工作树 `agent-linux`。实施完成，待 Lead 串行验收。

## 改动

- 三条候选包用例沿用 Git 规格的 `base.extend`、`use` 和 `withFixtureCleanup`，在独立的 120 秒 Playwright fixture 预算内按顺序回收页面路由、Chromium、候选桌面与本夹具 Core。各阶段的等待上限为 3、25、85 秒。阶段失败或超时会记录清理失败并继续下一项。启动 Promise 在发起时登记。开始清理后设门，避免超时中的主体继续启动资源。等待上限本身不取消底层操作。 [夹具](../../tests/e2e/workflows/web-terminal-widgets.spec.ts#L13)
- G7.2 在同一个交互 shell 中启动后台 `stty size </dev/tty` 采样任务，先记录完整基线行列值，再打开原始 WebSocket。主 shell 保持可接收输入。探针收到 `observe` 和非空 PTY 回放后发送二进制输入与 `37` 行、`333` 列的 resize。发送后写入夹具信号文件，同一 PTY 至少再经过 20 次 50 ms 休眠及采样。浏览器确认探针仍打开且发送缓冲为空前，采样必须完成，并已核对每条完整行列值、同会话桌面控制 WebSocket 无新帧或开关事件、无原始输入的 shell PID 标记。浏览器随后主动关闭并要求 `wasClean: true` 和关闭码 `1000`。桌面输入、Web 接管与刷新后执行原 shell 的 PID、会话标识和 Core 身份仍是正控。 [采样与关闭](../../tests/e2e/workflows/web-terminal-widgets.spec.ts#L111) · [正控与附件](../../tests/e2e/workflows/web-terminal-widgets.spec.ts#L242)
- 观察窗口以浏览器第二个 `send` 返回后至尺寸及输入检查完成、探针仍打开的时刻为界，要求实测不少于 1,000 ms。`web-shell-session` 附件记录该区间的 `windowMs`、信号前后样本数、50 ms 采样休眠、基线及请求尺寸和实际关闭码。整个浏览器探针含连接和关闭握手上限 10 秒，信号后的采样完成等待上限 5 秒，后台采样任务由 `timeout 15s` 约束。采样可能漏掉两次取样之间发生并恢复的变化。实际毫秒数待 Lead 运行时记录。

改动限于 `tests/e2e/workflows/web-terminal-widgets.spec.ts`，沿用公共候选桌面接口。工作树保留未提交状态。

## 未运行的验证

按任务约束只做静态核对。以下 E2E 及其他测试、全仓类型检查、lint、构建和打包均未运行。

- `G7.2 同包 Web Agent 观察、接管并刷新原 shell 会话`
- `W05-W06 浏览器卡片退化：缺少读取能力时仅停用该卡片`
- `W05-W06 浏览器卡片退化：撤回写能力后仍可读取且不发写请求`
