# t111 · Web 终端与卡片验收用例

- 任务 `t111/task01.md`，Lead `t3p`，派发基线 `4ae7e7e4`。状态为用例已编写，运行结果待 Lead 收取。
- 用例位于 `tests/e2e/workflows/web-terminal-widgets.spec.ts`。通过 `HUHU_WEB_TERMINAL_WIDGET_ACCEPTANCE=1` 显式启用，包装器模式由 Lead 接入。

## 用例覆盖

1. **G7.2 同包 Web Agent 观察、接管并刷新原 shell 会话**。用候选 AppImage 启动独立桌面，通过真实回环邀请加入单独的 Chromium。桌面创建普通 shell 并记录 PID。Web 在桌面持有控制时显示观察模式，能读到桌面的输出，观察态键盘输入不执行。桌面离开后 Web 接管输入，刷新后依靠原浏览器会话重进 Agent，核对原输出、由新命令回报的相同 shell PID，以及 Engine 公共读接口中相同的会话 ID、Space ID、终端地址和运行状态。
2. **W05-W06 浏览器卡片退化：缺少读取能力时仅停用该卡片**。在加入前从真实 Web 能力目录过滤 `home.notes.recent`。最近笔记卡内显示读取权限提示，页面未发该卡片的业务 read。任务卡仍发出真实读取与完成请求，由桌面回读该任务的完成状态。
3. **W05-W06 浏览器卡片退化：撤回写能力后仍可读取且不发写请求**。确认原有完成控件可用，从真实 Web 能力目录过滤 `tasks.setStatus` 后刷新。同一任务仍可读取和打开，完成控件禁用，点击未发完成请求，桌面回读原任务状态与版本。

两个卡片用例的证据范围为浏览器退化。现有邀请授予工作台权限，无法单独限制这两项能力。用例仅改动浏览器收到的 `/api/v1/capabilities` 响应，记录页面真实发出的业务请求，业务响应由候选 Engine 返回。

三个用例各自使用独立 Vault、HOME/XDG、Chromium 资料和包装器提供的私有 D-Bus。复用 `openCandidateDesktop` 的候选身份检查和本夹具 Core 回收，路由、浏览器、桌面分别清理，并保留原始用例失败。SSH 保持暂停。

## 未运行的验证

按派发要求，未运行新增或既有 E2E、任何单测、类型检查、lint、构建、打包、安装、GUI 或截图验证。用例留在工作树，未暂存、未提交。生产文件、包装器与 integration 均无本任务改动。
