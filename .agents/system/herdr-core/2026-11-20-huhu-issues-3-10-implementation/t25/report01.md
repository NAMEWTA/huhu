# #9 P0.2 模块凭据的版本与替换事务

- 共享根 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation
- terminal_address — t25
- task — task01.md
- 任务文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t25/task01.md
- 报告文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t25/report01.md
- Core — Windows 本机 wta / 346bd5608735e3fcb27f9d01f5c8008e / 0.1.21
- 执行结果 — done

## 结论

交付 Engine 私有的模块凭据事务。脱敏定义以 `VaultFiles.write(expectedVersion)` 一次原子发布，在 Vault 写者和同进程所有者队列内完成 revision 校验、暂存和发布。发布前断开只选中旧版本，发布后断开只选中新版本。挂起的同进程读者继续持有原定义和原凭据版本，释放后回收。Windows 候选 A 的独立 Node 进程重启取用和实际清理已通过。

## 产物与改动

- 工作树 — D:/Document/code/huhu/temp/issue-worktrees/credentials
- 分支 — `impl/huhu-issues-3-10-credentials`
- 基线 — `bf3942e456c03cd7a4a4070e230557bb45e1ca9c`
- 本地提交 — `7174fc8d59693575cbc16227ec296acdd4c219e5`
- 工作树干净。提交包含 `packages/kernel/src/credentials/` 下三个私有实现文件，以及 `packages/kernel/test/credentials.test.ts` 和两个隔离夹具。GitHub 无写入。

### 私有合同

- `ModuleCredentials<T>` 由受信装配注入已打开的 `Vault`、本机 Vault 实例 ID、插件 ID、已存在的 Vault 外应用私有目录、`LocalCredentialProtection`、可移植定义 schema 和从定义派生规范认证目标的函数。调用模块负责在入口校验权限、限制实体和用途，并保持 Vault 在在途操作期间打开。保护适配器对精确钥匙 ID 提供 `read/create/remove`；只有明确不存在才返回 `null`，锁定、拒绝、服务故障分别报告。
- `save` 按实体比较 `expectedRevision`，`null` 表示必须不存在。对适用用途和被移除的已配置用途显式传动作。`keep` 在目标相同时复用原版本，目标变化保留重新配置状态并断开旧引用；`replace` 需要非空值，旧钥匙明确缺失时须用 `reconfigure: true` 走新的钥匙代；`clear` 清除该用途；`delete` 按 revision 发布实体移除。每次保存生成新的随机 revision。
- `save` 回执只有 entityId、revision 和按用途的 authState；`list` 补充 schema 约束的非秘密定义。状态可为 `unconfigured`、`configured`、`temporarily-unavailable`、`needs-reconfiguration` 或 `corrupt`。`use` 将同一提交的定义和所请求用途交给可信业务回调，结束后清空本次值表。业务模块以该定义中的目标发起认证。
- 选择 Vault 中每插件一个定义文件作为提交点。定义只保存实体、随机 revision、非秘密字段和配置意图。本机用 revision 选择私有快照和不可变密文，钥匙 ID、引用和密文由本机目录及 OS 条目持有。相比在另一个可变清单单独保存指针，该结构只需一次原子替换就能同时选定业务定义和认证版本。复制相同 vaultId 到另一已注册实例时，旧定义显示需重新配置。
- 复用 Vault 的路径约束、writer.lock、条件原子写与回执。按 Safe 现有 AES-256-GCM 原语作局部适配，使用独立封包和 AAD 域，绑定 Vault 实例、插件、实体、用途、目标、钥匙代和版本。回收在所有者队列内依据当前引用和在途快照进行。引用不明时暂停，清理失败可通过 `recover()` 重试。已有钥匙缺失的普通写入保留原定义和密文；明确重配写新钥匙代，仍引用旧代的邻居保留原绑定。
- 上游检出核对 Motty `2daa9db582e16edf60a60b7ada26f47f808f973c`、one-mail `d1be24d5bb83c2da7123b167f119d5abd169b0af`、ORCA `8bc232f5ed8b4b36fec0c5f0f85ab96b4c0ccdf3` 及 t1b 的 Windows 证据。Motty 的错误分流用于对照。本次生产代码使用 Huhu 和现有 Node 原语，Windows 实测复用 t1b 原生依赖的只读安装副本。

## 验证

Windows 11 Pro x64 build 26300，Node 24.21.0，Vitest 3.2.7。以下日志位于工作树 `temp/t25-credentials-evidence/`。临时 Vault 和实际 Windows 合成钥匙串条目已清理。

| 验收要求 | 实际检查与结果 | 证据 |
| --- | --- | --- |
| 两个 Vault、插件、实体、用途独立；重开保留、替换、清空、删除 | 同 portable vaultId 的两个实例、同名实体、不同插件分别运行合成认证。首写并发为同一 Vault/插件创建一把钥匙。同钥匙下替换其他用途密文被拒，配置和本机文件扫描确认样例认证值未明文持久化。删除后两侧 Vault、同插件邻居和另一插件继续可用。 | `kernel-final.log` |
| revision 冲突、挂起读者、发布前失败 | 两个实例句柄持同 revision 并发提交，一个成功、一个冲突。挂起读者持原主机和原密文，释放后旧版本回收。只读保存、取消、写入异常均保持原始配置字节及认证。保留动作遇目标变化要求重新配置。 | `kernel-final.log` |
| 崩溃与回收 | 四个真实子进程分别在暂存后发布前、发布后、清理中、注册 OS 钥匙后退出 71–74。重开走项目 Vault 写者恢复，认证只使用应提交的版本。回收失败保留已提交回执，恢复可重试；配置损坏时回收暂停。 | `kernel-final.log` |
| 缺钥匙和保护故障 | 注入锁定、拒绝、不可用，取用和替换得到相应错误。精确移除合成钥匙后保存被拒，原密文逐字节一致；明确修复后新值可用，恢复旧钥匙可让未修改邻居继续认证。篡改认证材料报损坏。 | `kernel-final.log` |
| Windows 候选 A | 用 t1b 已安装的 `@napi-rs/keyring@2.1.2` 精确条目接入本次实际事务。PID 32376 创建，PID 40920 重新打开 Vault 后完成合成认证并清空。父进程按精确条目回读为空。 | `verify-candidate-a.mjs`、`candidate-a.log` |
| 检查与回归 | `vitest run --project @huhu/kernel` 8 文件、76 测试通过，含 11 项新增凭据测试。vendor 类型生成后 Kernel `tsc --noEmit`、变更文件 oxlint/oxfmt、提交差异检查通过。 | `kernel-final.log`、`checks.log` |
| Vault 对照 | `vitest run --project @huhu/vault --maxWorkers 2` 为 106 通过、1 跳过、3 失败。独立复跑复现包导出测试的 Windows 符号链接 EPERM、索引中文路径排序断言差异、目录变化监听超时。Vault 文件与基线无差异。 | `vault-control.log` |

## 阻碍与接续

本切片无阻碍。后续负责候选 A 原生依赖和打包、本机 Vault 实例登记、Engine 装配、各业务授权和调用、实际 Git/备份导入导出及 Linux/macOS 验证。Electron utilityProcess 原生取证来自 t1b 的前置试验。本次 Windows 实测覆盖独立 Node 的模块事务和系统钥匙串，进程中断覆盖采用合成保护后端。磁盘断电、跨进程挂起读者、系统真实锁定、真实业务 provider 授权与产品安装包仍待验。原型待用户确认。

## Lead 验收

由 Lead 核对提交、实际证据与后续接口装配，再更新 manifest。

