# #9 P0.1 本机保护取证与 P0.2 替换合同

- 共享根 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation
- terminal_address — t1b
- task — task01.md
- 任务文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t1b/task01.md
- 报告文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t1b/report01.md
- 执行结果 — done（只读取证与合同分析交付）
- 身份与基线 — Windows 默认 Core wta / 346bd5608735e3fcb27f9d01f5c8008e / 0.1.21，HC_TERMINAL_ID=t1b，manifest 为 active。工作树 D:/Document/code/huhu/temp/issue-worktrees/credentials，分支 impl/huhu-issues-3-10-credentials，HEAD bf3942e456c03cd7a4a4070e230557bb45e1ca9c。
- 依据 — 主工作区 .agents/dev/changes/2026-11-19-issue-9-safe-accounts 下的 spec.md、design.md、tasks/P0.1-local-protection.md、tasks/P0.2-credential-replacement.md、tasks/P7.1-mail-auth-contract.md。

## 结论

建议冻结 P0.2 的所有者、版本和错误语义，Windows 优先选 A 进入安装包验证。A 在项目锁定版本的 Electron utilityProcess 和独立 Node 进程均能取用同一运行系列内先前保存的合成认证。B 在 Electron main 的异步 safeStorage 与专属子进程通道上也可用，可作为明确选择的桌面实现。独立 Engine 没有 main 时，B 应报告本机保护不可用。运行时自动在 A/B 之间切换会使原绑定和故障状态产生歧义。

最重要的合并条件是把 revision 检查与配置发布放在同一所有者写队列内。本机对基线 VaultFiles.write 同时发出两个持相同 expectedVersion 的普通写，两者均返回成功。包一层覆盖整个读、比较、写入和发布的队列后，同一测试只提交一个新版本，旧请求收到冲突。这个区别直接影响 SSH 主机编辑和 Mail token 轮换。

## 产物与改动

证据根目录 `D:/Document/code/huhu/temp/issue-worktrees/credentials/temp/t1b-74ca136049fe4d0aa9fe446f17d6dcff`，以下证据路径均相对该目录。保留 run.cjs、main.cjs、engine.cjs、vault-trial/check.mjs、依赖锁及脱敏结果。重放用 `node run.cjs A`、`node run.cjs B`、`node run.cjs N`，或在 A/B 后加 `firstuse`。从 vault-trial 运行 `node --experimental-transform-types check.mjs`。每次新建随机目录和专属系统条目，仅读取本次条目。N 表示独立 Node 对照。模拟认证在所属进程内解封随机 32 字节输入并比对测试摘要，只有检查状态与进程元数据进入结果。摘要是测试判据，产品配置不能持久化秘密校验摘要。

所有业务代码、规格、锁文件与上游保持只读，本地无新增 Git 提交。系统样本条目删除后逐个读回为空，B 的本地包装钥匙剩余文件数为零。可重放夹具、合成密文及测试 Electron profile 保存在工作树 temp 下；自动审批阻止了批量递归移除测试 profile 的命令。没有操作真实 Vault、用户钥匙条目、原生历史、邮箱或远程 SSH 会话。

## 验证

