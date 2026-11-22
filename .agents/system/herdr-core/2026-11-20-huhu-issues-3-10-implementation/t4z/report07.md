# #9 Windows 系统凭据适配与安装包接线预审

- terminal_address — t4z
- task — task07.md
- Core — Windows 本机 wta，`346bd5608735e3fcb27f9d01f5c8008e`，0.1.21。任务清单为 `t4z → task07.md → active`。
- 执行结果 — done（预审完成，Windows 原生候选可进入接线，生产安装包待验收）
- 核对基线 — 开始时的集成提交 `5cb39eb37dbcf8df563e5eed1fbb72bdbf24bbc3`。发布前复查到 `30da8fe63ff9588b596b8d67a804d15ee4d4aa7b`，期间两个提交仅改 Agent CLI，以下宿主、内核、Vault 包和锁文件核对路径无差异。

## 结论

Windows x64 的独立 Node 与 Electron UtilityProcess 均已有真实系统凭据的读、写、删和进程重启证据，采用 `@napi-rs/keyring@2.1.2` 作为 Engine 保护驱动的接线候选。当前内核已提供事务及保护接口。生产宿主仍需接入本机 Vault 实例、受信模块和原生驱动，桌面包仍需将 wrapper 与对应 .node 纳入可加载的生产依赖。Safe 业务锁定、正式导出恢复和最终安装包必须用装配后的版本取证。Linux/macOS 本轮保持明确的本机保护不可用状态。

任务引用的 t1b 目录只含一份报告，标题为「P0.1 本机保护取证与 P0.2 替换合同」。本轮以该报告及迁移后的原始证据为依据。 [t1b 报告](../t1b/report01.md)

## 规格轴

| 证据层 | 实际核对结果 |
| --- | --- |
| Windows 原生 · Electron | build 26300、x64，Electron 44.9.1 / Node 24.22.0 / Chromium 152.0.7977.167，合成 A 探针 23/23，23 个不同 UtilityProcess 子 PID。日志有三作用域 seed/verify、clear/absent/delete、相邻作用域 survivor 和 cleanup。存储锁定、拒绝与不可用来自注入。 [检查日志](D:/Document/code/huhu/temp/issue-baseline/credentials-evidence/t1b-74ca136049fe4d0aa9fe446f17d6dcff/synthetic-tm5F01/checks.ndjson) · [进程日志](D:/Document/code/huhu/temp/issue-baseline/credentials-evidence/t1b-74ca136049fe4d0aa9fe446f17d6dcff/synthetic-tm5F01/processes.ndjson) |
| Windows 原生 · Node | 独立 Node 24.21.0 的合成 N 探针 23/23。实际 `ModuleCredentials` 加原生适配夹具另测：PID 32376 创建，PID 40920 重开后读回及清空，随后精确读取原系统条目得到缺失。t4z 的上轮独立复跑分别使用 PID 19980 和 46180。 [N 检查](D:/Document/code/huhu/temp/issue-baseline/credentials-evidence/t1b-74ca136049fe4d0aa9fe446f17d6dcff/synthetic-uDoXlK/checks.ndjson) · [t25 原生日志](D:/Document/code/huhu/temp/issue-baseline/credentials-evidence/t25-credentials-evidence/candidate-a.log) · [独立复跑](report01.md) |
| 软件行为 | P0.2 真实内核搭配合成文件保护分别验证跨实例失配、重配后同实例重开、相邻绑定保全、中断回收及只读零后端访问。t1b 的 B 试验另测 Electron main 的 safeStorage。 [内核独立复核](report04.md) · [A/B/N 汇总](D:/Document/code/huhu/temp/issue-baseline/credentials-evidence/t1b-74ca136049fe4d0aa9fe446f17d6dcff/summary.json) |
| 待装配取证 | 生产 Engine 和业务模块、NSIS 安装及重启、真实 OS 拒绝/锁定、备份恢复和最终包字节扫描。本轮也未做物理断电、Linux 或 macOS 实机运行。 |

