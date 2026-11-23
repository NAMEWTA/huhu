# macOS 包内 E2E 临时路径修订的独立审查

`done`，审查者 `t1gp`，Lead `t3p`。比较 `8b884993` 与 `8f159adbf27bc652d2acadc5119ad8601c05339b`。工作流 SHA-256 为 `0a25ec46b35c1ad9f33f7236f6e70f8537baf429754453a2315741fbfbef6850`。已核对归档 `t1gn/report03.md` 和临时目录中的实施报告内容一致。 [审查任务](../../.agents/system/herdr-core/2026-11-23-platform-release/t1gp/task02.md) · [路径分析](t1gn-report03.md)

## 结论

没有发现需要阻止第三轮运行的缺陷。修订只在 macOS 的包内 E2E 步骤缩短测试夹具的临时根，保留每次启动的隔离目录、随包 Core 的真实启动、终端回显和原计数门禁。路径过长与源码和第二轮故障相符，根因仍待 runner 的实测路径长度和测试结果确认。

## 路径归因

- 第二轮 `45135526567` 的 macOS 作业完成打包。包内 E2E 为 3 通过、1 失败、1 跳过。随包 Core 场景在 `agent.sessions.launch` 返回 `HERDR_UNAVAILABLE`，报告 `stage: connect` 与 `confirmed_not_created`。标签源码在获取 Core 客户端或识别 Core 失败后统一返回该错误，当时尚未提交终端启动请求。原日志未记录 runner 的 `os.tmpdir()` 字节数或 Core stderr，无法从该错误单独确定失败点。同期 Windows 为 4 通过、1 跳过。 [macOS 日志](macos-retry.log#L1095) · [Windows 日志](windows-retry.log#L1255) · [错误处理](../../plugins/agent-cli/src/engine/sessions.ts#L727)
- 标签的夹具在 `os.tmpdir()` 下创建 `huhu-pk-profile-<6>`，以其 `runtime` 子目录设置 `XDG_RUNTIME_DIR`。Agent 的默认 Core 未传入 `socketName`，直接使用 `XDG_RUNTIME_DIR/huhu-<8>-<4>.sock`。本地 0.1.19 参考源码 `ce81486` 在 CLI 启动前校验 socket 路径，最长 holder 路径比应用 socket 多 16 字节。独立计算得到应用 socket 为临时根长度加 55，holder 为加 71。macOS 上限 103 字节，因此根为 32 字节时恰好符合，33 字节时超限。49 字节示例对应 104／120 字节，`/tmp` 对应 59／75 字节。示例来自本地探针。 [夹具](../../tests/e2e/packaged/packaged.spec.ts#L25) · [Agent 配置](../../plugins/agent-cli/src/engine/workspace-package.ts#L20) · [应用 socket](../../packages/herdr-client/src/herdr-core.ts#L34) · [Core 路径检查](../sources/herdr-core/crates/herdr-core/src/paths.rs#L27) · [平台上限](../sources/herdr-core/crates/herdr-core/src/platform/unix.rs#L124)

## 验收条件与改动范围

- YAML 结构对照确认工作流唯一变动是 `Test the packaged executable` 里新增的 macOS 分支。分支先记录原目录字节数及推算长度，再通过该 Bash 步骤的 `export TMPDIR=/tmp` 传给当前测试进程。后续工作流步骤、Windows 分支、产品源码、原 CI 和原发布工作流均保持原样。该步骤仍从固定标签 `v0.0.2-rc.1`（`e14bc4c7`）构建的解包应用启动。 [修订](../../.github/workflows/preview-platforms.yml#L109) · [标签校验](../../.github/workflows/preview-platforms.yml#L54)
- 夹具仍在临时根下用 `mkdtempSync` 为每次启动创建独立 Vault 和 profile，各 XDG 子目录仍使用 `0700`，Electron 仍使用独立 `--user-data-dir`。环境白名单继续排除外部 `HUHU_HERDR_BIN`。应用从包内资源定位 Core，按需执行 `server start`，用独立 socket 和 Vault 状态连接。原用例依次断言 shell 会话建立、Core 为 `connected` 和经 WebSocket 收到 `packaged-42`。原 Playwright 门禁仍检查 4 通过、1 跳过、0 失败、0 flaky，唯一条件跳过仍是 Linux 凭据用例。 [夹具隔离](../../tests/e2e/packaged/packaged.spec.ts#L25) · [环境白名单](../../tests/e2e/helpers/candidate-package.ts#L87) · [随包 Core](../../apps/desktop/src/main/engine-supervisor.ts#L150) · [真实启动](../../packages/herdr-client/src/herdr-core.ts#L101) · [终端断言](../../tests/e2e/packaged/packaged.spec.ts#L139) · [计数门禁](../../.github/workflows/preview-platforms.yml#L117)

## 验证边界

已通过 `git diff --check`、YAML 结构对照和 `bash -n`。在本地执行实际新增 Bash 分支和 Node 字节计算，确认 macOS 条件将测试进程的 `os.tmpdir()` 切换到 `/tmp`，Windows 条件保持传入根，32／33 字节边界分别推算为 103／104。未启动 Core、Electron 或 Playwright，未运行构建、全仓检查或远端命令。

第三轮刚调度，审查时没有结果。如果日志同时显示原 `tmpdirBytes > 32` 且随包 Core 用例实际通过，会进一步支持路径归因。若原长度在阈值内或短路径后仍失败，第二轮的通用连接错误需要用包内 Core 的启动退出码和日志继续定位。