| 验收要求 | 实际检查与结果 | 证据位置 |
| --- | --- | --- |
| Windows A，实际 Engine 进程类型和重启 | Windows 11 Pro x64 build 26300，Electron 44.9.1 / Node 24.22.0 / Chromium 152.0.7977.167。utilityProcess 加载 keyring 2.1.2 的 Win x64 N-API 文件，用 Entry 定点写入、读回及删除随机包装/数据钥匙。首次 main/child PID 46300/38908，重启后 19704/38336，原密文认证成功。23 个阶段的退出状态全部符合预期。 | synthetic-tm5F01/checks.ndjson、processes.ndjson |
| Windows B，实际 main 与私有通道 | 独立新 profile。main ready 后实际调用 isAsyncEncryptionAvailable、encryptStringAsync 和 decryptStringAsync；测试 profile 的 OSCrypt 密钥头为 DPAPI。main 固定每个 child 所属 scope，由宿主寻找并核实包装记录，child 只能请求自身受限操作。首次 PID 47928/26288，重启 20580/45116。23 个阶段均符合预期。 | synthetic-rRouUe/checks.ndjson、processes.ndjson；summary.json |
| 独立 Engine 的依赖 | Node v24.21.0 以相同消费者在新进程使用 A，23 个阶段均符合预期。B 的 Electron main 能力只在 main 试验中提供。项目目前没有给独立 Engine 配置保护服务。 | synthetic-uDoXlK/checks.ndjson；apps/engine/src/main.ts |
| 私有绑定、首次生成 | 两个 Vault 实例使用相同 entity ID、用途及显示语义，第三个 scope 在同 Vault 用不同插件。重启后各自认证成功，其他 scope 的密文无法认证；在同一把钥匙下分别改 Vault、插件、实体、用途或版本的 AAD 也均拒绝。并发发起两次首次设置，通过单写者共享初始化，只创建一次并读回匹配钥匙。B 还实测拒绝带额外 scope 的请求及枚举操作。 | A/B 的 verify 阶段；synthetic-W22KH3、synthetic-hL5Fni 的 checks.ndjson 和 processes.ndjson |
| 缺钥匙、锁定、缺后端 | 实际删除 A 的合成系统条目或 B 的合成包装文件，所属模块的 load 报 key-missing，原定义和密文字节摘要一致，另一 scope 可用。锁定、无服务和 basic_text 只在适配层注入；重试用原钥匙成功。本次未锁用户系统会话，未在真实 Linux Secret Service 停止状态运行。 | 各 checks.ndjson 的 missing、injected、survivor、cleanup；engine.cjs |
| 切换中断与重启 | 暂存写完、发布前让子进程退出 71；新进程读回 revision 1，回收未提交版本。指针已切换、清理前退出 72；新进程读回 revision 2，清理旧版本。两个候选均实际重启进程；此证据覆盖进程退出，磁盘断电耐久性待测。 | 各候选的 stage-crash / recover-stage、commit-crash / recover-commit |
| 替换、保留、清空、删除、并发和引用清理 | A/B 的 race、clear、absent、delete 与相邻 scope 检查均符合预期。另用基线 VaultFiles、ReceiptLog、路径守卫、锁定版 write-file-atomic 8.0.0 及真实 seal/open 测同一 Vault、同一插件的两个同名实体。暂存后只读写失败，旧值和邻居仍可用。队列使两个旧 revision 请求产生一次提交、一次冲突。模拟清理推迟时，在途读者仍可用旧版，释放后仅回收旧版。清空和删除最后仅剩邻居的完整版本。 | vault-trial/check.mjs；vault-trial/scoped-OYzJc7/results.txt |

### 平台与打包判断

| 平台 | A · Engine 钥匙串 | B · main safeStorage | 安装包证据 |
| --- | --- | --- | --- |
| Windows x64 | 当前 Windows 用户的 Credential Manager 后端、utilityProcess 和独立 Node 的样本通过。测试证明正常登录会话内可跨进程使用。 | main 的 DPAPI 异步保护及主子进程重启通过。Windows 保护针对登录用户，插件/实体约束由产品代码实施，不构成同用户任意本地程序的 OS 隔离。 | 用官方 Electron 分发包与实际原生模块进行开发态试验。HUHU NSIS 安装、升级、ASAR native load 均待测。 |
| Linux x64 | 未实测。2.1.2 的 EntryOptions 支持显式要求 linux.store='secret-service'。默认还可回退 kernel keyring；选定持久 Secret Service 时应固定 provider，验证已解锁、锁定、重登、无 D-Bus 服务和权限拒绝。 | 未实测。44.9.1 同步接口可报告 basic_text；异步接口另有 Secret Portal、Secret Service 和 fallback，仅凭异步 availability 或同步后端名不足以确认异步 provider 的强度。无法确认保护则拒绝保存/使用并保留原数据。 | 项目目标 AppImage/deb。当前 Windows 主机未安装 WSL，本任务未授权访问远程主机。 |
| macOS arm64 | 未实测。上游使用 Keychain，待真实签名进程验证授权提示、拒绝、锁定、重启、升级与 native 装载。 | 未实测。Keychain 的身份和签名影响升级后的授权，需核实实际发布身份。 | 项目 DMG 配置 mac.identity 为 null，签名和安装包行为均待证。 |

