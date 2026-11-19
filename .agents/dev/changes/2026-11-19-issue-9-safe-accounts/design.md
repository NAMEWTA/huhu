# Safe、模块凭据和本机保护的分工

<a id="current"></a>

## 当前调用链

代码核查基线为 `feature/issue-fix@9f870c0fad0c1d0538b9783214d2f4a3a3278b10`，与 [Issue §10](source.md) 链接的 `913264045cee1818497a37a57715c664aa85a1ae` 不同。根规则已从 CLAUDE.md 改为 AGENTS.md。以当前工作区及上游默认分支源码为开发依据，Issue 的固定提交仅供追溯。以下是静态证据。

| 入口 | 当前数据流 | 切换点 |
| --- | --- | --- |
| [Safe UI](../../../../plugins/safe/src/ui/SafeModule.tsx) → [能力注册](../../../../plugins/safe/src/engine/index.ts) → [Safe](../../../../plugins/safe/src/engine/safe.ts) | SafeModule 刷新 safe.status 和 safe.items.list；apply 用 desktopOnly 注册并提供 secretUse。itemSave 把 name/account/type/allowedModules 写入 items 元数据，单独写 sealed/<id>.bin。keyring.json 包装 DK。itemSave 的两次文件写不能保证目标复合更新原子。 | 替换为条目、嵌套账号、标签与单次提交。保留设置/解锁/锁定/改密基础，显式错误区分损坏和空库。 |
| [SSH 表单](../../../../plugins/ssh/src/ui/SshModule.tsx) → safe.items.save → [HostStore](../../../../plugins/ssh/src/engine/hosts.ts) → [连接管理](../../../../plugins/ssh/src/engine/manager.ts) | UI 会分别为密码、私钥或口令写 Safe 并保存 secretRef/passphraseRef；engine/index.ts 注入 secretUse，连接构建认证配置前解析。 | 直接以 SSH 主机为所有者，一个 handler 接管保存与清理，沿用已有连接/主机信任流程。 |
| [Git 同步设置](../../../../plugins/versioning/src/ui/sync/SyncSettingsPage.tsx) → [Versioning 注册](../../../../plugins/versioning/src/engine/index.ts) → [VaultSync.netEnv](../../../../plugins/versioning/src/engine/sync.ts) | 页面按 allowedModules 筛选 Safe 条目。netEnv 解析 ref 后建短命 ASKPASS，校验目标主机，给 Git 子进程环境；safe.unlocked 触发暂停同步恢复。auto-sync.ts 将 SAFE_LOCKED 列作认证故障。 | 保存 remote 专属认证、重新绑定和配置错误恢复。现在 Git 参数还传 credential.username，应使新用户名和 token 只经受限输入传递，覆盖命令行、URL、helper 缓存与异常清理。 |
| [自动化 service](../../../../plugins/automations/src/engine/service.ts) → [agent.sessions.launch](../../../../plugins/agent-cli/src/engine/index.ts) → [sessions.launch](../../../../plugins/agent-cli/src/engine/sessions.ts) → terminal.run | 规则 envRefs 经内置调用发往 Agent CLI，它以调用插件身份 resolve 后把值放进子进程 env。SessionsService 以 requestId 合并在途请求。另有 launch.ts 将条目和用户 env 合并，preview 才遮罩；仅替换 envRefs 会漏掉自定义启动环境。当前 headless 路径另从 automations/index.ts 调 agent.launch.resolve，worker.ts → supervised.ts 自行启动并持久化 launch.json；它的收敛归 #4/#5，须逐一检查启动文件和输出。 | Automations 的规则和 Agent CLI 的设置各自解析秘密，单一受控内部执行交接，保留运行身份、恢复和取消。Core 的 restart_env、keep 和输出需要实际验证。[项目启动记录](../../notes/context/agent-launch.md) |
| [Dispatcher](../../../../packages/kernel/src/dispatcher.ts)、[幂等记录](../../../../packages/kernel/src/idempotency.ts)、[查询缓存](../../../../packages/workbench/src/engine-client/query.ts) | write/execute 命中幂等缓存可在重新执行 handler 前返回旧结果；boot 将结果保存到 runtime/idempotency.ndjson。React 查询键含 input。CLI 当前有 --input-json。 | 秘密输入不能成为 query key，敏感读取不记结果型幂等回执；写回执仅含 ID、版本、结果。锁定/禁用/切 Vault 后旧请求不能越过当前锁定检查。与 #6 一起检查敏感参数摘要、审计、CLI stdin 与各入口日志。 |
| [数据包](../../../../packages/vault/src/package/package.ts)、[Git classify](../../../../plugins/versioning/src/engine/sync.ts) | Git 纳入 safe/、ssh/hosts/、agent-cli/spaces/、automations/scripts.json 等，sync/config.json 当前不随 Git 走。Vault 包采集大部分 .huhu，仅排除 runtime/cache/ui/history，恢复遇 ID 冲突可生成新 vaultId。 | 对照实包和真实待暂存文件核验；更新白名单只对今后生效。新格式验证用隔离库，历史资料保持原状。 |

