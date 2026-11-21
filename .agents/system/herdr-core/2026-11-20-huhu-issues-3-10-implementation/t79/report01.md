# #9 P0.2 本机初始回收记录的中断恢复

- 共享根 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation
- terminal_address — t79
- 任务 — [task01.md](D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t79/task01.md)
- 报告 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t79/report01.md
- Core — Windows 本机 wta / 346bd5608735e3fcb27f9d01f5c8008e / 0.1.21，`HC_TERMINAL_ID=t79`
- 执行结果 — done。凭据工作树干净，本任务无遗留命令 pane。
- 分支 — `impl/huhu-issues-3-10-credentials`
- 父提交 — `86f810e8ba42d43acb6e300737647dca85051741`
- 候选提交 — `47f854b43b1c8f66e6d5aac6423278d4eaf547b5`

## 实现

首次处理带认证意图的复制库时，持锁写者在规范作用域的同级目录写入、刷新并回读校验完整的 `initially-unbound.json`，随后用一次目录重命名发布证明和作用域。密钥与密文创建仍在发布之后。证明继续记录本机实例与插件的作用域，以及具有认证意图的实体和准确 revision 的摘要。目录发布方式沿用 Vault 导入现有的同级暂存模式。 [实现](D:/Document/code/huhu/temp/issue-worktrees/credentials/packages/kernel/src/credentials/versions.ts:64) [Vault 导入](D:/Document/code/huhu/temp/issue-worktrees/credentials/packages/vault/src/package/package.ts:161)

在规范作用域尚未发布时，重开的写者只移除该作用域的暂存证明文件与空暂存目录，并按当前 Vault 定义重建证明。写入或重命名的 I/O 错误继续由原保存路径报告为 `storage-failed`。暂存清理使用常规文件与目录检查，异常类型或多余内容会中止初始化。若规范作用域已存在，旧版或既有作用域的证明缺失、截断或 scope 不符时，仍对无法确认的引用暂停回收。仅原样恢复有效证明才使这些引用重新可判定。 [回收检查](D:/Document/code/huhu/temp/issue-worktrees/credentials/packages/kernel/src/credentials/module-credentials.ts:348) [保守性回归](D:/Document/code/huhu/temp/issue-worktrees/credentials/packages/kernel/test/credentials.test.ts:205)

## Windows 验证

Windows x64 build 26300，Node 24.21.0，Vitest 3.2.7，tsx 4.23.15。父版和候选版分别从精确 Git SHA 归档验证，内部工作区依赖指向各自归档的源码，外部依赖复用集成检出的锁定链接。集成锁比候选锁仅多一个无关应用的 tsx 引用。红绿使用相同 SHA-256 的测试与子进程夹具。数据为隔离 Vault 和合成保护后端。 [环境](D:/Document/code/huhu/temp/issue-baseline/credentials-evidence/t79-credential-init-recovery/setup.log) [锁差异](D:/Document/code/huhu/temp/issue-baseline/credentials-evidence/t79-credential-init-recovery/integration-lock-diff.log) [链接](D:/Document/code/huhu/temp/issue-baseline/credentials-evidence/t79-credential-init-recovery/candidate-links.log) [哈希](D:/Document/code/huhu/temp/issue-baseline/credentials-evidence/t79-credential-init-recovery/verified-sha256.log)

