# t115 同包新增旅程独审

Lead `t3p`，任务 `t115/task01.md`。审查完成。审查基线为 `4ae7e7e40eb3ffef39f2cf039124f9cf5cb6f030`，审查对象包含 `agent-linux` 工作树里的新增 spec、Git HTTPS 夹具、候选包 helper 和包装器现有接线。以下结论均来自静态阅读。

## 规格轴

### P1 · 新模式启动候选包时仍可执行系统目录中的真实 provider

包装器固定 `PATH` 并隔离 HOME，切断了此前从用户 Volta 目录继承 Pi shim 的路径。两个新增模式仍用默认插件和默认 Agent 设置启动桌面。Engine 启用自动化时立即调用 `detector.detect()`，探测器依次查找 `PATH` 和安装目录，Linux 回退还包括 `/snap/bin`。只要这些目录有真实 CLI，就会执行版本命令。找到 Pi 时还会执行 `pi --help`。这两步发生在用例点击前，`HUHU_CODEX_DISPATCH_BIN` 只固定派遣程序，探测仍走自己的查找逻辑。探测超时也没有进程组回收。建议在两个新模式的私有 Vault 启动前，用既有 Agent 设置停用目录中的 `claude`、`codex` 和 `pi`，保留普通 shell 和系统 Git。未确认本机系统目录中是否有这些程序，旧 Volta 残留的清理由 Lead 提供。

