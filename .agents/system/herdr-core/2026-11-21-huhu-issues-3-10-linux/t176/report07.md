# t176/task07 · 隔离 HOME 中的 Volta 探测递归

Lead 为 `t3p`，分析基于 integration 的 `5fefa5077eb24f5bbf7a5cf667ac071b0a8d4938`、工作树中的 task06 夹具及 t17s 已有运行产物。只读核对了运行脚本、仓库调用路径、实际符号链接与目标 ELF、Volta 安装记录和隔离目录。

## 结论

洪流 runner 用 `env -i` 清空环境并设置新 HOME，但把宿主 PATH 原样追加到固定 Node 目录后，仍会找到真实用户目录里的 Volta shim。由于 `VOLTA_HOME` 未随之传入，shim 在隔离 HOME 里没有 Codex 或 Pi 的安装记录。Volta 2.0.2 的外部命令回退只从 PATH 移除**当前** Volta home 的 shim 目录，留下了实际调用它的宿主 shim 目录。同名命令回查再次命中相同 shim，每一层都创建后代并等待。Huhu 主动探测提供初始三个入口，5 秒超时只覆盖它直接创建的子进程，不能回收已经派生的整条链。Core 的停止回执和这些 Engine 版本探测有各自的进程生命周期。

## 本机证据

| 项目 | 只读观察 |
| --- | --- |
| 主机 PATH 中的首个 `codex` 和 `pi` | `/home/wta/.volta/bin/codex` 和 `/home/wta/.volta/bin/pi`，均为指向绝对路径 `/home/wta/.volta/bin/volta-shim` 的符号链接。二者解引用到同一 ELF，Build ID 为 `d866aec8f79ef53e2a793711594890cf6a41fbbf`。静态字符串包含 `src/volta-shim.rs` 和版本 `2.0.2`。 |
| runner 固定的 Node 目录 | `/home/wta/.volta/tools/image/node/24.21.0/bin` 有实际 Node ELF，目录内没有 `codex` 或 `pi`。当前 PATH 中 Node 24.22.1 目录下还有一个 Codex JS 入口，排序在宿主 Volta shim 之后。项目和主仓的 `node_modules/.bin` 均无两个名字。 |
| 真实用户的 Volta 注册 | `/home/wta/.volta/tools/user/bins/codex.json` 指向 `@openai/codex` 0.171.0，shim 最终注册的包入口解引用到 `.../lib/node_modules/@openai/codex/bin/codex.js`。`pi.json` 指向 `@earendil-works/pi-coding-agent` 1.5.2，包入口解引用到 `.../lib/node_modules/@earendil-works/pi-coding-agent/dist/bundle/cli.js`。两个包入口都是 Node 脚本。 |
| 隔离 HOME 的残留 | `/tmp/hc-t.t7sodX/home/.volta/layout.v4` 和 `volta.lock` 存在，`tools/user/bins` 与 `tools/user/packages` 为空。隔离目录自动生成的 Node、npm 等基础 shim 也链接到宿主的同一 ELF。这与 Volta 正在用隔离 HOME 初始化布局相符。 |
| t17s 已有运行 | 洪流日志记录 568 个有效样本、p95 32.9 ms、用例通过。Lead 确认独立 Core 已停止，随后逐成员核对了仍存活的 Electron 进程组 `2210964` 持有该次隔离 HOME，并由 Lead 回收。没有保留该组完整的 `/proc` 快照，原运行的逐项 PATH 和 PID 数量在本报告中以 runner 和 Lead 观察为依据。 |

t17s 已有日志位于 `/home/wta/projects/huhu/temp/issue-evidence/huhu-2026-11-22/followup-flood-4a54f0a9fc0a2dbc46aae816b4c0ae9399a59b73.sqtD8H/run.log`。

## 调用路径

