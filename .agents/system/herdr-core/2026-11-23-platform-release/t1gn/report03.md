# task03 macOS 包内 Core 启动失败

状态 `done`。Worker `t1gn`，Lead `t3p`。针对 Actions `45135526567` 和生产标签 `v0.0.2-rc.1`（`e14bc4c7`）做只读分析。

## 判断

最可能的原因是本版打包测试夹具把 Herdr 的 Unix socket 放得过深。按夹具和 Core 源码计算，只要测试进程的 `os.tmpdir()` 超过 32 字节，holder socket 就超过 Core 在 macOS 上执行的 103 字节上限。日志未记录 runner 的实际临时目录或 Core stderr，因此当前属于有可检验预测的归因。先在 macOS 的打包 E2E 步骤打印原临时目录长度，然后将该步骤的 `TMPDIR` 设为 `/tmp`，仍用同一打包应用、原 spec 和原 4 通过／1 条件跳过门禁。

## 证据

- [本轮 macOS 日志](macos-retry.log#L1030) 由 `macos-26-arm64` 构建出 DMG 和校验和。第 1098–1132 行显示 Playwright 为 **3 通过、1 失败、1 跳过**。失败测试第 139 行定义，第 149 行断言报 `HERDR_UNAVAILABLE`、`stage: connect`、`confirmed_not_created`。标签的 `sessions.ts` 727–744 行在 `core.ensure()` 或后续 `identifyCore()` 抛错时统一返回上述错误，尚未发送 `terminal.run`。因此该日志与启动 CLI 提前拒绝、socket 拨号失败或 `hello` 失败均相容，无法指向终端按键或回显。测试中的 `health.ok` 只断言能力调用成功，健康检查在按需启动前也可能报告 idle。
- 标签的 [打包夹具](../../tests/e2e/packaged/packaged.spec.ts#L26) 用 `mkdtempSync(path.join(tmpdir(), "huhu-pk-profile-"))` 创建短随机后缀，但同时在下面再加 `runtime` 作为 `XDG_RUNTIME_DIR`。Electron 收到独立 HOME、USERPROFILE 和 XDG 目录，继承变量通过白名单过滤。Agent Core 继续使用自选的 `HC_SESSION=huhu`、`HC_SOCKET=<runtime>/huhu-<8>-<4>.sock`，并把其 state/config 指向 Vault 的 runtime。外部的 `HC_SOCKET`、`HC_SESSION` 或 `XDG_RUNTIME_DIR` 会被夹具或应用覆盖。测试进程的 `TMPDIR` 则在 Electron 启动前已决定生成路径，能在工作流中局部控制。 [Node.js os.tmpdir 文档](https://nodejs.org/api/os.html#ostmpdir)
- 本地 Herdr Core 0.1.19 参考树 `ce81486` 的 [paths.rs](../sources/herdr-core/crates/herdr-core/src/paths.rs#L16) 在 CLI 处理 `server start` 前做路径验证。最长 holder socket 比应用 socket 多 16 字节，用字节数与 103 比较。同一 49 字节的示例 `/var/folders/…/T`，本地 Node 字节探针计算 rc4 的 Core/holder 路径为 73/89 字节，本轮夹具为 104/120 字节，在 `/tmp/huhu-e2e.ABCDEF` 下为 75/91 字节，直接用 `/tmp` 还可再少 15 字节。这是示例推算，未将该示例当作 runner 实测。标签里 [HerdrCore.endpoint](../../packages/herdr-client/src/herdr-core.ts#L34) 的长路径回退仅覆盖显式传入 `socketName` 的路径，Agent 插件默认实例没有这一参数。Core CLI 的错误输出也被 Huhu 的 `stdio: "ignore"` 隐藏。
- [rc4 日志](macos-rc4.log#L693) 在 `macos-15-arm64` 上通过相同的包内 shell 验收，两个标签的 Herdr 锁文件相同，macOS 均下载 0.1.19 arm64。rc4 没有这层夹具 `XDG_RUNTIME_DIR`，子进程沿用原运行环境，Core 通常直接在系统临时目录下建 socket。[Windows 本轮日志](windows-retry.log#L1255) 实际为 4 通过、1 跳过，Windows Core 使用命名管道。两个对照与路径归因相符。rc4 同时使用旧产品标签和旧 runner 镜像，单独比较两次运行无法把失败归给 macOS 26。

## bundle 和 launchd 路径

`fetch-herdr.mjs` 验证下载摘要并复制全部解包目录，electron-builder 将其置于 `HUHU.app/Contents/Resources/herdr/darwin-arm64`。Electron supervisor 优先选择其中顶层 `herdr-core`，Core 0.1.19 的上游归档打包逻辑同时提供顶层可执行文件和 `Herdr Core.app`。上游 `core_executable()` 对顶层可执行文件保留原路径，其 serve 子进程在本地 macOS 上尝试通过 `launchctl bootstrap gui/<uid>` 和 kickstart 启动，失败时记录 `core.log` 并尝试直接启动。socket 字节校验发生在此之前。日志没有观察到 bundle 缺失、签名拒绝、launchd 失败或 Core 协议错误。3.2 秒的失败耗时也早于 Huhu 15 秒启动超时，但不能排除快速的 spawn 或 hello 错误。

## 给 Lead 的最小验证

1. 在当前 `Test the packaged executable` 步骤、原命令之前添加以下 macOS 条件分支。保留随后原有的 Playwright JSON 计数检查。无需更改产品标签、`HUHU_HERDR_BIN`、伪造 HOME 规则或增加自动重试。

   ```bash
   if [[ "$RUNNER_OS" == macOS ]]; then
     node --input-type=module -e 'import os from "node:os"; const n = Buffer.byteLength(os.tmpdir()); console.log({ tmpdirBytes: n, projectedHolderSocketBytes: n + 71 });'
     export TMPDIR=/tmp
   fi
   ```

   预测是原 `tmpdirBytes > 32`，而短路径下原用例可以真实启动 Core、通过 `connected` 并验证终端输出。若实测路径不超限，长度归因即被削弱。把 `TMPDIR` 的修改限定于该测试步骤，应用和夹具继续在临时根下各自创建私有目录。
2. 若缩短路径后仍失败，先核对包内顶层二进制的可执行位、架构及版本。再用**独立**的一对长路径／短路径及独立状态目录调用包内 Core 的启动 CLI，保留退出码、stdout/stderr、socket 是否出现和状态目录里的 `core.log`，结束探针时只停止该探针创建的实例。长路径预期报 `socket path … too long`，短路径若仍失败应按实际 Core 日志查 launchd、bundle 或 dylib。不要在 E2E 的 socket 上预启动 Core，否则会掩盖应用端自启动故障。

本次只核对了现有日志、标签源码、上游参考树和本地路径长度。未调用 Herdr Core 或 GitHub CLI，未修改源码或工作流，未运行打包、E2E 或真实 macOS 探针。
