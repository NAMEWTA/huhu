# t109 桌面 Shell 五项失败诊断

Lead `t3p`，执行者 `t10r`，任务 `task01.md`。原始失败来自 integration 基线 `4ae7e7e4`。三处测试修订按 agent-linux 当前工作树复核。只读依据为五份 `error-context.md`、各自 `trace.zip` 内的 `test.trace`、全量运行日志、已有临时 Vault 和源码。以下编号是 t109 的运行序号。

| 项 | Trace 中第一个失败点 | 归因 |
| --- | --- | --- |
| 218 · 50 MiB 日志 | 首窗已返回，`shell.spec.ts:317` 等待 20 秒仍找不到 `engine-state`。第 324 行开始关闭应用，trace 没有对应的完成事件。 | 桌面工作台就绪及清理超时。文件树点击和卡片断言均未执行，具体启动故障待定位。 |
| 223 · ACC-AG-08 | 第 450 行在创建终端前等“已连接”，20 秒内得到“未启动”。 | 测试前置与按需启动规则冲突。退出、重开及重连均未执行。 |
| 230 · Safe 本机邀请 | 第 905 行期望 `local`，连续 14 次读到 `lan`。 | 首选范围符合 #6 已确认规格。本机邀请用例漏选范围，失败时还未启动监听。 |
| 231 · Safe 窄窗 | 第 946 行 Electron launch 约 0.52 秒返回，第 947 行等待首个窗口 30 秒超时。 | 首窗获取失败原因待定位。可确认测试清理边界有缺口，窄窗尺寸、Safe 创建和编辑均未执行。 |
| 235 · ACC-AG-04 | 第 1136 行在创建终端前等“已连接”。短暂显示“未启动或连接失败”，随后 38 次显示“未启动”。 | 同 223。xterm 输入、切出及重新挂接均未执行。 |

## 已复核的三项修改

- **223、235**。状态读走 `plugins/agent-cli/src/engine/index.ts:466` 的 `statusIfRunning`。没有监听端点时返回 `idle`，打开终端时才走 `ensure`。启动成功后界面刷新包含 `agent.core.status` 的查询。agent-linux 的 `tests/e2e/shell.spec.ts:453、1141` 现在都在点击启动 shell 并看到终端 `open` 后检查“已连接”。差异仅移动原断言。退出前后分别读到计算结果、切换模块后在同一会话读回输出等断言均保留。可与 `packages/herdr-client/src/herdr-core.ts:88、197` 和 `plugins/agent-cli/src/ui/AgentCliModule.tsx:89、280、499` 对照。
- **230**。#6 的 `spec.md:41` 与 `prototype-review.md:17` 均确认初始服务关闭、首次首选局域网、用户可选择仅本机。面板在 `packages/workbench/src/gateway/WebSharePanel.tsx:26、69、184` 使用组件状态初始化 `lan`，提交时才以所选模式启动。这里没有读取设备偏好。agent-linux 的 `shell.spec.ts:905–908` 已先核对默认 LAN，再主动选择并核对 local 才启动。环回邀请地址、真实浏览器加入和 Safe 初始化、锁定、解锁仍有断言。已有 `tests/e2e/workflows/web-share.spec.ts:98–105` 也遵循此顺序。

## 两项启动超时与隔离证据

**218**。总日志第 352–365 行记录 60 秒用例超时及 worker teardown 超时。单看错误摘要会漏掉原始的“元素不存在”。trace 的 `caqh@978、980、982` 依次是取得窗口、工作台元素缺失、进入关闭。此次启动时段的遗留 Vault 为 `/tmp/huhu-full-e2e.BGJhCi/tmp/huhu-e2e-aubGIk`，含 52,428,800 字节的日志、Vault 描述及 23:48:45 写入的 Engine 端点描述。生产启动在服务已建立后才写该描述（`apps/engine/src/boot.ts:630–636`）。可确认 Engine 达到了发布端点阶段，无法从这些记录确定 renderer 显示的是哪个页面、是否发生崩溃或何时不再响应。源码将超 1 MiB 的 .log 分派为超限元信息视图（`plugins/notes/src/shared/text-encoding.ts:58`、`plugins/notes/src/ui/viewers/dispatch.ts`），本轮未走到该分支。

**231**。总日志第 377–383 行明确记载失败 worker 只跑过第 231 项，随后 teardown 超时。前一项 230 的 trace 在第 939 行有完成的 Close context（约 132 毫秒）；231 的 trace 以新 worker 的 Before Hooks 开始，没有 Close context。代码中 `firstWindow()` 位于 `try` 之前，抛错会跳过 `unrouteAll`、`app.close()` 和删除 Vault。与 trace 的 23:52:16 启动时段对应的遗留 Vault `huhu-e2e-qkYVy6` 在 23:52:17 已写出 Engine 端点描述。结合主进程只在取得实例锁后进入启动分支（`apps/desktop/src/main/index.ts:284–296、350–351、596`），现有证据不支持将 231 归因于 230 占用同一 profile 的单实例锁。具体是窗口创建、加载还是 Playwright 收到窗口事件的哪一环异常，现有 trace 无法区分。

**共享边界与退出**。`shell.spec.ts:14–25` 的两个启动入口都用 `helpers/launch.ts:39`，userData 后缀是 Playwright worker 的 PID。一个 worker 内不同用例可共享 Chromium 存储，同一用例重启也会复用。不同 worker 使用各自的目录。本轮 218 的 worker 共执行 12 项，存在同 worker 顺序影响的条件；231 是其 worker 的首项。shell 启动还会继承整个运行的 HOME/XDG 设置。同一运行中有遗留的 SingletonLock、writer.pid 及端点描述；静态文件不能证明 PID 在下一项启动时仍然存活。该沙箱读取对应 PID 时没有可见的进程条目。没有证据把共享设备偏好或常驻进程定为这五项的共同根因。

## 最小改动与后续定向验证（交 Lead）

1. 在窄窗用例中让 `try/finally` 从 launch 成功后即生效。仅在已取得 page 时解除路由，即使取窗失败也应尝试关闭自己启动的 app。为 218、231 在关闭前保留第一条错误、耗时、脱敏后的主框架 URL 与窗口数量。启动前即接入可用的主进程错误输出，记录窗口创建、加载失败、renderer 退出和应用退出事件。保留关闭未返回的记录；端点文件内的凭据不得写入报告。
2. 先让 218 在独立临时 profile 下启动同一个预置 50 MiB 日志的 Vault；再按原顺序运行 217→218 比较。核对 UI 启动、文件卡片与 50.0 MiB，再用请求记录确认没有读取该文件正文。231 单独执行，捕获取窗和关闭阶段；有首窗后再验 390×844、三账号、回执丢失和编辑冲突。如果单跑通过而原序列失败，再比较 profile/设备配置。需要隔离时为每个用例分配 profile，仅在同用例重启时复用；已有 `tests/e2e/packaged/packaged.spec.ts:29–47` 可参考。保留现有超时与业务断言。
3. 串行执行修订后的 223、230、235，各自核对最终重连回显、127.0.0.1 邀请的 Safe 锁定/解锁、同一终端切出后的回显。三个修改与已知失败点一致，尚无新运行结果。

原始材料位于 integration 的 `test-results/shell-*/`，总日志为主工作树 `temp/issue-evidence/huhu-2026-11-22/e2e-4ae7e7e40eb3ffef39f2cf039124f9cf5cb6f030/run.log`。本任务只写此报告，未运行测试、E2E、构建、类型检查或其他验证，未操作全量进程。
