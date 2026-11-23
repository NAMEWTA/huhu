# task01 执行报告

状态 `done`。Worker `t1gn`，Lead `t3p`。任务为 `.agents/system/herdr-core/2026-11-23-platform-release/t1gn/task01.md`，工作区 `/home/wta/projects/huhu`，分支 `main`。按 Lead 后续指令将报告写入本路径。

## 产物

- 新增 [.github/workflows/preview-platforms.yml](../../.github/workflows/preview-platforms.yml)。核对时文件 SHA-256 为 `9ccd6270f349acda3670942703bf09d7d0bc8450b2cd232e84fe340ccb2d60f6`。工作树尚未提交。
- 手动输入 `release_tag` 只接受 `v0.0.2-rc.1`。签出完整标签引用，验证标签与 HEAD 均解析到 `e14bc4c790c0afb6f5e75a25bbbb740a2202be25`，并核对根版本、工作区版本和实际 Node 平台架构。构建命令把已核验的源码提交传给标签里的 `write-build-info.mjs`，避免手动调度的工作流提交写入应用元数据。CI 日志及各平台 artifact 都保存 build-info。
- 矩阵沿用 `windows-2022` x64 和 `macos-15` arm64。沿用冻结安装、Windows Go、锁定的 Herdr 下载与校验、notices、完整构建、electron-builder 的原 beforePack 及 SHA-256 脚本。rc4 的历史日志 `macos-rc4.log` 记录 `macos-15-arm64` 镜像、arm64 Node 和 darwin arm64 electron-builder 输出。
- 每个平台用其解包后的应用运行原 `pnpm e2e:packaged` 配置。标签包含四个默认用例及一个凭据条件用例。四个默认用例覆盖笔记／任务／导出、随包 Core 终端、随包 CLI 和自动化派遣。发布要求各平台的实际 Playwright 结果为 4 通过、1 跳过、0 失败、0 flaky。完整 lint、typecheck 和 test 的门禁仍由原 CI 和原发布流程执行。
- 两个平台通过打包测试后分别上传安装包、校验清单和构建元数据。发布 job 要求两平台均成功，从同一 GitHub Actions 运行下载工件并逐项验证。它用 GitHub API 解析远端标签对象，要求现有 Release 已发布且可编辑，并对照 GitHub 附件摘要核对现有校验记录。它会沿用 SHA-256 相同的安装包，拒绝同名异内容，上传缺失的 exe/dmg，再合并保留 Linux AppImage 和 deb 的条目。发布 job 失败时，各平台 artifact 可继续用于重试。Release 正文由 Lead 处理。
- 更新 `SHA256SUMS.txt` 时，先上传并核验合并清单，随后删除原清单并将已核验的临时附件改名。GitHub 的删除与改名是两个请求，中断可能令正式清单名称短暂缺失，已核验的 `SHA256SUMS.pending.txt` 会留在 Release，同一次运行重试 publish job 可完成改名。安装包上传和校验清单替换均使用 `gh`，发布 token 仅来自步骤环境。

## 已运行的核对

- 用仓库现有 `yaml` 2.9.1 解析工作流并检查触发方式、矩阵、权限、发布依赖以及 shell 中无 Actions 表达式展开。各 shell 步骤通过 `bash -n`，Node 内嵌片段通过语法检查，新工作流无 diff 空白错误。
- 用 `git rev-parse` 和 `git show` 核对标签提交、包版本与打包 spec。执行输入验证时，目标标签通过，另一个 rc、完整引用字符串、带换行的值和带 shell 语法的值均拒绝。用模拟 Playwright JSON 验证 4 通过、1 跳过通过计数门禁，额外跳过、失败或 flaky 均令门禁失败。
- 用归档 Release 附件摘要和临时安装包模拟 `gh` 响应，执行了工作流内嵌的发布代码。首发、无变更重试、同名异内容拒绝、标签移动、Release 不存在、工件损坏或缺失、部分安装包上传失败、合并清单暂存失败，以及清单推广中断后重试均符合预期。合并结果保留两条归档 Linux 校验记录。

## 未运行的验证

本次未运行 actionlint、GitHub Actions 调度、依赖安装、构建、打包、E2E、全仓 lint、typecheck 或 test，也未调用线上 Release 写操作。两平台的真实产物和 Playwright 计数须以 Actions 执行结果为准。