Huhu 的 apps/desktop/src/main/engine-supervisor.ts:65 以 utilityProcess.fork 创建可信子进程，现有消息用于 ready / shutdown。apps/engine/src/main.ts 另支持无 parentPort 的独立执行。preload 的 huhuHost 只提供现有宿主动作。本次夹具使用相同进程类型，新建专属父子端点，没有向 renderer、HTTP、MCP 或 CLI 注册解密能力。产品接入 B 时应将连接绑定到当前 supervisor child 和 Engine 生命周期，关闭、重启、切库后撤销旧代请求；插件身份由受信 handler 捕获。多个插件处于同一 Engine 时，它们共享进程信任边界。候选 A 进入安装包前还需对照 apps/desktop/electron.vite.config.ts 的 external 与 apps/desktop/electron-builder.yml 的生产依赖、原生文件装载及 npmRebuild 设置；当前基线没有 keyring 依赖和装配。

[Electron 44.9.1 的 safeStorage 平台与 API 说明](https://github.com/electron/electron/blob/v44.9.1/docs/api/safe-storage.md) · [keyring 2.1.2 的系统后端依赖](https://github.com/Brooooooklyn/keyring-node/blob/52184fbebffeef8a061234f60f313c479b954f9f/Cargo.toml)

## P0.2 建议冻结的调用与提交合同

| 边界 | 交给消费者的约定 |
| --- | --- |
| 公开写入 | 每个模块沿用自己的 save/update/delete handler。请求给稳定 entityId、expectedRevision、非秘密修改，以及每个认证用途的显式动作 `keep`、`replace(value)` 或 `clear`。新建使用“必须不存在”的前置条件。空串不隐式清空。多个互相依赖的字段在同一 revision 发布，例如私钥与口令、HTTPS 用户名与 token、OAuth token 集。删除同样需要预期 revision。 |
| 结果与读取 | 返回 `{entityId, revision, authMethod, authState}` 的适用字段。authState 区分未配置、已配置、暂时不可用、需重新配置；Mail 可另报需重授权。模块列表、保存回执、错误、审计、查询键、普通 CLI 参数和恢复资料都不能携带值或可取值的句柄。重试同一 requestId 只能取得脱敏回执；权限、当前配置及目标仍由本次业务操作检查。#6 需覆盖 dispatcher/idempotency 对输入摘要与结果持久化的处理。 |
| 私有取用 | 在 Engine 装配时向所属模块注入窄接口。宿主固定当前本机 Vault 实例与 pluginId；模块从已提交配置派生实体、用途、必要目标约束。专用操作在有权限的真实业务调用内短时取值交给目标适配器；读取方固定一个已提交版本直到完成。公共请求不能传本机 key 名、版本路径、插件名或通用 secretRef 来选择解密对象。Safe 的初始化、锁定、停用均与此链独立。 |
| 引用与位置 | 私有记录绑定 `(格式, localVaultInstanceId, pluginId, entityId, purpose, generation[, target])`。采用无歧义的规范编码作为 AAD，随机 generation 永不复用。每个 Vault 实例/插件使用独立随机 256 位钥匙，本机密文与包装材料放在 Vault 之外的应用私有目录或 OS 存储。实体显示名、邮箱、地址、文件夹名及可复制的 vaultId 均不足以当作本机实例身份。同机重新打开原实例可以重用；导入、复制、恢复进入新实例，即使原 vaultId 保留也显示需重配。实例登记与移动/恢复识别仍需产品实现。 |
| 发布点 | 单一所有者控制配置及其版本选择。可用脱敏配置的一次原子提交选定不可变的私有版本。例如定义携带不可反查的随机配置代号；本机以实例、实体和该代号定位已暂存版本，导出只带业务定义，排除本机查找表与材料。若改用本机 manifest，仍需给出一个同时确定业务目标与认证版本的提交点。两个独立可变 JSON 各自 rename 无法提供该语义。底层文件 expectedVersion 是字节 SHA-256 截断值；每次相关语义更新应产生新 revision，避免内容改回原状使过期请求重新有效。 |
| 失败和恢复 | 暂时锁定/拒绝/服务故障 → 解除锁定或稍后重试；原绑定缺钥匙 → 到所属配置显式重配；认证标签不符或材料损坏 → 保留证据并报损坏。只有确实首次设置且无遗留密文、绑定或在途创建才自动生钥匙。明确重配可建立新的钥匙代和密文，发布成功后再回收旧代，不能因单实体缺钥匙而覆盖同插件其他实体的共享钥匙。只读、未授权、冲突、取消发布前不改变当前配置。 |

**提交顺序**

1. 在所属模块的 Vault 写者下校验权限、可写状态与输入。跨进程沿用 packages/vault/src/vault.ts 的 writer.lock，同一进程对共享的配置文件、首次建钥匙及回收过程串行化。若一个文件含多个实体，锁覆盖该文件。禁止在锁外取得 revision 后直接当作提交依据。
2. 在私有区排他写新 generation，读回验证解密、归属和目标。keep 可以继续引用同版，clear 发布空绑定；切换 Git 目标等认证上下文时，旧绑定不得随 keep 沿用。对主机删除/认证方式切换，合并全部字段和引用变更。
3. 在同一写临界区重读当前配置，比较 expectedRevision，对单一配置/清单执行条件原子写。只有该步成功才报告已提交。超时或返回结果丢失时，先用操作标识及当前提交对账，不能盲目重复轮换。
4. 提交前失败或进程退出，原版本仍是唯一可选版本。提交后清理失败，保留新提交、延迟回收。恢复时在同一所有者作用域从已提交引用、在途读者、活动暂存构造保留集，只回收确定无引用的本机版本；配置损坏或引用关系不确定时暂停清理。删除实体后仍须保留同名邻居、同一模块其他用途和其他 Vault 的数据。重启后有效版本唯一，磁盘可短暂存在尚未回收的孤儿。
5. 如果 OAuth 服务端已撤销旧 token，本地事务只能保全本地配置。一轮 refresh 按账号串行写入，校验 revision 及授权会话，provider 未下发新 refresh token 时按其语义保留旧字段。已轮换却未能持久化时先对账，确定原授权失效则仅将该账号标成需重授权，AI Key 和另一账号仍可用。

## 接入点与由合同解锁的工作

| 所有者 | 基线直接调用与接续 |
| --- | --- |
| Safe | plugins/safe/src/engine/crypto.ts 的 newDataKey、seal/open 提供随机钥匙、12 字节 IV、AES-256-GCM 与 AAD。safe.ts 的 DK 由主密码 KEK 包装，itemSave 分别写 sealed 与元数据，resolve 解析 safe:// 并查 allowedModules。现有逻辑保留为分析基线；独立模块复用无领域语义的加解密原语即可，不借用 Safe 的 DK、ACL 或 reveal。 |
| SSH / #7、#9 P5 | SshModule.tsx 先调 safe.items.save，HostStore.save 另写主机 JSON。engine/index.ts 取 secretUse，manager.ts:118 按 ref 组 password 或 privateKey/passphrase。改为主机 handler 一次提交和删除，以 hostId 使用并保持主机密钥信任逻辑；agent、身份文件和跳板按各自语义处理。 |
| Versioning / #9 P4 | SyncSettingsPage.tsx 调 safe.items.list；engine/index.ts:218/244 解析 Safe、监听 safe.unlocked。sync.ts:200 的 netEnv 创建限时 ASKPASS、校验 host，:235 仍把用户名写进 Git 参数；auto-sync.ts 把 SAFE_LOCKED 当认证故障。将 HTTPS 用户名/token 一起绑定规范化的协议、主机、有效端口、仓库目标。目标变化需重配。沿用 helper 禁用与清理，修复后由本模块的配置事件恢复。Git SSH 继续走系统 SSH。 |
| Agent CLI / #4、#9 P6.1 | engine/index.ts:250 按调用插件解析 envRefs；launch.ts 汇合自定义 env 且仅 preview 遮罩，sessions.ts:226 把 env 交 terminal.run。Agent 管理自身的额外启动环境，原生登录由 provider 维护。requestId 对账保留；预览和持久会话只保存状态。 |
| Automations / #5、#9 P6.2 | service.ts:394 把规则 envRefs 转交 agent.sessions.launch；headless 的 worker.ts 与 supervised.ts:124 将 env 写入 launch.json。规则/脚本归 Automations，按执行 ID 仅在目标进程启动时使用。受保护内容不可进入 run 文件、任务/评论、回执或 Core restart_env。运行期与异常退出后的真实 Core 恢复材料需 #4/#5 单独验证；本次没有读取任何原生历史。 |
| Mail / #8、#9 P7.1 | 基线无 Mail 插件的可执行 handler。#8 S1a.1 用 accountId 保存 IMAP/SMTP 密码；S3.1/S4.1 管 OAuth 授权、刷新与重授权，用账号、provider、目标资源/权限约束 token；S7.1 用独立 AI 设置实体及 provider/endpoint 绑定 Key。需按用途区分“配置已保存”和“认证已成功”，普通设置查询脱敏。同地址账号及 AI 独立删除、Safe 三状态、用户取消、过期轮换、与真实传输/provider 的联验交 #8。 |

包与 Git 的边界须分别验收。packages/vault/src/package/package.ts:28 仅排除少数 .huhu 目录，Git 对已跟踪内容和备份有不同规则。仅在 Git 中忽略文件不能证明整包隔离。#9 P8 需取实际包与暂存列表，验证定义可恢复、目标实例需重配、本机钥匙/密文索引与运行交接均未随导出流转。

## 上游与许可

- Motty main `2daa9db582e16edf60a60b7ada26f47f808f973c`。核对 internal/vault/keystore.go、internal/workbench/vault_keystore.go、根 LICENSE（Apache-2.0）与 NOTICE。可借鉴 not-found / unavailable / denied 的错误分流；FileKeystore 会将钥匙编码为十六进制写在相邻 vault.key，FallbackKeystore 的读取也可能转向文件。Huhu 不采用该文件后备。无复制、改写或发布义务变更。
- 夹具实际加载 npm `@napi-rs/keyring@2.1.2` 和 `@napi-rs/keyring-win32-x64-msvc@2.1.2`，发布包 gitHead `52184fbebffeef8a061234f60f313c479b954f9f`。入口 index.js、index.d.ts、keyring.win32-x64-msvc.node；上游 MIT，原生包另带 LICENSE.third-party.md。若产品采用，请登记预构建文件与随附第三方声明。夹具未改上游包。
- Electron 自项目锁定 v44.9.1，tag 对应提交 `e02265be96c5e13ae43644ef482b718e1e800499`，MIT，实际使用发行包的 utilityProcess、main safeStorage；无上游改动。one-mail `d1be24d5bb83c2da7123b167f119d5abd169b0af` 的 src-tauri/src/oauth/mod.rs 与 commands/backup/native.rs、ORCA `8bc232f5ed8b4b36fec0c5f0f85ab96b4c0ccdf3` 的 src/shared/agent-launch/startup/host-account-launch-env.ts 仅对照领域分工，未纳入产品。one-mail 原生备份携带 database_key 的做法不适用本机绑定。
- 验证依赖只在证据目录安装。业务范围新增依赖、采用上游文件和本地提交数均为零。

## 阻碍与接续

本轮只读取证已完成。Lead 可交付上述 P0.2 契约给 #4/#5/#7/#8 与 Versioning 的开发者。产品代码还需实现并验证单写者、实例身份、错误映射、权限与打包装配；跨平台 P0.1 仍待 Linux/macOS 真实会话和三端产品安装包。真实系统锁定、断电及 provider 轮换未实测。界面按 prototype-review.md 仍待用户确认，本次未修改表单或客户端实现。

## Lead 验收

核对 summary.json、五组原始检查行数、实际进程版本及干净工作树。接收 Windows 分析和 P0.2 合同输入。产品 handler、Linux/macOS 系统保护和安装包验证继续取证。t25/task01 接续。
