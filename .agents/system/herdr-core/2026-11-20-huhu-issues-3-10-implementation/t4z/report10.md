# #9 Windows 模块凭据宿主与系统键清理复核

- terminal_address — t4z
- task — task10.md
- Core — Windows 本机 wta，`346bd5608735e3fcb27f9d01f5c8008e`，0.1.21。清单指向 `t4z → task10.md → active`。
- 执行结果 — done（Windows x64 原生宿主和系统键归属通过本轮复核，安装包待 Lead 验收）
- 冻结范围 — 宿主提交 `64788547141e806f5134fff7290b0d44bfa68b5c`，树 `98a89e949e11464c20e086068ac6b296629242cb`，含键归属提交 `2ceec67d9be1227da4815dc1df1afd8f1d8069c3`，树 `c04fc84b694a5a6125069a54fc4a072ab550b9be`。

## 签收建议

**签收 `2ceec67` 键归属修复及 `6478854` 的 Windows x64 原生宿主。** report07 的精确同名键误删窗口已用指纹归属关闭。在冻结源码归档中，真实 Windows Credential Manager 支持写入、重开取用及精确删除。同路径重新导入时新物理目录获得新本机实例 ID，复制保留可移植 Vault ID 仍无法继承原模块绑定。发行包中的实际加载、业务模块接线与三平台矩阵继续保留各自验收。 [上轮预审](report07.md) · [#9 P0.1](../../../../dev/archive/changes/implemented/feature_2026-11-19-issue-9-safe-accounts/tasks/P0.1-local-protection.md) · [#9 P0.2](../../../../dev/archive/changes/implemented/feature_2026-11-19-issue-9-safe-accounts/tasks/P0.2-credential-replacement.md)

## 直接原生及 API

- **冻结 Engine 入口。** 独立复跑 `apps/engine/test/module-credential-host.test.ts`。用合成 Vault 调实际 Dispatcher 初始化并锁 Safe；使用真实 Windows 原生适配器存储模块认证。Engine 关闭重开后，同一物理 Vault 的宿主实例 ID 不变，Safe 状态仍为锁定，模块能取用原值。实际导出 ZIP 含可移植定义，解压内容无该合成明文。保留原 Vault ID 导入另一目录，目标变为 `needs-reconfiguration`，受信取用返回 `unbound`。 [冻结 Engine 日志](evidence-task10/frozen.log)
- **精确系统键。** 独立扩展用例从本次合成实例自己的私有目录计算出本次随机生成的键，只读取这一个系统条目。原生适配器读回 32 字节，清空已提交模块认证后精确查询为 `null`。另用随机合成 ID 创建一次，第二次创建返回 `unavailable`，第一次写入的字节未改变。测试结束删除该合成键，精确查询确认缺失。使用了实际 `@napi-rs/keyring` 与 Windows native addon。 [独立原生/API 日志](evidence-task10/independent.log)
- **真实 Electron 转发。** 使用 Electron 44.9.1 / 子进程 Node 24.22.0，单独的合成 app profile 装载冻结 `EngineSupervisor`，启动实际 `utilityProcess.fork`。子进程收到真实 `app.getPath("userData")`，覆盖故意设置错误的继承值，同时收到精确 Vault 目录与 `--read-only`。两进程 PID 不同并已退出。子进程入口只记录参数和回传 ready，完整 Engine 的原生操作由前两条证明。冻结源码的 `apps/engine/src/main.ts:19–42` 把同名环境值传入 `boot`；`boot.ts:119–124,470` 在进程内部提供可选宿主。 [真实 Electron 观测](evidence-task10/electron-supervisor.json) · [探针父入口](evidence-task10/supervisor-probe.cjs) · [探针子入口](evidence-task10/utility-probe.cjs)

## 回收与故障注入

| 边界 | 独立实测 |
| --- | --- |
| 明确同名键已存在 | 文件后端注入精确占用，启动保存失败，回收及重开再次 `recover()` 均为 0 次删除。预存键原字节保全，本次指纹撤回，Vault 无部分账号。 |
| 写入结果未知 | 后端实际写入后模拟异常，同时暂时无法查证。未提交定义或删除键，正确的指纹留在本机。恢复后重开再次回收，精确删除 1 次，键与指纹都消失。 |
| 本机证明或系统条目缺失 | 指纹缺失时，读/删保护后端均为 0 次，系统键保全；这类无法证明归属的键可能成为孤立条目。系统条目已缺而指纹完整时，读 1 次、删 0 次，清理指纹。已提交的引用快照缺失或损坏时，现有回归证明恢复延后，已有密文及其他键保全。 |
| 清理暂不可用 | 注入 remove 异常，清空回执仍已提交，指纹在两次失败后保留。第三次在故障解除后完成精确删除及指纹清理。转成配置状态与实际系统回收分别取证。 |
| 首次副本保全 | 冻结回归验证复制库一项显式重绑再清理时源库与仍待重配的邻项保全，损坏的初始无绑定证明使回收暂停。原生 Engine 的同 ID ZIP 恢复验证同样的隔离边界。 首次证明写前退出、部分写入、发布错误以及后续事务各阶段的独立重跑均通过。 [崩溃重放](evidence-task10/crash-replay.log) |

[独立注入日志](evidence-task10/independent.log) · [冻结回归](evidence-task10/frozen.log)

归属实现先写入并刷新随机数据键的 SHA-256 指纹，再调用原生创建。仅对无活引用且指纹可验证的条目读回确切键，匹配后才删除。读、删不可用时保留证据，明确缺失或不匹配时退出当前归属。指纹不含凭据明文。Windows API 的检查与写入、比对与删除各自是分开的调用。实测和签收依赖本应用的 Vault 写者锁、随机键代号及本机命名空间。见 `2ceec67:packages/kernel/src/credentials/versions.ts:150–166,218–257`。

## 路径、生命周期与降级

- **路径和只读。** 真实 Windows 文件系统实测拒绝相对路径、不存在的 userData、Vault 内的 userData、普通文件占用私有根、以及挂在私有根名下的 junction。对正常 userData 的 junction 别名先规范化到真实目录。第一次只读打开不创建私有根；已有私有根时可返回惰性宿主，模块列表及尝试保存的路径实际调用保护后端 `read/create/remove = 0/0/0`，私有根无绑定且保存返回 `READ_ONLY_VAULT`。冻结测试还覆盖了已有配置的独立只读进程与活动写者。 [独立路径探针](evidence-task10/independent.log) · [冻结只读测试](evidence-task10/frozen.log)
- **实例身份。** 对可移植 Vault ID 与实际目录的设备号、inode、出生时间纳秒做摘要。真实 Windows 同目录重开和同卷重命名保持原身份。把源目录移走后，将相同 Vault ID 的包导入原路径，得到新物理目录及新绑定。当前正式导入经同级暂存并替换空目标。身份语义绑定物理目录，保留目录和 Vault ID 的手工原位覆盖不会自动获得新身份。见 `6478854:apps/engine/src/module-credential-host.ts:60–79` 和 `packages/vault/src/package/package.ts:161–176`。 [生命周期探针](evidence-task10/independent.log)
- **故障降级。** 错误根返回无宿主，Engine 的挂载字段是可选值。非 win32/x64、native loader 失败，以及系统 Entry 操作失败均正规化为 `unavailable`。原生碰撞实际得到该错误，其余故障语义由源码和注入核对。精确读返回 `null` 才被内核视为缺失。该版本只保留统一错误，平台不支持、加载失败和系统调用失败共用该诊断码。系统 API 只触及本次生成的精确合成条目，app profile 均为隔离路径。真实 Windows 系统锁定和权限拒绝尚待取证。Linux/macOS 未实跑。见 `6478854:apps/engine/src/module-credential-host.ts:13–55,60–79`。

## 包接线与验收缺口

- 在冻结树两个 importer（Desktop 与 Engine）均有 `@napi-rs/keyring: 2.1.2`。锁 blob `edb5043b084b47cd113bea45c85213688d6ce397` 的 wrapper 和可选 Win x64 MSVC addon 与 t1b 的发布 integrity 一致。两处开发依赖解出同一 wrapper 和原生文件，SHA-256 与 report07 的保全副本一致。核对 `pnpm-lock.yaml:342,433,2557–2565,10338–10354`。 [双入口解析与哈希](evidence-task10/dependency-resolution.ndjson)
- Electron Vite main 产出 `out/main/engine.js`，对 wrapper 外部化，Engine 运行时按自身位置 `createRequire`。electron-builder 现有 `npmRebuild: false`，`asarUnpack` 定向包含 `**/keyring.win32-x64-msvc.node`，Windows NSIS x64。生产收集应包含 wrapper 和目标 addon，最终验证以实际 `app.asar`、`app.asar.unpacked` 与已安装子进程加载为准。锁定依赖与 MIT 及原生附带许可已登记。见 `apps/desktop/electron.vite.config.ts:39–45`、`electron-builder.yml:7–13,32–34`、`THIRD_PARTY_NOTICES.md:135–140`。
- 生产包内实际来源、干净 profile 启动、跨 app 进程重开、原生文件与许可实际收录，以及安装包内容无合成明文由 Lead 的包内探针补证。当前结合已签收的私有宿主和 Engine 测试，可继续所属模块接线。生产 SSH/Mail 等消费者及 Safe 停用／未初始化组合尚待验收。

## 实跑环境及清理

Windows x64 build 26300，Node 24.21.0，Vitest 3.2.7。以 Git 归档冻结源码，第三方依赖使用已锁定的本机安装，未运行打包。首轮现有用例 15 通过、7 次子进程在约 10 秒限时未返回预期退出码。加入独立探针的第二轮 23 通过、6 个原子进程用例超时，新增探针及实际原生均通过。随后仅在隔离夹具将子进程限时从 10 秒放宽到 60 秒，保持原断言和业务冻结源码，7 个退出／恢复场景全通过（11 项按名称过滤跳过）。第二轮的只读子进程超时已有首轮成功和独立零后端调用结果。 [崩溃重放](evidence-task10/crash-replay.log)

复查 `git diff --check`、隔离 Electron 进程已退出、临时归档已清理。本轮由普通命令会话运行，无自建 Core pane。 [归档方法](evidence-task10/archive.ps1) · [独立夹具](evidence-task10/probes.ps1) · [清理日志](evidence-task10/validation-cleanup.log)
