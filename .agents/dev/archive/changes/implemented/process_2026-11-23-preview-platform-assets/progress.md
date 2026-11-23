# 补齐预览版 Windows 与 macOS 附件

用户要求将 v0.0.2-rc.1 的 Windows/macOS 与 Linux 同步发布，并明确使用 GitHub Actions 构建。沿用现有标签 e14bc4c790c0afb6f5e75a25bbbb740a2202be25，不移动标签、不拿旧版制品改名。

旧 v0.0.1-rc.4 已有 win32-x64 exe 和 darwin-arm64 dmg。当前 tag release run 45126902160：Windows typecheck 成功，全量测试 2124通过、27失败、103跳过，未进入打包；macOS15尚未分配runner；Linux typecheck步骤取消。原始日志保存在 temp/cross-platform-release，保留原CI结论。

新增手动补包入口仅证明固定标签的构建和包内 E2E，不替代原完整 CI。需要 Windows/macOS 两份附件实际上传并核对大小与摘要，合并 Linux 的原SHA256SUMS后才算完成。实施者 t1gn，具体见 .agents/system/herdr-core/2026-11-23-platform-release/。

## Actions 首轮修正

45134418196 在 Windows 获取 Core 时失败：Git Bash 的 GNU tar 将盘符 D: 当作远程地址。已限定该步骤使用 PowerShell；macOS 改用 macos-26 ARM64。独立审查确认可重新调度；空 starter 上传占位的恢复需 Lead 按附件 ID 核对后清理，完整异摘要附件仍禁止覆盖。两平台实际构建和发布尚未完成。

## 第二轮构建

工作流提交 `8b884993`，运行 https://github.com/NAMEWTA/huhu/actions/runs/45135526567 。Windows 作业 137560775311 已成功：包内 E2E 4 passed / 1 skipped / 0 failed / 0 flaky。macOS 已开始打包。为释放 macOS runner，取消了 24 个提交已是当前 HEAD 祖先的旧 CI；原结果仍保留于 Actions，未修改 CI 规则。取消清单在 temp/cross-platform-release/stale-ci-confirmed.json。原 Windows 全量测试失败仍未宣称通过。

## 交付完成（2026-11-23）

第三轮 [45138155622](https://github.com/NAMEWTA/huhu/actions/runs/45138155622) 构建和 publish 均成功。Windows/macOS 各4通过、1个Linux专属用例条件跳过、零失败/零flaky。macOS 原临时根48字节，夹具预计holder socket119字节超过103上限；仅测试步骤改TMPDIR=/tmp后真实Core启动及回显通过，产品源码和标签均未改。

[Release](https://github.com/NAMEWTA/huhu/releases/tag/v0.0.2-rc.1) 已补充 exe/dmg，保留原 Linux 两包，合并清单四项与远端digest逐项一致；两份新包摘要同时匹配runner构建日志。详见 evidence/release-assets.json 和 evidence/SHA256SUMS.txt。发布说明已更新，不宣称原全量CI通过；用户实机安装、签名/公证未验证。本次工作流和记录只在main，不新增分支。

恢复注意：GitHub若留下同名空starter附件，先核对Release ID和附件ID，再清理该空占位并单独重试同次运行的publish；禁止覆盖完整的异摘要附件。

归档主类型process，原路径changes/2026-11-23-preview-platform-assets，最终archive/changes/implemented/process_2026-11-23-preview-platform-assets。
