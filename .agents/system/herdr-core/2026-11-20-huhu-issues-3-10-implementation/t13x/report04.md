# #4 W6.1 · Windows Codex 受控新会话独立复核

- 任务 [t13x/task04.md](./task04.md)
- 执行结果 **done**。现有 Windows Engine 协议夹具和真实 Codex 回环探针均退出 0。
- 候选 `9b34df699ecfdd6f46b210f2d95b362cccdad56d`，直接父提交 `ff0afc5866e85b399143574f9e62f6820d4a90c1`。
- Windows x64，Node.js 24.21.0，Vitest 3.2.7，真实 Codex CLI 0.171.0。两次运行均使用固定 Core 0.1.19，二进制 SHA-256 为 `8c5c088eda5c441502fa58714277a250e38103c66180376ef00d63d6cab03f8d`。

## 独立实测

| 场景 | 观察结果 |
| --- | --- |
| 真实 Codex 受控新会话 | 实际 Engine 通过 Core 和 Electron Node 运行方式启动候选的生产 helper，并连接真实 Codex App Server 的 stdio。回执包含原生 thread 和 turn，列表中只有一条记录同时匹配原 Huhu session 与隔离 Core 地址 `t1`。合成回环 Responses 服务收到一次请求，且一次命中原正文。任务进入进行中，有一条对应 run 的派发评论。实测为 `nativeWrite: provider_accepted`、`coreWrite: not_sent`，收件后不再占用输入权。专用配置目录没有落盘的 sessions 历史。 |
| 同一 Core 现场与输入身份 | 现有协议夹具以同一 dispatchId 并发提交，两次取得同一 run，原生输入计数为 1。核对了正文 SHA-256、64 位十六进制客户端消息 ID、原 Space 和原生 thread。先停用 Agent CLI、重开 Engine，再恢复插件后对账，找回原会话 `sess-mworpln2kekw` 和原隔离 Core 地址 `t1`，签收原 turn 并只写一条系统评论。两条正向路径都走原生通道，协议夹具的 PTY 写入计数为 0。 |
| ACK 丢失与重传 | 缺少对应 `turn/start` 响应时结果保持 `unknown`，`providerAcceptance` 为空，任务保持未开始且无派发评论。同 dispatchId 重传仍返回原 run，合成协议端只见一次输入。 |
| 等待期间停用 Tasks | 在认证通道已建立、提交边界前停用 Tasks，原生提交计数为 0。重新启用后同一轮恢复，计数为 1。 |
| 目标范围 | 受控 `new` 在既定 Windows 配置下可用。显式 `existing` 和 `resume` 在本切片均得到 `target_unsupported`，任务保持未开始。协议夹具还核对了所选 Space、模型设置、临时 thread、只读沙箱和 `approvalPolicy: never`。 |

协议夹具的 1 项测试通过，用例用时 3.123 秒，整次 Vitest 用时 12.17 秒。真实 Codex 探针记录 `nativeThread=true`、`nativeTurn=true`、`localSyntheticModelRequests=1`、`matchedInput=1`、`taskComments=1`、`electronHost=true`。

## 生产接线与隔离

- 候选的 `engine-supervisor.ts` 在正式包内指向 `process.resourcesPath/codex-dispatch/helper.cjs`，开发态解析到插件源文件。`electron-builder.yml` 的资源映射将同一源文件复制到该正式路径。桌面同时传递 Electron Node 启动程序，Engine 以本机 Vault 实例 ID 为私有运行数据分区。真实探针使用归档中同一生产 helper 和既有 Electron 二进制。
- 受控选择要求独立的绝对路径、Windows 原生 `.exe` 与已核验的 Codex 版本。启动计划记录二进制、helper 和专用配置的文件身份。候选拒绝把手动 TUI 自定义参数或环境作为受控启动配置。helper 用专用 `CODEX_HOME`，关闭 MCP 工具、联网搜索及 shell 工具。
- 真实探针沿用实施报告中的 `real-codex.mjs` 和原断言。在临时副本的探针 TOML 中显式使用文件凭据存储，关闭启动更新检查和分析上报。进程环境去除继承的 Codex 和 OpenAI 账号变量，用户目录和应用数据目录指向本轮临时目录。模型提供方指向仅监听 `127.0.0.1` 的合成 Responses 服务，`requires_openai_auth=false`。探针只使用合成输入和专用临时数据。 [既有取证脚本](../t135/evidence-task02/real-codex.mjs)

## 复跑与清理

- Git 归档与临时 Vault 均位于新建的 Windows 系统临时目录。应用锁与既有 Windows 安装的依赖锁匹配，102 个工作区链接指向归档源码，297 个第三方依赖链接指向已安装包。测试前后的归档锁对象为 `03c864cafb3cc7a0d3b096f55d12bc98f4cf203b`。
- 协议夹具运行后报告 `livePids: []`。真实探针退出前确认其隔离 Core 为停止状态，并关闭回环服务。两个运行的夹具根计数均为 0，归档、临时配置及运行缓存已清除。验证窗格 `t14t`、`t14v` 已在退出后移除。候选差异的 `git diff --check` 通过。本轮未创建 worktree，未写业务源码、锁文件或远端。

```powershell
node node_modules/vitest/vitest.mjs run apps/engine/test/codex-dispatch.live.test.ts --no-file-parallelism --maxWorkers=1 --reporter=verbose
```

整包构建在实施日志中因 PDF 资源配置无法解析 `pdfjs-dist/package.json` 停止。此次验证覆盖生产 helper、Engine 和本机受控新会话，正式包安装后的资源路径运行及该 PDF 依赖由 Lead 接续。 [整包构建日志](../t135/evidence-task02/electron-vite.log)

依据 [W6.1 验收](../../../../dev/archive/changes/implemented/feature_2026-11-19-issue-4-agent-cli/tasks/W6.1-bound-input.md) 和 [实施报告](../t135/report02.md)。

## Lead 验收
