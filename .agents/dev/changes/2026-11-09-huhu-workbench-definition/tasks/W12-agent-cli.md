# W12 Agent CLI

## W12.1 Herdr Core 打包与客户端

- 目标：Engine 能启动私有 Herdr Core、运行终端、attach/detach、在 Engine 重启后重新连接，三平台通过。
- 依据：[interfaces](../interfaces.md) §7；[release](../release.md) §1；D-10。
- 前置：W03.5、W01.3。
- 位置：`herdr.lock.json`、`scripts/fetch-herdr.mjs`、`scripts/gen-herdr-types.mjs`、`packages/herdr-client/src/{connection,framing,rpc,generated/}`、`plugins/agent-cli/src/engine/herdr-runtime.ts`。
- 复用：R-35。
- 实现要点：锁定 0.1.19 各目标发布包 URL 与 SHA-256；开发与 CI 下载到 `apps/desktop/resources/herdr/<target>`；从固定 `hc.openrpc.json` 生成类型；连接 Unix socket / 命名管道，`hello {framed:true}`，帧编解码（DATA/CREDIT/CLOSE/RESIZE），JSON-RPC 请求/响应与错误 `data.kind` 映射为 `HERDR_UNAVAILABLE` 等；按 interfaces §7 设置 `HC_SESSION`、`XDG_*`、`HC_SOCKET` 启动 `hc server`；连接已有实例时检查 `server.status` 的协议 generation。
- 异常：二进制缺失或哈希不符（构建失败）；Core 启动失败（Banner + 日志）；协议 generation 不符（拒绝连接并提示）。
- 测试：三平台集成测试：`terminal.run` 回显、attach 收到输出、detach 后进程仍在、结束 Engine 后重新连接仍能 attach、`terminal.kill`。
- 完成：三平台 CI 通过；这是 W12 其他任务的开工门槛（plan §4）。

## W12.2 终端视图与 WebSocket 转接

- 目标：Renderer 中的 xterm 视图显示并操作 Herdr 终端（也供 SSH shell 使用）。
- 依据：interfaces §6（`/ws/terminal/:sessionId`）、§7 背压；design-system §4 TerminalView。
- 前置：W12.1、W03.4。
- 位置：`packages/kernel/src/server/ws-terminal.ts`（通用转接，按 sessionId 前缀分派到 agent-cli 或 ssh 提供的流源）、`packages/ui/src/components/terminal-view.tsx`。
- 复用：R-39。
- 实现要点：attach/observe 模式；CREDIT 回报与 4 MiB 发送缓冲上限；resize 去抖 100ms；断开覆盖层与重连；搜索、复制、链接经 `openExternal`；主题颜色取 token。
- 异常：WebSocket 断开时终端进程不受影响；观察模式下键盘输入被忽略并提示。
- 测试：集成测试大输出（10 MiB）背压不丢字节、不 OOM；ACC-AG-09。
- 完成：ACC-AG-09 通过。

## W12.3 Space 与 Agent CLI 模块骨架

- 目标：Space 的创建/编辑/删除，三栏界面，默认 Vault Space，“新终端”启动 shell，标签与分屏，关闭只 detach。
- 依据：[agent-cli](../modules/agent-cli.md) §3–4；ACC-AG-01、04、08。
- 前置：W12.2、W02.3。
- 位置：`plugins/agent-cli/{huhu-plugin.json,src/engine/{spaces,sessions,capabilities}.ts,src/ui/{AgentCliModule,SpaceList,SessionTabs,SplitLayout,SpaceDialog}.tsx}`。
- 复用：R-57。
- 实现要点：Space canonical 目录唯一性（同机器）；`revision`；会话记录文件；启动流程第 1–5 步（agent-cli §4）含 `huhu.launch` 对账；Engine 启动对账；分屏 1–4 格（react-resizable-panels）；会话重命名（`terminal.label`）；中断与结束。
- 异常：目录不可访问（`SPACE_INVALID`）；Core 不可用时只读浏览。
- 测试：ACC-AG-01、04、07（注入丢弃启动响应）、08 E2E/集成。
- 完成：四个 ACC 通过。