<a id="model"></a>

## Safe 数据模型的两种落盘结构

| 结构 | 原子性与恢复 | 取舍 |
| --- | --- | --- |
| A · 每条目一个加密载荷，内含稳定账号数组；标签目录单独加密 | 编辑一个账号只改其条目，密文中校验 ID、版本。跨条目删标签或同时建标签与条目需一个可恢复的复合提交。 | 适合现有文件布局、按条目冲突和 Git 差异；需要设计标签与条目共同可见的边界。 |
| B · 整个个人密码库一个加密快照 | 条目、账号、标签一次原子换文件，恢复和标签更新简单。 | 一个标签或账号变化即重写整库，独立条目争用同一版本，大库读改与 Git 冲突代价较高。 |

推荐 A。使用现有 [VaultFiles 的 expectedVersion/原子写](../../../../packages/vault/src/write.ts) 及[操作记录](../../../../packages/vault/src/operations.ts)思路。拟以一个原子发布的版本清单指向加密标签目录和各条目不可变版本。修改写新密文、验证引用，再在 Safe 单写队列中对旧版本做检查并切清单；读者/备份固定同一清单版本。未提交版本可回收，发布前后均保留完整的一代。清单只含随机 ID、必要版本与密文定位。涉及更换 keyring 或恢复新格式备份时将匹配 keyring 纳入一致快照；垃圾回收等待在途读者、备份结束。成本是版本清理和冲突处理；若 S0 实测规模及整库重写满足需求，可用 B，必须维持相同接口和可恢复语义。

复用 [crypto.ts](../../../../plugins/safe/src/engine/crypto.ts) 的 scrypt、随机 DK、KEK 包装、随机 12 字节 IV、AES-256-GCM、AAD 及密码校验。加密范围包含条目的名称/网址、tagIds、账号五字段和标签名称/颜色。AAD 绑定版本、库的稳定加密身份、记录类型和 ID；库身份随加密材料恢复，不绑定可能在整 Vault 导入时重生成的外部 vaultId。模块本机凭据相反，按目标 Vault/实体绑定。改主密码原子替换包裹同一 DK 的 keyring，失败旧密码仍可用，成功后新密码有效。有针对性地校验文件结构、解密及主密码错误，防止初始化覆盖损坏库。

<a id="protection"></a>

## 模块自有认证的最小宿主选择

当前项目没有已接线的跨平台 OS 钥匙串函数。[EngineSupervisor](../../../../apps/desktop/src/main/engine-supervisor.ts) 通过 utilityProcess.fork 启动 Engine。Web/MCP/CLI 的业务都在已运行的 Engine 执行，浏览器无需保存模块凭据。两个可比较的实现如下，均无可枚举的公共凭据目录或对外通用解密 RPC。

