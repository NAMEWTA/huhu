# task02 执行报告

状态 `done`。Worker `t1gn`，Lead `t3p`。变更位于工作区 `/home/wta/projects/huhu` 的 [.github/workflows/preview-platforms.yml](../../.github/workflows/preview-platforms.yml)，基线 `57646e4f`，变更文件 SHA-256 为 `9393ef3fd327684b39f4e53ccc6bcbfd48c3d6e32c07ce8d9e6c831c1059b92d`。

- Windows 首轮日志显示下载步骤由 Git Bash 执行，`fetch-herdr.mjs` 下载 ZIP 后调用 `tar -xf D:\a\…`，GNU tar 将盘符当作远端主机并报 `Cannot connect to D`。本地 GNU tar 1.35 通过禁用网络调用的盘符路径探针复现相同错误。原发布日志 `windows-initial.log` 第 318–325 行记录同版本 ZIP 在默认 PowerShell 下成功解压。 [首轮 Windows 日志](https://github.com/NAMEWTA/huhu/actions/runs/45134418196/job/137557157090) · [GNU tar 手册](https://www.gnu.org/software/tar/manual/html_section/file.html)
- Windows Core 下载步骤切换到 `shell: pwsh`，使用 `$env:TARGET` 将 `win32-x64` 传给原锁定脚本。macOS 下载仍由 Bash 执行，runner 改为 `macos-26`，保留 `darwin-arm64` 目标与架构断言。 [官方 Runner Images 列表](https://github.com/actions/runner-images/blob/main/README.md#available-images)
- 排查了标签的 `beforePack`、Windows PTY 施行脚本和锁定的 electron-builder 26.18.0。Windows PTY 步骤已直接调用 PowerShell 与 Go，Electron ZIP 由应用打包库内的 ZIP 解压代码处理，NSIS 归档走其 7za 工具路径。未发现这些步骤调用 PATH 中的 `tar`，因此 shell 调整限定在 Core 下载步骤。
- 通过 YAML 结构对照、`git diff --check` 和 macOS Bash 参数探针。结构对照验证了 runner 标签和拆分的两个下载步骤之外的内容一致，标签仍解析为 `e14bc4c790c0afb6f5e75a25bbbb740a2202be25`。

未运行 Windows PowerShell 实机验证、macOS runner、构建、E2E 或全仓检查。此次只修改本地工作流，尚未提交、重新调度或变更任何远端运行。
