# t11g 同包夹具审查返工

- Lead 为 `t3p`，worker 为 `t11g`，任务为 `t11g/task01.md`。
- 共享根为 `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux`。
- 工作树为 `agent-linux`，分支为 `impl/huhu-mail-graph-completion`，接手基线为 `4ae7e7e4`。
- 已交付四个夹具和 spec 的改动。候选包运行结果待 Lead 串行验收。

## 改动

- `tests/e2e/helpers/candidate-desktop.ts` 把环境显式声明为 `Record<string, string>`。Git 和 Web Terminal/Widgets 模式各自启用 `disableProviderDetection`，在启动候选包前以现有设置格式在隔离 Vault 停用目录中的 Claude、Codex、Pi。启动后读取已有检测快照，断言每项已跳过并在身份附件记录停用名单。设置文件采用独占创建，避免覆盖已有文件。普通 shell、系统 Git 和其他使用 pinned Codex 的模式沿用现有启动路径。
- `tests/e2e/workflows/git-credentials-package.spec.ts` 把 Git 资源收尾移入有独立 100 秒预算的 Playwright fixture。凭据查询、状态查询和清除各使用 2 秒的请求期限。脱敏附件有 2 秒期限，桌面清理有 70 秒期限。桌面夹具内的 Electron 关闭、Core 请求、退出核对、附件和异步目录删除均有各自的等待上限。Playwright 保留测试主体的失败并另报收尾失败。
- `tests/e2e/helpers/git-auth-fixture.ts` 关闭 HTTPS 监听并断开连接，逐组尝试终止已记录的 Git CGI。单组失败后仍处理其余组。监听与 CGI 的退出等待有 5 秒期限，随后记录失败阶段和识别到的 errno。两个远端以及候选桌面的收尾仍依次尝试。
- `tests/e2e/workflows/web-terminal-widgets.spec.ts` 从已加入邀请的浏览器被动记录同一终端 WebSocket 的服务端观察态和控制释放通知。原有 UI 键入负控、桌面与 Web 正控、刷新后输出和 shell PID 检查继续生效，并在刷新后再次核对 Core 身份。附件追加两条服务端通知的观测结果。

## G7.2 证据范围

静态阅读确认 Web 监听器将该 Agent 会话接到既有终端桥。新增断言覆盖服务端降级与释放控制的通知，以及跨入口、接管和刷新时的原会话。观察者输入与 resize 的服务端拒绝仍由现有 `plugins/agent-cli/test/terminal-bridge.test.ts` 的用例覆盖。本次同包 spec 采用被动 socket 观测，实际的输入负控经过 UI。G7.2 的观察者帧拒绝、撤销、正式输出游标及已接受作业延续仍缺本轮同包运行证据。

## 未运行的验证

- `tests/e2e/workflows/git-credentials-package.spec.ts` 的 P10.2 同包 Git 认证用例。
- `tests/e2e/workflows/web-terminal-widgets.spec.ts` 的 G7.2 Agent 观察、接管与刷新，以及 W05/W06 分别缺少读能力和写能力的用例。
- 桥接单测、其他测试、E2E 类型检查、全仓类型检查、lint、构建、打包及安装。没有启动 Electron、Chromium、真实 provider 或 Git 夹具。

按任务边界只编辑四个指定测试文件及本报告。工作树改动交由 Lead 汇合。