| 候选 | 密钥/密文及访问路径 | 代价与必须取得的证据 |
| --- | --- | --- |
| A · Engine 加载 OS 钥匙串绑定 | 每 Vault/插件在系统用户的钥匙串生成独立随机包装/数据密钥，模块拥有自己的受保护文件。模块内调用成熟库，按 Vault、插件、实体、用途、代号绑定密文；密文与本机绑定信息放在模块的本机数据区，脱敏定义留 Vault。CLI 无需桌面弹窗才能使用已配置模块。 | 推荐先验证 @napi-rs/keyring；需验证签名/打包、utilityProcess 加载、三平台可用后端、Linux 无 Secret Service 或会话锁定的行为及并发首次创建。 |
| B · Electron main 使用 safeStorage 封装本机钥匙 | 模块业务和密文仍属 Engine，各插件的一小段钥匙经受限的 main ↔ Engine 内部通路保护；不把此接口暴露给 renderer 或外部工具。 | 减少原生 npm 依赖，但绑定 Electron main，独立 Engine/无桌面环境须有明确行为。Linux 弱后端、暂不可用、不同主机登录会话必须实测；不得启用明文或等效弱回退。[Electron 官方说明](https://www.electronjs.org/docs/latest/api/safe-storage) |

建议以 A 做 S0 三平台验证后定案，npm 发布的 @napi-rs/keyring 2.1.2 声明 MIT。秘密采用现有认证加密原语，提取无领域语义的最小复用函数；Safe 主密码与这些本机钥匙没有关联。首写在模块的 Vault 写者内串行创建/读回钥匙，仅在确实首次设置时生成。已有密文时钥匙缺失或暂不可访问，停止使用、提示重试或重新配置，不用新钥匙覆盖旧密文。路径从可信 Vault 信息派生，不接受调用者注入插件命名空间。[keyring-node](https://github.com/Brooooooklyn/keyring-node)

2026-11-19 已在 `temp/sources` 比对默认分支的本地 HEAD 与远端 HEAD。当前 [Motty 的 keystore](../../../../temp/sources/motty/internal/vault/keystore.go) 来自 main `2daa9db582e16edf60a60b7ada26f47f808f973c`，可借鉴错误分类；其相邻文件后备不能满足本机秘密与备份隔离。[one-mail](../../../../temp/sources/one-mail/src-tauri/src/commands/backup/native.rs) main `d1be24d5bb83c2da7123b167f119d5abd169b0af` 的原生备份含恢复密钥元数据，Huhu 单独绑定模块认证。[ORCA 的启动环境](../../../../temp/sources/orca/src/shared/agent-launch/startup/host-account-launch-env.ts) main `8bc232f5ed8b4b36fec0c5f0f85ab96b4c0ccdf3` 提供原生账户与启动环境分层的参考。[herdr-core 启动请求](../../../../temp/sources/herdr-core/crates/herdr-core/src/api/run.rs) master `c7517808d64f06609e4ecf0db1757005373cc3a3` 与 Huhu 实际捆绑 Core 的运行验证分别记录。采用上游文件前重核默认分支、[批次来源清单](../2026-11-19-huhu-issues-3-10/sources.md)、文件许可、打包版本与对应源码；使用 Huhu 自有交互与资产。

<a id="operations"></a>

## 调用、错误和写入所有者

**用 UI 改 Google 的第三个账号，同时另一端请求密码。** 拟议 safe.accounts.update 接受 entryId、accountId、expectedRevision、指定字段及密码动作 keep/set/clear。只修改指定账号，返回 ID、revision 和 hasPassword；更新不回传个人字段。safe.accounts.reveal 需单独授权和当前解锁状态，只按 entryId+accountId 返回该次所请求的密码；主密码无读取途径。若旧版本提交，返回版本冲突、保留表单供重读。Engine 以解锁代校验在途读写；锁定、换 Vault、停用时使该代失效、取消查询并移除旧缓存/显隐状态，晚到响应丢弃。UI 收到锁定事件时即清除，不等待下一次轮询。已交给用户或外部工具的明文不宣称可以追回。

**用 CLI 修改 Git remote 后做第一次同步。** 获开放权的配置 handler 接收 remote、预期配置版本、用户名和显式 keep/replace/clear 动作；秘密输入走 #6 的安全输入通路。Versioning 按规范化的协议、主机、有效端口、仓库目标绑定认证。更换目标使旧绑定失效，返回新的配置 ID/版本、认证就绪状态；新目标缺认证时由同步页或已开放 CLI 修复。成功保存后由系统 Git 的受限 ASKPASS 读取本次连接所需值，使用实际目标校验，取消/失败清理，禁止重定向时交给其他主机。响应中只有状态。Git SSH URL 走系统 SSH。Safe 锁定时同一请求仍可完成。

**自动化向目标进程传环境。** Automations 以规则/脚本 ID 和执行 ID 定位自己的配置，Agent CLI 以配置 ID 定位自身启动环境。入口只接所属模块配置与当次意图，供密路径对公共工具不可调用。按 #4/#5 唯一派遣链将仅本次使用的值交给目标启动，保留 requestId 与会话对账；重试返回原会话或明确失败。当前 terminal.run 的 env 可进入 Core 的 restart_env。S0 用无价值标记串检查真实 Core 版本的恢复文件，选择不序列化保护值的交接方式（例如经已受控的一次性启动通道由子进程取用），同时验证终止后清理。仅在退出时 rm 不能消除运行期间或崩溃留下的副本。若该通路不可用，受影响的秘密环境启动应报具体不可用，不复制到任务/命令行继续；普通环境、原生 CLI 登录可独立验收。

**模块配置的崩溃窗口。** 先创建新受保护版本，验证后在所属配置的串行提交内比较 revision、原子切换本机绑定，成功后清理旧版本。没有更新权限、只读、写失败或版本冲突都不能半改原配置。崩溃留下的暂存仅由相同 Vault/插件清理。主机/邮箱删除只在配置提交后清理其最终无引用版本；同名实体、同地址账号、复制到新 Vault 的配置均不能命中其他秘密。导出/复制的新定义无本机绑定；即使恢复保留原 vaultId，也须分辨新实例和已授权的原本机绑定。重新填写后保存新绑定。

<a id="backup"></a>

## Git 与新格式备份的故障边界

| 数据 | Git 候选内容 | Vault 包与恢复 |
| --- | --- | --- |
| Safe 个人资料 | 仅一致的受保护清单、条目/标签密文及匹配的包装 keyring；旧明文元数据、日志、暂存不参加新同步。冲突保全双方密文版本，不做逐行拼接。 | 固定同一代连同 keyring 一起导出；新目录用备份当时的主密码解锁和逐项核对。丢钥匙/忘密码无虚假恢复。 |
| SSH、Git、Agent、Automations、Mail 配置 | 仅现行白名单允许且经分类的非秘密配置；Git 的本机 remote 配置沿用现有范围。 | 非秘密定义及业务持久数据按模块规则恢复；模块钥匙、运行绑定和临时运行环境排除，新机标记需重新配置。Mail 数据完整性见 #8。 |
| 操作日志、ASKPASS、Core 状态、旧包与备份 | 不新增秘密；另查真实暂存、已有受跟踪文件、外部工具缓存与历史对象。 | 包导出独立检查文件清单和字节；Git 忽略规则不影响包选择。既有 Git 历史及用户保存的旧包不由发布切换自动改写或销毁。 |

<a id="clean"></a>

## 新安装与测试资料

用户的清洁安装决定及历史要求的适用范围见[规格](spec.md#installation)。初始化仅在新建的隔离测试目录进行，自动化以合成 Google 条目、三个稳定账号 ID 和可辨识的无价值字段验证去耦、密码轮换和整包恢复。损坏的新库按损坏返回，禁止以初始化修复。P9 沿用原交付号，核对初始空态、各模块首次配置入口与随附的新格式示例。现有产品代码中的旧消费者在整合点一起替换。

<a id="hosts"></a>

## 共享前端条件

桌面 package 锁定 Electron 44.9.1，官方对应 Chromium 152.0.7977.167。Web 的目标是 Baseline Widely available。已检索并获取 forms、accessibility 和 validate-input-after-interaction。表单采用标签、文字错误、交互/提交后显示校验信息；:user-invalid 从 Chromium 119 支持且指南列为 Widely available。仅在显示错误时关联错误说明，显隐/复制和标签颜色都有文本名称。普通 LAN HTTP 的 Clipboard 能力按 #6 宿主条件处理；不可用时说明原因，允许用户主动显示后手工复制，不虚报成功。端上实测留待 S2/S4。[Electron 版本对照](https://releases.electronjs.org/release/v44.9.1)
