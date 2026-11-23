# t10p 同包受保护规则验收用例

- 共享根 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux`
- Lead — `t3p`
- Worker 与任务 — `t10p/task01.md`
- 工作树 — `/home/wta/projects/huhu/temp/issue-worktrees/agent-linux`，基线 `4ae7e7e4`
- 执行结果 — 已完成用例和 helper，运行结果待 Lead 验收。

## 产物

- `tests/e2e/helpers/candidate-desktop.ts` 复用 `candidatePackage()` 启动固定 SHA-256 AppImage 解出的 `squashfs-root/huhu`。`confirmCandidate()` 将应用路径、构建提交以及包内 Herdr Core、CLI 包装器和 CLI 包的哈希写入调用方指定的身份附件。桌面从包内 `resources/herdr/linux-x64/herdr-core` 解析 Core。临时目录前缀为 `hc-d-`，隔离 HOME、XDG runtime/config/data/state/cache、Electron userData 和 Vault。桌面和 CLI 共用该环境以及 wrapper 提供的私有 D-Bus Secret Service。正常退出和启动失败均清理应用、此 profile 下的 Core 和临时目录，启动清理错误保留附件。
- `tests/e2e/workflows/web-share.spec.ts` 的初开与重开通过同一个候选 helper 保留 `web-candidate-identity` 附件，重开复用初开的 Vault。源码路径继续调用 `openApp`。Web 流程及其断言未编辑。
- `tests/e2e/workflows/automation-linux-environment.spec.ts` 的「Linux 桌面批准 sh，CLI 和 MCP 配置及运行沿用原请求」仅在 `HUHU_RULE_PACKAGE_ACCEPTANCE=1` 时启用包模式。CLI 用同一解包目录的 `resources/bin/huhu call automations.terminal.external.<op> --vault <isolated-vault> --json --input-file <fixture>`，包装器运行随包 Electron 与 `resources/cli/cli.mjs`。MCP 通过运行中桌面 Engine 的 127.0.0.1 HTTP 地址、网关令牌和真实 MCP 会话调用。用例先用合成随机密码初始化 Safe，调用 `safe.lock` 并断言 `initialized: true, locked: true`。CLI 与 MCP 配置、执行、输出脱敏、原意图去重和撤销断言完成后，再核对 Core 已连接及 Safe 仍锁定。源码模式沿用原应用、CLI 入口、超时与未开启 Safe 的覆盖。

## 未运行的验证

按 task01 未运行 E2E、单测、全量测试、类型检查、构建、安装、打包和其他验证命令。包模式实跑、源码回归、Web 重开及 Core 退出结果均待验收。没有暂存或提交。

## Wrapper 接续

建议由 Lead 在 `scripts/accept-linux-candidate.sh` 加 `rule` 模式，沿用预期 **1** 项和现有固定 SHA、私有 D-Bus、xvfb 与 JSON 结果检查。对应分支导出 `HUHU_RULE_PACKAGE_ACCEPTANCE=1`，运行：

```sh
xvfb-run -a "$HUHU_ACCEPTANCE_NODE" "$HUHU_ACCEPTANCE_PLAYWRIGHT" test --reporter=list,json tests/e2e/workflows/automation-linux-environment.spec.ts
```
