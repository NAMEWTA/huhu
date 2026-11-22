# #9 P0.2 凭据材料回收与并发取用

- 共享根 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation
- terminal_address — t5t
- task — task01.md
- 任务文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t5t/task01.md
- 报告文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t5t/report01.md
- Core — Windows 本机 wta / 346bd5608735e3fcb27f9d01f5c8008e / 0.1.21，`HC_TERMINAL_ID=t5t`。发布时清单指向 `task01.md active`。
- 执行结果 — done

## 结论

- P1 已修复。复制实例首次在空的本机作用域保存时，记录已存在的配置意图所对应的精确实体和 revision 摘要。稍后重绑并清空一个实体，另一个实体仍可显示 `needs-reconfiguration`，写者在清空提交后即回收无引用的密文和钥匙。原实例两项认证仍然可用。
- P2 已修复。私有取用门面 `ModuleCredentials.use()` 通过 `Vault.assertWritable()` 限定为 Vault 写者，调用者在业务回调结束前持有该 Vault。只读句柄在进入本机读取前以 `READ_ONLY_VAULT` 结束。只读列表仍返回可移植定义，具有配置意图的用途显示 `temporarily-unavailable`，其余用途显示 `unconfigured`。

## 产物与改动

- 工作树 — D:/Document/code/huhu/temp/issue-worktrees/credentials
- 分支 — `impl/huhu-issues-3-10-credentials`
- 父提交 — `7174fc8d59693575cbc16227ec296acdd4c219e5`
- 已验证本地提交 — `86f810e8ba42d43acb6e300737647dca85051741`，工作树干净。
- 新增的 `initially-unbound.json` 位于注入的本机 Vault 实例和插件对应的现有私有目录内，记录版本、作用域摘要及实体与 revision 的摘要。回收在现有写者队列内先检查当前快照和在途固定版本，再用通过作用域校验的记录判定缺失快照是否可跳过。完好的旧格式快照可继续使用。快照遗失且缺少相应证据、记录损坏或作用域不符时，整次回收暂停。旧版本已建立的作用域，以及稍后导入的新 revision，可能仍需等引用集合可确定后才回收。
- `Vault.open` 只为可写句柄取得 `.huhu/writer.lock`，Engine 启动把 `readOnly` 透传给 Vault，P0.2 规格约束了唯一写者的配置和恢复流程。候选中 `ModuleCredentials` 的直接构造入口是测试夹具，Engine 装配时应沿用门面的写者生命周期合同。 [Vault 写锁](D:/Document/code/huhu/temp/issue-worktrees/credentials/packages/vault/src/vault.ts:196) [Engine 打开 Vault](D:/Document/code/huhu/temp/issue-worktrees/credentials/apps/engine/src/boot.ts:107) [取用门面](D:/Document/code/huhu/temp/issue-worktrees/credentials/packages/kernel/src/credentials/module-credentials.ts:308)

## 验证

环境为 Windows 11 x64 build 26300、Node 24.21.0、Vitest 3.2.7、tsx 4.23.15、Zod 4.6.7。证据目录为 `D:/Document/code/huhu/temp/issue-baseline/credentials-evidence/t5t-credentials-evidence/`。在父提交的隔离归档副本运行合成夹具，使用已有锁定依赖副本。两轮回归测试和子进程夹具的 SHA-256 一致，修复版文件的 SHA-256 对应已提交的工作树。

| 验收要求 | 实际结果 | 证据 |
| --- | --- | --- |
| P1 同一输入 | 父提交清空后 `recover=false`，仍有 3 个密文和 2 把钥匙。修复版重新打开复制实例后清空，提交后即剩原实例的 2 个密文和 1 把钥匙，`recover=true`，源端两个实体可认证。 | `parent-red.log`、`kernel.log` |
| 回收保守性 | 已重绑快照失踪、原实例快照失踪或损坏、定义损坏、回收记录损坏或作用域不符时均延后回收。原实例在快照缺失期间保存新配置，恢复快照后新旧配置均可认证。 | `kernel.log` |
| P2 同一输入 | 父提交的独立只读进程进入了一次保护后端读取，写者清空后得到 `missing-key`，业务回调未执行。修复版返回 `READ_ONLY_VAULT`，保护后端读取 0 次，业务回调未执行，写者仍完成清空并回收。 | `parent-red.log`、`kernel.log` |
| 四个异常退出窗口 | 暂存后发布前、发布后、回收中、创建钥匙后分别由独立子进程退出 71、72、73、74，重新打开后均选中预期的已提交版本并回收。 | `kernel.log` |
| 并发版本和在途取用 | 两个句柄持同一旧 revision 提交，一个成功，一个 `conflict`。同进程写者内挂起的回调仍使用原定义和旧值，释放后回收旧密文。 | `kernel.log` |
| 全量 Kernel 与静态检查 | Kernel 8 文件 79 项全部通过，其中凭据 14 项。首次全量运行有一项达到默认 5 秒时限，使用 15 秒验证预算复跑后全过。Kernel 类型检查、四个改动文件的 oxfmt 和 oxlint、提交差异检查均通过。 | `kernel-initial-timeout.log`、`kernel.log`、`checks.log`、`delivery.log` |

在隔离验证目录执行的命令如下。

```powershell
node node_modules/vitest/vitest.mjs run --project '@huhu/kernel' packages/kernel/test/credentials.test.ts -t 'reclaims a copied entity|rejects read-only subprocess use'
node node_modules/vitest/vitest.mjs run --project '@huhu/kernel' --maxWorkers 2 --testTimeout 15000
node node_modules/typescript/bin/tsc --noEmit -p packages/kernel/tsconfig.json
```

父提交与候选文件校验和分别在 `parent-sha256.log`、`candidate-sha256.log`。完整参数与依赖来源见 `verify.ps1`、`run-tests.ps1`、`checks.ps1` 和 `linked-dependencies.log`。

## 阻碍与接续

本次私有凭据切片无阻碍。验证范围为 Windows 上的合成 Vault、保护夹具和独立 Node 进程。Engine 装配与实际业务取用由后续组合版本验收。

## Lead 验收

由 Lead 核对提交和证据，并在验收后更新清单。

Lead 核对了冻结提交、父提交和验证记录，返工实现收件完成。交 `t4z/task02.md` 独立复核，合入按复核结论。