依据 [包装器](../../scripts/accept-linux-candidate.sh#L36) · [默认启动夹具](../../tests/e2e/helpers/candidate-desktop.ts#L240) · [Engine 启动探测](../../apps/engine/src/boot.ts#L447) · [派遣程序配置](../../apps/engine/src/boot.ts#L298) · [探测目录与命令](../../plugins/agent-cli/src/engine/detect.ts#L31) · [探测超时](../../plugins/agent-cli/src/engine/detect.ts#L72) · [默认启用和停用设置](../../plugins/agent-cli/src/shared/settings.ts#L18) · [实际探测](../../plugins/agent-cli/src/engine/detect.ts#L136)

### P2 · G7.2 的观察态断言覆盖 UI 键入，服务端仲裁仍缺同包证据

浏览器观察态真的键入了命令。桌面控制命令输出抵达浏览器后，用例确认观察者的结果标记未出现。随后浏览器接管并刷新，回读旧输出、新命令返回同一 shell PID，桌面 Engine 回读同一会话、Space 和终端地址。这证明 UI 旅程的设计有可见的正反向观测。`TerminalView` 在观察态会拦住键盘与 resize 消息，因此该路径没有向观察者 WebSocket 投递输入或 resize，无法覆盖服务端忽略二者的分支。同包验收应将此项记为 Agent shell 的 UI 观察、接管与刷新。G7.2 的服务端拒绝、撤销、输出游标和已接受作业仍各需对应证据。现有终端桥单测代码覆盖观察者输入和 resize 两条分支，本轮未运行。

依据 [同包旅程](../../tests/e2e/workflows/web-terminal-widgets.spec.ts#L79) · [客户端发送条件](../../packages/ui/src/components/TerminalView.tsx#L68) · [键盘与 resize 发送点](../../packages/ui/src/components/TerminalView.tsx#L127) · [服务端仲裁](../../plugins/agent-cli/src/engine/terminal-bridge.ts#L47) · [现有单测](../../plugins/agent-cli/test/terminal-bridge.test.ts#L32) · [G7.2 验收](../../.agents/dev/changes/2026-11-19-issue-6-unified-tools-web/tasks/G7.2-terminal-ownership.md#L11)

### 其余场景的证据边界

- **P10.2 Git。** Safe 未设置时的推送、锁定及停用后各一次有新提交的拉取，都将服务请求中的认证分类与分支头、笔记内容互相核对。仓库切换和端口切换都以第一组仍保存的认证为参照，两端请求计数零增量。第二端口可用新凭据推送，清除后又观测到真实 401 前的无认证请求。系统 Git 属于 P4.1 合同，候选包身份由桌面、Engine 和制品凭据建立。此次用例没有新增 P4.1 对 argv、Git config 或短命 ASKPASS 文件的检查。
  [Git 主流程](../../tests/e2e/workflows/git-credentials-package.spec.ts#L94) · [切换与清除](../../tests/e2e/workflows/git-credentials-package.spec.ts#L139) · [实际 Git 调用](../../plugins/versioning/src/engine/sync.ts#L368) · [P4.1 合同](../../.agents/dev/changes/2026-11-19-issue-9-safe-accounts/tasks/P4.1-git-authentication.md#L7)
- **W05/W06。** 两项分别确认被过滤的项原本存在于真实能力目录。缺读能力时，有卡片内提示、无最近笔记业务请求，邻卡的读取、完成和桌面状态回读形成正控。写能力被过滤后，任务仍可读和打开，原生禁用按钮经过尝试点击后无对应写请求，且桌面回读状态和版本未变。适用结论为浏览器根据能力目录退化。邀请权限和服务端授权保持其真实配置。
  [目录过滤与审计](../../tests/e2e/workflows/web-terminal-widgets.spec.ts#L116) · [两项卡片断言](../../tests/e2e/workflows/web-terminal-widgets.spec.ts#L140) · [真实目录](../../packages/kernel/src/server/capability-http.ts#L106) · [实际按钮](../../plugins/tasks/src/ui/HomeWidget.tsx#L78)

## 规范轴

### P2 · Git spec 的 `env["PATH"]` 有严格 TypeScript 类型错误

`candidateEnvironment()` 返回 `Record<string, string>`，而候选桌面 helper 将其展开到包含若干固定键的对象，没有给结果指定环境类型。TypeScript 合并这一组固定字段时丢掉展开对象的字符串索引签名，固定字段中没有 `PATH`，因此 Git spec 的 `env["PATH"]` 在 `strict` 下会报 TS7053。Playwright 转译不依赖此类型检查，根目录的 workspace 类型命令也不直接覆盖根下的 E2E。可在环境创建处给出显式环境类型，或者显式声明候选进程的 PATH 字段。

依据 [环境来源](../../tests/e2e/helpers/candidate-package.ts#L87) · [推断位置](../../tests/e2e/helpers/candidate-desktop.ts#L81) · [报错位置](../../tests/e2e/workflows/git-credentials-package.spec.ts#L35) · [项目严格配置](../../tsconfig.base.json#L7) · [类型命令范围](../../package.json#L9)

### P2 · Git 清理有一步等待即可阻断后续资源回收

`withFixtureCleanup` 捕获每步已抛出的异常，并在全部清理后重抛主体首错。Git 用例却在 HTTPS 服务和桌面关闭前串行等待 `sync.get`、`sync.auth.get` 和清除认证，这三次调用都没传 signal。若 Engine 或私有凭据后端卡住，主体失败后依然可能卡在这一步，直到 Playwright 超时，两个回环服务及其 detached Git CGI 就未进入显式清理。建议给凭据收尾设独立的短期限，并安排专用 teardown 预算。`git-auth-fixture` 的进程组回收还有一个可达异常分支，若对任一组发信号遇到非 `ESRCH` 错误，会跳过后续组和最后的等待。应先对各已记录组尝试回收，再报告清理失败。常规成功路径会关监听、断开连接并等待已记录 CGI 结束。

依据 [清理顺序](../../tests/e2e/workflows/git-credentials-package.spec.ts#L181) · [通用清理与首错](../../tests/e2e/helpers/candidate-desktop.ts#L15) · [只有显式 signal 才传给 fetch](../../packages/workbench/src/engine-client/client.ts#L53) · [创建 CGI 自有组](../../tests/e2e/helpers/git-auth-fixture.ts#L18) · [回收分支](../../tests/e2e/helpers/git-auth-fixture.ts#L98)

### 接线和数据边界

- 包装器的 `git` 与 `web-terminal` 已分别接通一项、三项，JSON 门槛要求相应通过数及零失败、跳过、flaky。干净提交、完整 SHA、AppImage 摘要与包内提交身份检查均在。留给 Lead 在新干净组合提交对应的包上执行。
  [包装器门槛与用例](../../scripts/accept-linux-candidate.sh#L9) · [新增模式](../../scripts/accept-linux-candidate.sh#L68) · [结果门槛](../../scripts/accept-linux-candidate.sh#L86) · [包内身份](../../tests/e2e/helpers/candidate-package.ts#L17)
- Git 服务和 Web 分享绑定回环，Git 夹具使用合成登录和临时仓库，浏览器使用单独上下文。候选桌面核对 Vault、独立 profile、Engine 可执行路径及描述符。Core 停止 RPC 发送在已核对身份的私有 socket 上，随后检查已见 PID 与 socket。应用正常关闭会停止该 Engine 的 Web 分享。静态阅读未见新用例接入用户 Vault、会话总线或真实远端，启动探测例外见 P1。
  [Git 夹具监听](../../tests/e2e/helpers/git-auth-fixture.ts#L77) · [Web 夹具](../../tests/e2e/workflows/web-terminal-widgets.spec.ts#L15) · [回环绑定](../../packages/kernel/src/server/web-listener.ts#L115) · [Engine 归属](../../tests/e2e/helpers/candidate-desktop.ts#L99) · [Core 回收](../../tests/e2e/helpers/candidate-desktop.ts#L189) · [Engine 关停](../../apps/engine/src/boot.ts#L646)

## 未运行的验证

未运行任何验证命令，包括四项 Playwright/Electron/Chromium E2E、单测、lint、类型检查、构建、打包、安装、GUI、进程探针及 Git/HTTPS 夹具。只写本报告，业务文件与暂存区未作改动。真实运行由 Lead 接续。