- **2.1.2 二进制接口。** Engine 复用已验证的同步 `new Entry(service, username)`、`setSecret(Uint8Array)`、`getSecret(): number[] | null`、`deleteCredential(): boolean`，包装成内核的 Promise 接口。声明还提供 `AsyncEntry`，本轮原生证据覆盖同步入口。读取把 byte array 复制成调用者拥有的 `Buffer`，保留内核 32 字节长度检查和现有清理约定。以固定的产品/版本命名空间及精确的作用域 key ID 定址。`setSecret` 可覆盖既有条目，创建应先判定精确条目缺失。该检查与写入之间没有系统 CAS，需依赖内核随机代号、私有命名空间及 Vault 写者约束。删既有条目得 `true`，已缺失得 `false`，两者均满足 `remove` 的幂等合同。 [实际类型声明](D:/Document/code/huhu/temp/issue-baseline/credentials-evidence/t1b-74ca136049fe4d0aa9fe446f17d6dcff/node_modules/@napi-rs/keyring/index.d.ts) · [锁定版 Entry 源码](https://github.com/Brooooooklyn/keyring-node/blob/52184fbebffeef8a061234f60f313c479b954f9f/src/entry.rs)
- **正规化缺失与故障。** 锁定版 Rust 仅把 `NoEntry` 变成 `null` 或删除 `false`，其余错误经 anyhow 转入 N-API 错误通道。JS 接口没有承诺区分所有 OS 故障的稳定错误枚举。构造、加载、读取或删除异常必须保留失败语义。通用异常映射到 `LocalProtectionError("unavailable")`，只在有可验证的稳定信号时细分 `locked` 或 `denied`。模块可见状态沿用 `temporarily-unavailable`，精确缺钥匙、外来绑定和损坏由内核判断。加载失败保留普通 Engine 能力，记录受限诊断原因，例如 `unsupported-platform`、`native-load-failed` 或 `backend-unavailable`。诊断仅含固定原因、平台与架构。读写失败时保全已提交的引用和密文。删除异常保留本机待回收标记，由现有事务重试。 [内核保护接口](../../../../../packages/kernel/src/credentials/protection.ts) · [锁定版缺失及删除转换](https://github.com/Brooooooklyn/keyring-node/blob/52184fbebffeef8a061234f60f313c479b954f9f/src/result.rs)
- **本机实例边界。** `ModuleCredentials` 在 Vault 留脱敏定义，并由可信宿主提供真实 Vault 外应用私有根和 `localVaultInstanceId`。内核按 `localVaultInstanceId + pluginId` 派生本机作用域，密文再绑定实体、用途、目标及代号；每个保护操作使用该作用域内的精确系统键。同一 Windows 登录账号、同一应用私有根、同一实例正常重开复用原 ID，路径别名先规范化。复制到外来目录、恢复为新实例都分配新的本机 ID，即使可移植 Vault ID 和实体 ID 一样。显式导入/替换成功时更新实例生命周期，避免旧路径被重用时恢复旧绑定。当前导入入口要求空目标，测试应覆盖实际接受的恢复路径和原位拒绝。只读打开不创建系统条目或本机绑定。Windows 私有根的权限按目标系统 ACL 核对。`userData` 可作为桌面私有根来源，实例登记仅存必要绑定信息，延续 D-26 的内存最近列表。独立 Engine 若启用凭据，由自身可信宿主提供相同合同。Windows 用户账号下的命名作用域提供应用内隔离，其他同账号程序仍由 OS 权限模型约束。证据见 `5cb39eb:packages/kernel/src/credentials/module-credentials.ts:23–30,78–85,148–183,309–331`、`credentials/versions.ts:45–58,128–161`、`apps/desktop/src/main/vault-session.ts:13,46–60`。
- **非 Windows 能力。** 第一阶段仅 `win32/x64` 启用驱动；其他平台、架构及缺原生依赖在加载前后都有可诊断的不可用分支。这些分支统一保留受保护数据并报告本机保护不可用。Linux 2.1.2 默认构造可能在 Secret Service 初始化失败后转向 Keyutils，后续验证时应显式固定 Secret Service 并覆盖 DBus 不可用、锁定和重启。macOS 单独验证目标 arm64 安装件、Keychain 权限、锁定和 app 身份。平台包出现在 optional 列表只代表有预编译候选。 [Linux 回退实现](https://github.com/Brooooooklyn/keyring-node/blob/52184fbebffeef8a061234f60f313c479b954f9f/src/linux_credential_builder.rs) · [#9 规格](../../../../dev/changes/2026-11-19-issue-9-safe-accounts/spec.md)

## 规范轴与最小接线

**接线时需处理已存在的精确系统键。** `LocalVersions.createKey()` 先创建本机登记目录，再调用 `protection.create()`。如果适配器发现预存键并抛通用异常，`save()` 的 `finally` 仍会扫描该登记并调用 `remove()`，有可能误删预存键。接线时需区分明确「已有同名且本次从未写入」与「写入结果未知」。前者只撤销本次本机登记，后者保留当前中断回收语义。以可控键 ID 的夹具复现拒绝创建，并确认原字节在 `finally` 和再次 `recover()` 后仍可读。该路径是静态审查发现，历史探针使用随机条目。见 `5cb39eb:packages/kernel/src/credentials/versions.ts:148–165,216–233`、`module-credentials.ts:250–257,342–365`。

1. **宿主与模块。** 用现有串行开库、启动和关闭路径传递私有根/实例 ID。当前主进程 `index.ts:283–306` 关闭旧 Engine 后创建新 supervisor，`engine-supervisor.ts:48,68–83` 从同目录启动 `engine.js`，通过 Vault 参数和受信宿主环境准备子进程；`apps/engine/src/main.ts:27–39` 转入 boot，`boot.ts:115–135,162–192,297–330` 是打开 Vault 和注册内置插件的装配入口。该提交中 `new ModuleCredentials` 只在测试夹具出现。把原生适配放在 Engine，按平台延迟加载，受信模块按自身插件构造 scoped service。沿用内核事务与锁持有期。Renderer、通用能力和外部工具只获得必要配置状态或所属业务操作。
2. **依赖与外部化。** `apps/desktop/electron.vite.config.ts:15–45` 的 main 构建同时产出 ESM `out/main/index.js` 和 `out/main/engine.js`，已有原生依赖列在 `rollupOptions.external`。用运行时 `createRequire(import.meta.url)` 或受控动态导入，从 Engine 所在安装树加载 wrapper，按现有原生模块方式外部化，避免在 renderer/preload 或 main 顶层急切加载。当前 `apps/engine/package.json:11–26`、`apps/desktop/package.json:16–33` 及 `pnpm-lock.yaml` 均无该依赖，桌面入口以 bundle 引入 Engine 源码。最小接线可在 Engine 与 Desktop 声明精确 `2.1.2` 生产依赖，由共享锁追踪 wrapper 与 optional 原生快照，桌面包必须可沿生产依赖图实际解析两者。验包记录冻结安装与锁一致、目标架构和实际解析路径。跟踪 wrapper MIT 与原生包的 `LICENSE.third-party.md`。 [npm 锁定版元数据](https://registry.npmjs.org/@napi-rs%2Fkeyring/2.1.2)
3. **ASAR、目标与过滤。** `apps/desktop/electron-builder.yml:3–32` 已有 `out/**`、测试/夹具排除、明确的 `extraResources`、`npmRebuild: false` 及 Windows x64 NSIS；尚未配置 `asarUnpack`。集成提交锁定的 electron-builder 是 26.18.0（`pnpm-lock.yaml:376–378`）。生产依赖随应用文件收集，`asarUnpack` 仅决定已收录文件的放置。针对实际包内路径声明并验证 `keyring.win32-x64-msvc.node` 的定向解包，确认 `resources/app.asar.unpacked` 中存在该文件、wrapper 可解析并由真实子进程加载。自动解包及保留 `npmRebuild: false` 均以最后的包内实测为准。当前配置的 demo Vault 和 examples 也属于发行包扫描范围。 [electron-builder v26 文件与解包](https://www.electron.build/v26/docs/contents/) · [Electron ASAR 与原生模块](https://www.electronjs.org/docs/latest/tutorial/asar-archives)
4. **来源可复查。** 合成探针独立 `package-lock.json` 锁定 npmjs 的 wrapper 2.1.2、Electron 44.9.1 和 optional `@napi-rs/keyring-win32-x64-msvc@2.1.2`。npm 元数据的 wrapper integrity 与锁一致，gitHead 为 `52184fbebffeef8a061234f60f313c479b954f9f`。win32/x64 子包入口为 `keyring.win32-x64-msvc.node`。本轮直接读得已保全文件 SHA-256，wrapper `index.js` 为 `8a89db37f981d05b484eb063adae3399660ae7734ad38797463e5691382f5036`，原生文件为 `52b16658275b7848f8081a6542fee3448f1b1c5d3a36487107ae0e7cec95ac6f`。这些是软件文件哈希，正式包从项目声明及锁重建。 [探针锁文件](D:/Document/code/huhu/temp/issue-baseline/credentials-evidence/t1b-74ca136049fe4d0aa9fe446f17d6dcff/package-lock.json) · [Win x64 包清单](D:/Document/code/huhu/temp/issue-baseline/credentials-evidence/t1b-74ca136049fe4d0aa9fe446f17d6dcff/node_modules/@napi-rs/keyring-win32-x64-msvc/package.json)

## 安装后验收设计

| 用真实入口证明 | 合成输入与通过条件 |
| --- | --- |
| 安装件加载的是实际随包驱动 | 冻结提交、pnpm 锁、NSIS 哈希。隔离 Windows 测试账号或测试机安装，使用独立应用私有根及 Vault。清点安装件内 wrapper、target 与 unpacked 文件哈希。启动后记录 Engine 子 PID、Electron/Node/架构、解析相对路径和版本。用隔离安装环境排除工作树依赖或全局注入。 |
| 系统写、读、删及同 Vault 重开 | 用随机实验命名空间、独立测试 Vault 和合成模块目标走装配后的真实模块入口。保存后精确验证 OS 存在该系统键，完全退出后重开同一目录，用同账户/私有根完成一次受控认证。覆盖 keep、replace、clear 和实体删除。用受控碰撞夹具确认创建拒绝及随后的回收均保全精确预存条目。末尾独立精确读取每个应回收键均缺失，相邻 Vault 的同名目标仍认证成功。涉及重试或替换时复查原引用和旧条目是否按事务进度保全。 |
| Safe 状态与故障分流 | 在 Safe 未初始化、锁定、停用分别用有效的 SSH/Mail 等已装配测试消费者完成真实本地认证。Safe 锁定时其自身取用被拒绝。用合成故障注入验证 `locked/denied/unavailable`，用真实目标精确删除验证 `missing-key`，用隔离副本缺失 addon 验证普通 Engine 仍工作且模块报不可用。记录注入层，故障时不生成替代钥匙、不覆盖原配置。 |
| 外来恢复 | 通过实际导出、导入和开库恢复至新空目录。核对 P8.2 的新 Vault ID、备份密码解锁 Safe 与恢复字段；另做保留可移植 ID 的目录复制检验本机 ID 隔离。目标模块先显示 `needs-reconfiguration`，明确重新录入后只为目标生成新绑定。清空目标的一项，复查源库及目标未重配相邻项。拒绝非空目的地并验证原始文件/绑定保全。当前底层 `importPackage` 只有在 `regenerateId` 或传入匹配的 `existingVaultIds` 时换 ID，桌面 `importPackageTo` 目前没传选项，需在正式恢复入口落实新 ID 的验收条件。见 `5cb39eb:packages/vault/src/package/package.ts:117–119,170–176`、`apps/desktop/src/main/vault-session.ts:49–55`。 |
| 无明文及清理 | 给 Safe 字段和模块认证分别使用新的随机 canary。递归检查实际 NSIS 文件内容、`app.asar`、`app.asar.unpacked`、extraResources 和样例；同样扫描真实导出 ZIP 的文件清单及解压内容、Git 实际暂存对象、运行日志/诊断、模块普通响应和适用的临时路径。用扫描阳性控制证明能检出合成值及其常见序列化形式，只保存计数、路径与判定。发行包无凭据材料；Vault 数据包只含一致的 Safe 密文和其可移植包装 keyring、允许的模块定义，排除本机根、实例登记、模块密文/临时版本、机器钥匙和环境值。结束精确删除本次创建的各系统条目并确认缺失，清理专用测试根，对中断保留可按精确测试索引清理的记录。 |

规格回查为 `5cb39eb:.agents/dev/changes/2026-11-19-issue-9-safe-accounts/spec.md:33–46` 及同目录的 `tasks/P0.1-local-protection.md`、`P8.1-backup-contents.md`、`P8.2-restore-new-vault.md`、`P8.3-git-candidates.md` 和 `P9.1-clean-install.md`。

本轮使用已保全的合成记录，未新增系统凭据或合成 Vault。业务源码、共享锁、真实用户数据、远端和 #6 构建均未操作。