## W12.4 Provider 目录、检测与启动菜单

- 目标：检测本机 Claude Code、Codex、Pi（及 Claude Agent Teams 预设），“+”菜单选择模型/推理强度/Fast/附加提示词并启动；提供 automations 需要的无界面适配器。
- 依据：agent-cli §3 启动菜单、§4 检测；interfaces §8；ACC-AG-02、03、11。
- 前置：W12.3。
- 位置：`plugins/agent-cli/src/engine/providers/{catalog,claude,codex,pi,detect}.ts`、`plugins/agent-cli/src/ui/launch/`、`plugins/agent-cli/src/ui/AgentSettingsDialog.tsx`。
- 复用：R-36、R-37、R-32、R-31（`findOnPath`）。
- 实现要点：检测命令与版本探测（5 秒超时）、10 分钟缓存；模型目录与 effort/Fast 能力来自 R-36 配置；`interactiveArgv` 与 `headless`（claude、codex 复制 AA 适配器）；菜单搜索评分（R-37）；每 provider 上次选择持久化；Space revision 与机器校验；`Cordis provide('agentProviders')` 供 automations 使用。
- 异常：未安装/未知登录/检测失败分别展示；启动时 Space 已变化（ACC-AG-03）。
- 测试：用 testkit fake provider（在 PATH 中伪装为 `claude`、`codex`）进行检测与启动 E2E；argv 生成单元测试（含提示词中的特殊字符作为单个参数）；ACC-AG-02、03、11。
- 完成：三个 ACC 通过；`headless.command/read` 对 AA 原测试夹具输出解析一致。

## W12.5 会话历史与恢复

- 目标：右侧历史按本机 + Space 目录显示原生会话与 HUHU 会话，查看记录、恢复会话、固定。
- 依据：agent-cli §4 历史与恢复；ACC-AG-05、06。
- 前置：W12.4。
- 位置：`plugins/agent-cli/src/engine/history/`、`plugins/agent-cli/src/ui/history/`。
- 复用：R-38。
- 实现要点：扫描器按 mtime 增量缓存；cwd realpath 归属；首条用户提示为标题；切换 Space 取消上一次扫描并清空搜索；“恢复会话”仅接受明确的 `nativeSessionId`；固定项写 `pins.json`；窄屏抽屉。
- 异常：会话文件解析失败的条目跳过并计数，在历史底部显示“n 条记录无法读取”。
- 测试：fake provider 生成原生格式会话文件（Claude jsonl、Codex jsonl 夹具取自 R-38 测试夹具格式）；ACC-AG-05、06。
- 完成：两个 ACC 通过。

## W12.6 变更审查

- 目标：会话详情中查看 Space 工作树相对 HEAD 的差异、添加审查意见、发送到同一会话。
- 依据：agent-cli §3 会话详情；D-30；ACC-AG-10。
- 前置：W12.3、W06.4（DiffView）。
- 位置：`plugins/agent-cli/src/engine/review.ts`、`plugins/agent-cli/src/ui/SessionDetail.tsx`。
- 复用：R-57（`agent-cli-review.jsx` 的意见整理格式）、R-47（DiffView）、simple-git。
- 实现要点：`agent.review.diff` 在 Space 根执行 `git diff HEAD --stat` 与逐文件 diff（只读）；意见存会话记录；`agent.review.send` 把未发送意见按“文件:行 — 意见”格式经 `terminal.send` 写入会话；标记已发送。
- 异常：非 Git 仓库；会话已结束（禁用发送，提示“恢复会话后再发送”）。
- 测试：ACC-AG-10 集成测试（临时 Git 仓库 + shell 会话接收文本）。
- 完成：ACC-AG-10 通过。
