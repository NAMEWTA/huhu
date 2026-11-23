# 任务报告

- 共享根 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux
- terminal_address — t6
- task — task03.md
- 任务文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t6/task03.md
- 报告文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t6/report03.md
- 执行结果 — done

## 结论

Linux 私有 Git 同步复用 Windows askpass 的环境清理。HTTPS 回归确认继承的启动器被覆盖，curl trace 文件未生成。修复后的 POSIX 取消会关闭真实 HTTPS 连接并删除临时启动器。

Mail AI 把可移植字段检查与网络验证分开。保留、替换、清除和停用保存时都会核对可读取的当前 Key，替换还核对新 Key。停用保存可在 Key 暂不可读取时完成，保留和清除操作均无额外网络请求。用真实 HTTP 设置接口和导出的 Vault 包验证了合成 Key 保护。

## 产物与改动

共享工作树 `/home/wta/projects/huhu/temp/issue-worktrees/safe-git`，分支 `impl/huhu-issues-3-10-safe-git`，基础 HEAD `5021f54ce9babcf039c84c3a5b77ae32596f45cd`。Core 重启后按 topic 和 Lead 授权先后在 `t1b` 和 `t1g` 接续，报告沿用任务身份 `t6/task03.md`。

- Versioning 候选 `decfca9048817e9d08154aa5b0121f8fb7dcabcd`。包含共用 Git 环境、POSIX 私有 Git 的进程组取消和 HTTPS 回归。Windows 使用命名管道，POSIX 沿用当次 Git 进程的 askpass 专用环境变量。证据位于候选树的 `.agents/dev/archive/changes/implemented/feature_2026-11-19-issue-9-safe-accounts/evidence/P4.1-posix-git-askpass.md`。
- Mail 候选 `cccaf2ead4aa2bef100913bd5020ae2a54646680`，父提交为 Versioning 候选。包含可移植字段检查、真实 Engine 回归，以及四个同步、OAuth、附件和发件测试替身对生产能力目录选项的转发。发件失败夹具在 Vault 文件写入接口拒绝认领，覆盖独占创建路径。证据位于候选树的 `.agents/dev/changes/2026-11-19-issue-8-mail-module/evidence/S7.1-ai-portable-settings.md`。
- 已检查两个候选的文件范围，工作树代码与末端候选逐字节一致，普通索引无暂存。证据由临时索引加入两个提交树。

## 验证

Ubuntu 26.04.1 LTS x64，Node 24.21.0。所有测试在独立临时 `XDG_RUNTIME_DIR` 执行。日志在 `/tmp/huhu-t6-p03.82OUG8/`。用例使用临时 Vault、合成密钥和回环服务。

| 验收要求 | 实际检查与结果 | 证据位置 |
| --- | --- | --- |
| Git 修复前失败 | Linux HTTPS 取回和推送生成 curl trace 文件，断言期望文件不存在，实际存在。单独补上环境清理后，取消请求仍未在八秒内关闭 HTTPS 连接。 | `red.log`、`cancel-red.log` |
| Git 修复及全套 | Versioning **69 通过、0 失败、0 跳过**，共 7 个文件。HTTPS 专项实际通过，覆盖继承 askpass 覆盖、无 curl trace、重定向拒绝、取消断连及清理、后续取回。 | `versioning.log`、`green.log` |
| Mail 修复前失败 | 先保存合成 Key，再提交带当前 Key 的停用保留编辑。普通设置读取返回含合成 Key 的响应，`text.includes(key)` 断言实际为 true。 | `red.log` |
| Mail 修复及全套 | Mail **54 通过、0 失败、1 跳过**，共 13 个文件。既有的 AI 选区用例按 Windows 条件跳过。设置回归覆盖三种 Key 操作、正常联网验证、停用保留和不可读取场景、重开、清除及导出导入的文件内容。发件定向复跑确认认领写失败时连接数与持久认领数均为 0。 | `mail-resumed.log`、`outbox-green.log` |

`pnpm lint`、`pnpm format:check`、`pnpm knip` 均退出 0。根类型检查原先在并行运行时被内存压力中断。恢复后按照同一脚本的两个阶段执行，先用 `pnpm --filter "./vendor/*" --workspace-concurrency=1 run build:types` 生成三个 vendor 类型，再用 `pnpm -r --workspace-concurrency=1 run typecheck` 串行检查 24 个工作区，全部退出 0。日志为 `resumed-lint.log`、`resumed-format:check.log`、`resumed-knip.log` 和 `resumed-typecheck.log`。恢复后的 Vitest 均使用 `--maxWorkers=3` 串行执行。

## 阻碍与接续

无待处理阻碍。末端候选 `cccaf2ead4aa2bef100913bd5020ae2a54646680` 包含两项修复和两份证据，可按 topic 的快进约定验收。

## Lead 验收

待 Lead 验收。

Lead 验收（2026-11-21）：通过。`decfca90`、`cccaf2ea` 与工作树一致，已快进到 safe-git 并快进集成。两项均有先红后绿证据。遗留：`plugins/mail/test/ai-selection-engine.test.ts` 仍按 win32 跳过（task02 时基线尚无该文件），转入后续任务。终端 t1g 关闭；task04（P8.3）改由新 worker 接手。
