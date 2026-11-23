# t176/task21 · 独立外部 Agent 到桌面同包验收

Lead `t3p`，worker `t176`。新增两条独立 E2E，覆盖 report17 的第一项同包组合缺口。每条使用自己的 Vault、桌面配置和回环 Responses 服务。 [组合缺口](t17c-report17.md#linux-组合收尾最小集合) · [新增用例](../../tests/e2e/workflows/external-agent-desktop.spec.ts#L96)

## 用例与断言

- **CLI-only 同包外部 Agent 任务派遣与原会话问答，桌面定位唯一结果**。所有任务操作调用候选包内的 `resources/bin/huhu`，并核对任务来源为 `external/cli`。 [CLI 入口](../../tests/e2e/workflows/external-agent-desktop.spec.ts#L60)
- **HTTP MCP-only 同包外部 Agent 任务派遣与原会话问答，桌面定位唯一结果**。桌面准备受控授权、HTTP MCP 和临时令牌，所有任务操作通过真实 `/mcp` 会话的 `tools/call`，并核对任务来源为 `external/mcp`。 [MCP 入口](../../tests/e2e/workflows/external-agent-desktop.spec.ts#L71)
- 两条均在各自入口创建和修改任务、按修改版本派遣、读取 `native_deferred` 问题、提交并确认回答、读取已投递的唯一结果。重交同一个 dispatch ID 后核对仍只有一次派遣、一次运行和一条结果；回环服务记录一次原始模型回合请求和一次携带 `Circle` 回答的续答请求。 [任务链](../../tests/e2e/workflows/external-agent-desktop.spec.ts#L109)
- 桌面打开同一任务并核对时间线消息 ID 和运行 ID，展开结果后点击「定位原会话」。终端必须连到同一 Engine 上带原 `sessionId` 的 WebSocket 路径并进入 `open` 状态，Core 身份在回答前后相同。测试附件关联 Vault、Core、任务、派遣、运行、原会话、问题、回答及结果。 [桌面证据](../../tests/e2e/workflows/external-agent-desktop.spec.ts#L156)

## 复用与夹具

外部任务链沿用 `native-receipts.live.test.ts` 的版本、问答和派遣回执语义；CLI/MCP 接线参照 `external-task-web.spec.ts`；原生问答复用 `task-journey` 的既有 Responses 夹具。包解压、AppImage 和已运行包的身份校验复用 `candidate-package.ts`，清理步骤封装复用 `candidate-desktop.ts`。 [外部链](../../plugins/agent-cli/test/native-receipts.live.test.ts#L470) · [同包外部接线](../../tests/e2e/workflows/external-task-web.spec.ts#L21) · [原生问答](../../tests/e2e/workflows/task-journey.spec.ts#L217)

专属启动夹具为 `HUHU_CODEX_DISPATCH_HOME` 提供独立配置目录，并按 SHA-256 锁定原生 Linux Codex。隔离 HOME、XDG 目录、Vault 与桌面配置，PATH 使用实际 Node 所在目录和系统目录，预置 provider 探测配置以规避登录环境 shim。关闭时核对本夹具 Core socket 的所有者、二进制和 Core 身份，只向该实例发送停止请求，再核对桌面、Engine、Core、holder 和 socket 已退出。 [专属夹具](../../tests/e2e/helpers/external-agent-desktop.ts#L16)

## Lead 运行条件

Linux x64。准备目标 AppImage、AppImage SHA-256、完整候选 Git SHA 与项目锁定的原生 Codex 0.170.0。Lead 已接入 `external-agent` 模式。wrapper 开启 `HUHU_EXTERNAL_AGENT_DESKTOP_ACCEPTANCE=1`，提供隔离的 Xvfb、D-Bus/Secret Service 与 profile，并要求 Playwright 报告 `expected=2`，`unexpected`、`skipped`、`flaky` 和全局错误数均为 0。 [wrapper 模式](../../scripts/accept-linux-candidate.sh#L66) · [报告校验](../../scripts/accept-linux-candidate.sh#L96)

```bash
scripts/accept-linux-candidate.sh external-agent "$APPIMAGE" "$APPIMAGE_SHA256" "$GIT_SHA" "$CODEX"
```

## 当前文件 SHA-256

```text
9a5d5a5efa5cf7b1e8055d93b46bfed32a84b42d8f0bcb9dbe9b6124263dce18  tests/e2e/helpers/external-agent-desktop.ts
04293b068e56f83c964c7ee571e2a815c26f158bae43aea9504b77353fe578b8  tests/e2e/workflows/external-agent-desktop.spec.ts
```

## 已完成的静态验证

两份新增文件的定向 `tsc`、`oxfmt --check`、`oxlint` 和尾随空白检查通过。 [tsc 日志](t176-task21-tsc.log) · [格式和 lint 日志](t176-task21-static.log)

```bash
export PATH=/home/wta/.volta/tools/image/node/24.21.0/bin:$PATH
files=(tests/e2e/helpers/external-agent-desktop.ts tests/e2e/workflows/external-agent-desktop.spec.ts)
pnpm exec tsc --noEmit --strict --skipLibCheck --noUncheckedIndexedAccess --exactOptionalPropertyTypes --noImplicitOverride --target ES2023 --module ESNext --moduleResolution Bundler --lib ES2023,DOM,DOM.Iterable,ES2024.Promise --types node --jsx react-jsx --esModuleInterop --resolveJsonModule apps/desktop/src/renderer/env.d.ts "${files[@]}"
pnpm exec oxfmt --check "${files[@]}"
pnpm exec oxlint -c oxlint.json "${files[@]}"
```

## 未运行的验证

本轮只写用例和专属夹具。未启动 Playwright、Electron、Codex、Core 或回环 Responses 服务，也未运行构建、打包或全仓检查。真实同包结果由 Lead 执行后记录。

`hc send t3p` 因 Core 锁所在文件系统只读退出 5，报告保存在当前工作树内。
