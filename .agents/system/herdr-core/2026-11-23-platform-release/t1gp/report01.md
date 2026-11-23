# 补齐预览版 Windows 与 macOS 附件的独立审查

`done`，审查者 `t1gp`，Lead `t3p`。工作区 `/home/wta/projects/huhu`。审查 `57646e4f` 的首版和随后落盘的 task02 修订。修订工作流 SHA-256 为 `9393ef3fd327684b39f4e53ccc6bcbfd48c3d6e32c07ce8d9e6c831c1059b92d`，与实施报告一致。目标标签 `v0.0.2-rc.1` 解析到 `e14bc4c790c0afb6f5e75a25bbbb740a2202be25`。 [审查任务](../../.agents/system/herdr-core/2026-11-23-platform-release/t1gp/task01.md) · [首版报告](t1gn-report01.md) · [修订报告](t1gn-report02.md)

## 结论

task02 的 Windows PowerShell 改动覆盖首轮已定位的下载故障，`macos-26` 矩阵保留 arm64 校验。静态检查在首发路径上未发现须阻止调度的新问题。发现一项 P2 发布恢复缺口，GitHub 若留下空的 `starter` 附件，同一次运行单独重试 `publish` 也会失败。两平台构建、各自 4 通过 1 跳过和线上附件仍待真实运行回执。

## 规格与故障路径

- **首轮 Windows 阻断，修订待 runner 验证。** `45134418196` 的 Windows job `137557157090` 通过了标签、HEAD、版本、架构、Go 和冻结安装，在第 11 步获取 Herdr 失败。Lead 和 task02 报告记录的错误是 GNU tar 将 `D:` 解析成远程主机。用 GNU tar 1.35 执行 `tar --rsh-command=/bin/false -tf` 并传入同形的 `D:` 路径，独立复现 `Cannot connect to D: resolve failed`，全程没有网络连接。原同标签 Windows 作业的第 318 至 325 行显示该 ZIP 在 `pwsh` 下成功解压。修订仅给 Windows 下载步骤指定 `shell: pwsh` 并传入 `$env:TARGET`。原标签的 Windows `beforePack` 直接调用 PowerShell 和 Go，未发现其余 Windows 打包步骤存在同一条系统 `tar` 调用。 [工作流](../../.github/workflows/preview-platforms.yml#L72) · [首轮作业快照](current-jobs.json) · [原 Windows 日志](windows-initial.log#L318) · [首轮 Windows 作业](https://github.com/NAMEWTA/huhu/actions/runs/45134418196/job/137557157090)
- **macOS runner 待分配和实测。** 首轮快照中的 `macos-15` job `137557157496` 处于 `queued`，Lead 随后取消首轮。修订用标准 arm64 `macos-26` 标签，保留 `darwin-arm64`、`.dmg`、应用内可执行路径与 Node 平台架构断言。归档 rc4 日志中的 4 通过来自较早源码与 macOS 镜像。 [工作流](../../.github/workflows/preview-platforms.yml#L28) · [首轮作业快照](current-jobs.json) · [GitHub Runner Images](https://github.com/actions/runner-images/blob/main/README.md#available-images) · [rc4 日志](macos-rc4.log#L685)
- **P2 · 上传失败留下的空附件会卡住重试。** GitHub 的上传接口遇到上游 502 时可能留下 `state=starter` 的空附件。重试时，脚本对任何已存在的同名安装包和 `SHA256SUMS.pending.txt` 调用 `verify_asset`，随即因状态或摘要不符退出，上传步骤无法继续。用 Release 快照、合成的安装包和内存中的 `gh` 响应运行工作流原 Python 代码，分别模拟 dmg 与 pending 清单上传后留下空附件。两种情形再次运行均报 `Missing, incomplete or different release asset`，没有进一步的发布操作。现有快照没有这类占位，首发可调度。若实际遇到该状态，应按 Release ID 和附件 ID 确认预期名称与空 `starter` 状态，清理该占位后用同次构建的工件单独重试 `publish`。完整附件的同名异摘要保护应保留。 [状态检查](../../.github/workflows/preview-platforms.yml#L201) · [重试分支](../../.github/workflows/preview-platforms.yml#L245) · [GitHub Release 附件 API](https://docs.github.com/en/rest/releases/assets#upload-a-release-asset)

## 身份、门禁与发布权限

- 签出固定标签前验证输入，签出后核对 Git HEAD、标签、版本和实际平台架构。`pnpm build` 将 `SOURCE_COMMIT` 传给标签里的构建元数据脚本，随工件上传的 `build-info.json` 再由发布作业核对。锁定的依赖安装、Windows Go 下载、Herdr SHA-256、原 electron-builder 配置和两个解包应用入口均得到复用。 [工作流](../../.github/workflows/preview-platforms.yml#L46) · [构建元数据脚本](../../scripts/write-build-info.mjs#L8) · [打包配置](../../apps/desktop/electron-builder.yml#L36)
- 标签的包内用例包含 4 个默认场景和 1 个需启用隔离 Linux 凭据环境的用例。工作流使用锁定的 Playwright 1.65 JSON 报告，检查 `expected=4`、`skipped=1`、`unexpected=0`、`flaky=0`，两个平台均须满足。与主分支基线 `29585854` 比较，原 `ci.yml` 和 `release.yml` 无差异。历史 Windows 全量测试仍有 27 项失败。 [计数门禁](../../.github/workflows/preview-platforms.yml#L109) · [包内用例](../../tests/e2e/packaged/packaged.spec.ts#L241) · [原 Windows 日志](windows-initial.log#L3185)
- 包装作业使用 `contents: read`，发布作业依赖矩阵成功并单独授予 `contents: write`。发布校验同一运行的两个制品及远端标签，并要求现有 Release 已发布且可编辑。15:55 +08:00 的本地快照显示 Release `455076434` 可编辑，附件为两份 Linux 安装包及 `SHA256SUMS.txt`。用快照中的两条 Linux 摘要重建原清单，得到相同的 197 字节和 SHA-256。内存验证覆盖首发合并、相同工件重试无操作，以及正式清单删除后改名失败再重试恢复。推广期间可能短暂无正式清单，已验证的 pending 可恢复。若已部分上传，沿用同次运行的工件，重新构建会写入新的 `builtAt` 并可能触发同名异摘要保护。 [权限与工件](../../.github/workflows/preview-platforms.yml#L127) · [清单推广](../../.github/workflows/preview-platforms.yml#L262) · [Release 快照](current-release.json)

## 已运行与未运行的验证

独立解析 YAML 后与 `57646e4f` 逐项比较，差异限于 macOS runner 标签和按平台拆分的 Herdr 下载。14 个 Bash 步骤通过 `bash -n`，两段内嵌 JavaScript 通过 `node --check`，工作流 `git diff --check` 通过。运行了盘符命令解析与发布故障的离线探针。原实施报告明示其模拟验证和未运行的项目，修订报告所列摘要与本次审查文件一致。

未执行 GitHub 调度或 Release 写操作，未运行 Windows PowerShell、macOS runner、依赖安装、构建、打包或 E2E，也未运行全仓验证。线上状态取自 Lead 保存的本地快照和首轮取消回报。

Lead 验收：已核对报告与工作流 SHA，接受本轮静态结论。实际发布由 Actions 45135526567 继续验证。