| 场景 | 观察 |
| --- | --- |
| 父版独立探针与红灯 | 独立子进程分别在写前和截断后退出 75、76。两个回归在父版均失败。重绑后清空仍有 3 个密文、2 把钥匙，`recover() = false`，规范作用域已出现。 [原探针](D:/Document/code/huhu/temp/issue-baseline/credentials-evidence/t79-credential-init-recovery/baseline-independent-probes.log) · [红灯](D:/Document/code/huhu/temp/issue-baseline/credentials-evidence/t79-credential-init-recovery/red.log) |
| 候选退出 75、76 | 中断时可移植定义逐字节一致，只有原库的 2 个密文和 1 把钥匙，规范作用域未出现。重试后暂存已清除，证明与精确作用域及两条原 revision 对应。关闭写锁再重开，重绑认证成功。清空后立即只剩 2 个密文、1 把钥匙，`recover() = true`，相邻项仍待重配，原库两项均能认证。 [候选探针](D:/Document/code/huhu/temp/issue-baseline/credentials-evidence/t79-credential-init-recovery/candidate-independent-probes.log) |
| 发布边界与 I/O 重试 | 退出 77 时完整证明已可独立读取，密文、钥匙与可移植定义仍是原始状态。后续重开、重绑及清空均成功。另模拟发布重命名返回 `EBUSY`，子进程观察 `storage-failed` 并正常关锁，下一写者重试、清空并回收成功。 [候选探针](D:/Document/code/huhu/temp/issue-baseline/credentials-evidence/t79-credential-init-recovery/candidate-independent-probes.log) · [候选测试](D:/Document/code/huhu/temp/issue-baseline/credentials-evidence/t79-credential-init-recovery/kernel.log) |
| 既有引用和独立只读 | 既有作用域缺失或损坏的证明、错误 scope、丢失或损坏的已有快照均触发保守回收。独立只读子进程列举和取用各访问保护后端 0 次，取用在回调前以 `READ_ONLY_VAULT` 拒绝，写者可完成清空回收。 [候选探针](D:/Document/code/huhu/temp/issue-baseline/credentials-evidence/t79-credential-init-recovery/candidate-independent-probes.log) · [候选测试](D:/Document/code/huhu/temp/issue-baseline/credentials-evidence/t79-credential-init-recovery/kernel.log) |
| 原回归与静态检查 | 退出 71–74 及并发、取消和发布失败均通过。Kernel 8 文件 82/82，通过的凭据测试为 17/17。Kernel 类型、三份改动文件的格式与 lint、提交差异检查通过。 [候选测试](D:/Document/code/huhu/temp/issue-baseline/credentials-evidence/t79-credential-init-recovery/kernel.log) · [静态检查](D:/Document/code/huhu/temp/issue-baseline/credentials-evidence/t79-credential-init-recovery/checks.log) · [交付状态](D:/Document/code/huhu/temp/issue-baseline/credentials-evidence/t79-credential-init-recovery/delivery.log) |

归档目录下的复跑入口如下。

```powershell
node node_modules/vitest/vitest.mjs run --project '@huhu/kernel' packages/kernel/test/credentials.test.ts -t 'initial-proof-(before|partial)-write' --maxWorkers 1 --testTimeout 15000
node node_modules/vitest/vitest.mjs run --project '@huhu/kernel' --maxWorkers 2 --testTimeout 15000 --reporter verbose
node packages/vault/node_modules/tsx/dist/cli.mjs temp/independent-probes-fixed.mjs candidate
node node_modules/typescript/bin/tsc --noEmit -p packages/kernel/tsconfig.json
```

证据目录为 `D:/Document/code/huhu/temp/issue-baseline/credentials-evidence/t79-credential-init-recovery`。首轮全树解包因 Windows 对部分路径和链接的处理失败，改用列出所需文件的 SHA 归档完成验证。自动审批拦截了该次失败解包目录的递归清理，`parent/` 与 `parent.tar` 留在证据目录。 [归档路径清单](D:/Document/code/huhu/temp/issue-baseline/credentials-evidence/t79-credential-init-recovery/archive-paths.txt)

## 复核边界

已占用规范路径的旧版缺失或截断记录仍按既有作用域处理，相关回收继续延后。本轮验证覆盖 Windows 进程中断与合成保护后端，包括发布失败后的重试。生产宿主装配、原生保护适配器和物理掉电属于此验证证据之外。

## Lead 验收

待 Lead 核对候选提交与证据。