1. `temp/final-audit/run-perf-diagnostic.sh:23–38` 把固定 Node 目录置前，随后追加调用者 PATH。 `env -i` 后重设 `HOME`、`USERPROFILE`、XDG 和 TMPDIR，未设置 `VOLTA_HOME`。`run-perf-diagnostic.py:1–3` 直接以固定 Node 和 Playwright CLI 入口启动。 `tests/e2e/perf.spec.ts:333–343` 将该环境交给 Electron，仅另外指定本次 Vault、Core 二进制和专用 runtime。 `apps/desktop/src/main/engine-supervisor.ts:135–149` 将 PATH 和 HOME 继续传给 Engine utility process。
2. 全新 Vault 默认启用 Agent 提供方，见 `plugins/agent-cli/src/shared/settings.ts:29–39`。Agent 插件启动的 `snapshot()` 只查路径，但 Automations 注册的 `void refreshClis()` 会主动调用 `detector.detect()`。其探测结果用于形成可用 CLI 集合。工作台的显式刷新走同一 detector，任务扫描也有刷新入口。见 `plugins/agent-cli/src/engine/index.ts:84–87,275–285` 和 `apps/engine/src/boot.ts:447–463`。
3. `plugins/agent-cli/src/engine/detect.ts:136–170` 优先选取 PATH 中首个可执行入口，同一个 detector 合并并行刷新。路径检查用 `statSync` 和可执行权限，跟随符号链接但执行时保留 shim 路径和命令名。启动探针分别为 Codex `--version`、Pi `--version` 和 Pi `--help`。固定的 `HUHU_CODEX_DISPATCH_BIN` 注入派遣配置，通用版本探测仍用宿主 PATH 的结果。见 `packages/herdr-client/src/executable.ts:4–32`、`detect.ts:52–90` 和 `apps/engine/src/boot.ts:298–304`。
4. Volta 从 `argv[0]` 识别命令名，从 `VOLTA_HOME` 或 Unix HOME 下的 `.volta` 找注册信息。隔离 home 无包注册时，外部命令回退使用同名不带目录的程序，并调用 `System::path()` 过滤当前 home 的 shim 目录。宿主路径并未匹配该过滤项，所以下一层仍解析到宿主 shim。执行器会设置 `_VOLTA_TOOL_RECURSION=1`，但该版本的 Codex/Pi 通用外部命令分支没有在回退前检查它。每层调用 Rust `Command::status()` 创建子进程并等待退出，形成多条同名递归链。布局缺失时，shim 入口还会调用布局初始化，解释为何隔离目录在运行或外层清理后可能再次出现。 [Volta home 选择](https://github.com/volta-cli/volta/blob/v2.0.2/crates/volta-core/src/layout/mod.rs#L19-L29) · [Unix 默认目录](https://github.com/volta-cli/volta/blob/v2.0.2/crates/volta-core/src/layout/unix.rs#L5-L14) · [命令名和内置/外部入口](https://github.com/volta-cli/volta/blob/v2.0.2/crates/volta-core/src/run/mod.rs#L64-L106) · [外部命令回退](https://github.com/volta-cli/volta/blob/v2.0.2/crates/volta-core/src/run/binary.rs#L59-L80) · [PATH 过滤](https://github.com/volta-cli/volta/blob/v2.0.2/crates/volta-core/src/platform/system.rs#L10-L21) · [下发命令](https://github.com/volta-cli/volta/blob/v2.0.2/crates/volta-core/src/run/executor.rs#L164-L184) · [布局初始化](https://github.com/volta-cli/volta/blob/v2.0.2/src/common.rs#L10-L21)。
5. Huhu 的 `execFile` 设置 5 秒超时，未直接管理后代进程组。Node 的超时实现关闭管道并给该 `ChildProcess` 发送信号。递归后代仍可能继续，解释了 5 秒之后以及 Core 停止后的残余进程。task06 的 RPC 作用于本次 Core socket 与对应 holder。 [Node execFile 超时实现](https://github.com/nodejs/node/blob/v24.21.0/lib/child_process.js#L412-L431) · [夹具清理实现](../../tests/e2e/perf.spec.ts#L292)。

## 最小修复建议

- **先修诊断 runner。** 将 `env -i` 的 PATH 改为固定 Node 目录加 Linux 系统工具目录 `/usr/bin:/bin`，保留已固定的 Playwright 入口、隔离 HOME/XDG 和真实终端命令。静态核对这些目录包含本轮使用的 DBus、钥匙串、Xvfb、Python 和 POSIX 管道工具。若某个具体夹具需要 provider，使用它自己的已固定直接入口或受控夹具目录。这个改动切断错误 PATH 与隔离 HOME 的组合。把真实 `VOLTA_HOME` 塞回夹具会重新使用真实工具注册，`VOLTA_BYPASS` 也仍依赖同一个系统 PATH 过滤。
- **产品缺陷可单独修。** 当前 Automations 启动前置只消费可用性和路径，却会启动版本和帮助命令。可把这一入口改成按现有位置解析更新可用性，并保留设置页的显式版本探测。显式外部探测还需要覆盖后代进程的生命周期，尤其是 Engine 关闭与探测超时。仅延长超时不会切断递归。fixture PATH 修正可以先独立交付。

本轮只落盘此报告。未执行 Volta、Codex、Pi、版本探测、测试或进程清理。未实跑修正后的 runner。

Lead验收：只读根因与本机shim/隔离目录相符，runner已切换受控PATH。t17w未再递归或清理错误，但尾标性能另失败。调查任务接受，后续task08诊断尾标。
