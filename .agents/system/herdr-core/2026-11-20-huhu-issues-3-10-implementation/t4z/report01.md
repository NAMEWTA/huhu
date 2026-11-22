# #9 模块凭据与 #10 Widget 贡献独立审查

- 共享根 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation
- terminal_address — t4z
- task — task01.md
- 任务文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t4z/task01.md
- 报告文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t4z/report01.md
- Core — Windows 本机 wta / 346bd5608735e3fcb27f9d01f5c8008e / 0.1.21，`HC_TERMINAL_ID=t4z`。清单指向 `task01.md active`。
- 执行结果 — done（独立审查已完成，签收建议见下）

## 结论

| 冻结候选 | 规格轴 | 规范轴 |
| --- | --- | --- |
| #9 P0.2 · `7174fc8d59693575cbc16227ec296acdd4c219e5` | **暂缓签收。** 已提交的非秘密定义、旧版本失败保护、隔离和同进程串行提交通过。新实例仍有待重配条目时，已清空的本机材料无法回收。独立只读进程的在途取用也可能因写者回收而失败。 | **有条件通过。** Vault 写者锁、条件原子写、路径约束和受限保护适配器使用得当。需明确并约束取用端的进程所有权，或提供跨进程保护。建议核对设计约定中通用加解密原语的提取。 |
| #10 W03-01 · `15403bd772d65ae486688ffca821b271dde50605` | **暂缓签收注册契约。** 实际 SSH 贡献、清单、未修改的共享 Schema 和授权投影通过。注册后的定义能继续漂移，破坏稳定的目录和校验合同。 | **暂缓签收。** 注册表验证了一次外部传入对象，后续仍保留并返回该对象及其可变的嵌套配置；校验与所有权需要在同一入口确立。 |

## #9 P0.2 模块凭据

### 规格轴

1. **P1 · 待重配条目使同插件的其他实体无法清理。** P0.2 要求配置提交后回收无引用的本机版本。复制一份包含两个已配置实体的合成 Vault，用新本机实例 ID 打开，只重配第一个实体后清空它。清空回执为 `unconfigured`，取用也已拒绝。第二个实体正常显示 `needs-reconfiguration`。此时 `recover()` 返回 `false`，密文和钥匙计数分别仍为 3 和 2，与清空前相同。清空另一个复制条目后，`recover()` 才返回 `true`，计数回到源 Vault 的 2 和 1，源实例两个实体仍能认证。原因是遇到任何 `configured` 非空且无本机快照的条目后，回收在计算完整引用集合前直接返回。导入/复制后的预期待重配与本机曾有引用但意外丢快照走同一分支。建议保留损坏时的保护，同时让确定从未绑定本机的条目允许同作用域正常回收。证据为 `module-credentials.ts:139、340–353`、Core `t5f`。备份产品入口仍属后续，本例用本切片已有定义和本机实例注入直接验证。
2. **P2 · 独立只读进程的在途读取没有保护。** `use()` 接受只读 Vault。一个只读子进程调用既有 `TestProtection` 取用同一版本的两个合成用途，首个保护后端读取暂挂时，由持锁写进程提交清空。释放读取后，子进程返回 `missing-key`，业务回调没有运行。同进程的测试能保留旧版本，原因是队列和 pin 都在模块进程内。若产品允许独立只读 Engine 取用凭据，需要覆盖提交与读取竞态；若只支持写者 Engine 取用，装配与 API 应明确拒绝其他进程的该路径。证据为 `module-credentials.ts:54、300–330、340–353`、`packages/vault/src/vault.ts:194–225`、Core `t5m`。
3. **已通过的范围。** 隔离测试覆盖同名实体、同 portable Vault ID 的两个本机实例、不同插件和不同用途。检查了显式保留、替换、清空、删除、重开、旧 revision 并发仅一个成功、在途同进程读者、只读拒写、取消、写失败、锁定／拒绝／不可用和缺钥匙。补测保留动作目标 A→B→A 时旧认证没有恢复，旧 revision 得到 `conflict`。保护后端锁定时原 revision 和认证保留，恢复后同一 revision 重试成功。四个异常退出窗口覆盖暂存后发布前、发布后、回收及已创建钥匙。对照 `credentials.test.ts`、`test/fixtures/crash-credentials.ts`、Core `t58、t5f`。

### 规范轴

- 私有配置路径按插件派生，Vault 内只有实体、随机 revision、非秘密定义和配置意图。本机 scope 由宿主注入的实例与插件确定。密文 AAD 还绑定实体、用途、认证目标、钥匙代和密文版本。代码复用 Vault 写锁及路径守卫，以一次 `VaultFiles.write(expectedVersion)` 选定版本；同进程队列覆盖查 revision、暂存、发布与清理。保护读只辨认精确钥匙条目，缺失、锁定、拒绝、不可用各有语义。新增文件没有 Safe 插件、密码、会话或 reveal 依赖，也没有公共注册入口。后续授权模块持有取用端范围属于装配责任。证据为 `module-credentials.ts:20–32、75–83、188–250、291–330`、`versions.ts:42–54、95–168`。
- 生命周期的设计判断见规格轴第 2 项。另有一项复用偏差：`design.md#protection` 约定提取无领域语义的共用函数，当前 `protection.ts:32–63` 与 Safe 的 `plugins/safe/src/engine/crypto.ts:29–62` 各自维护随机钥匙与 AES-256-GCM 基础流程。两个封包、AAD 域和钥匙保持独立是正确的，建议仅对照认证加解密原语的共用部分。现有 Vault、Node API 和本地上游对照已有证据，未发现引入依赖或未经查证的新基础设施。

### 后续范围

P0.2 的私有候选没有切换业务消费者。冻结树的 SSH 仍从 `safe.items.save` 和 `secretUse` 取用，Git 同步也仍读取 `secretUse`。P10.2 在组合版本验证 Safe 未初始化、锁定和停用时真实消费者独立工作。候选 A 正式保护驱动、Engine 装配、宿主的本机实例登记、实际包与 Git 恢复隔离，以及 macOS/Linux、安装包升级和断电耐久性均待各后续项取证。两个 Windows 运行证据分别是 t1b 在 Electron utilityProcess 的前置试验，以及 t25 和本次复跑用实际冻结事务与原生保护的独立 Node 进程重启。

## #10 W03-01 Widget 贡献

### 规格轴

1. **P1 · 校验和静态注册之后仍可产生目录与保存校验漂移。** 以 SSH 定义的普通结构副本注册，调用者在注册后改默认宽度，目录立即从 3 列变为 4 列，原共享定义仍为 3 列。实际 SSH 注册使用工厂生成的定义，其外层、尺寸及能力项被冻结，但 JSON Schema 的嵌套对象可变。读取目录条目并临时将嵌套的 `hostId.minLength` 改为 2 后，目录读到 2，供 W02-02 使用的同源 Zod 解析器仍接受单字符 ID。普通描述也能用仅为 JSON 对象的 Schema 字段绕过工厂的生成约束。这里复现的是同一受信代码库中的引用与数据所有权问题。建议用受信的构造入口一致地产出运行期规则与不可变的纯数据描述，注册表保留已验证的快照，并对普通注册值及嵌套字段增加回归断言。证据为 `packages/contracts/src/home.ts:88–146`、`packages/workbench/src/contributions.ts:105–144`、Core `t5j`。
2. **实际静态装配与投影通过。** 桌面入口以静态 import 导入 `sshUi`。该入口使用同一 `sshHostsWidget` 描述、内置 SSH 清单和原 `SshHomeWidget`，清单局部 ID 为 `hosts`，类型键为 `widget:ssh:hosts`。卡片实际调用 `ssh.hosts.list`，与唯一必需能力相符。配置只允许可选非空 `hostId`，默认 `{}`，默认尺寸 3×2、下限 2×2、上限 6×6，实例数不限。复跑拒绝漏报、多报、重复、归属或标题不符、无来源及外部来源。插件快照未知和停用时目录不提供组件，恢复启用后可用，撤掉必需能力后变为 `unauthorized`；kernel 的可选动作撤权仅关闭对应授权位。证据为 `plugins/ssh/huhu-plugin.json`、`plugins/ssh/src/shared/home-widget.ts`、`plugins/ssh/src/ui/index.tsx、HomeWidget.tsx`、`apps/desktop/src/renderer/main.tsx:78`、Core `t57、t5k`。

### 规范轴

- 符合复用顺序。沿用 ContributionRegistry、PluginManifest、`WIDGET_ID`、Zod 和现有 SSH 卡片。实际来源由宿主静态导入，`origin` 字段用于核对已有可信来源；将来应继续由装配层静态接入 kernel 和内置描述，外部插件数据继续通过原有独立宿主处理。注册批次在 Widget 检查成功之后才改动注册表，注销句柄保护通过。
- `assertHomeWidgetDefinitions` 用 `parse()` 检查但丢弃解析后的对象，`register()` 浅冻结外层贡献，`getHomeWidgetCatalog()` 返回原定义引用。上述实测违反定义所有权及稳定性，签收前需解决。SSH 的 HTML/CSS、宿主调用和真实业务组件沿用原实现；Windows 的两个运行环境通过同一静态模块和隔离投影验证。

### W02-02 接口与 W06 范围

- 另读 W02-02 固定提交 `922df3626f87a8d6674f4ccd15b2513eeee74177`。其 `defineDashboardUpdate` 接收以规范 `widgetType` 索引的服务端规则 Map。SSH 可提供 `sshHostsWidget` 的 `minSize`、`maxSize`、`maxInstances` 和单独导出的 `sshHostsWidgetConfigSchema`，由后者执行 `safeParse(instance.config)`。目录的 JSON Schema 用于信息展示，保存用同一来源的运行期解析器。两候选分支独立，本次按接口和已有 W02-02 证据核对，未组成新的集成版本。代码位置为 `packages/kernel/src/capabilities/home-dashboard.ts:67–110`。
- 正式装配要接当前 Vault 插件状态与 #6 当前调用者授权。W02-02 当前只按 Map 查规则，其 handler 没有消费调用者授权。W06 应实证停用／无权类型不可新增或执行，同时能保留既有未知类型及其未改动配置。旧首页仍走 `getSnapshot().homeWidgets` 的旧启停过滤，目录通过 `getHomeWidgetCatalog` 的检查属于新路径。ACC-DASH-05／17 的实际搜索筛选、空态、添加、授权变更、回读和安装版联合验收由 W06 证明，按实例选择主机由 W05-07 验收。Widget 和 Safe 原型资源指纹均匹配各自确认记录；记录仍将相应界面列为待用户确认。

## 产物与验证记录

业务代码以两组 Git 对象为准。#9 对照父提交 `bf3942e456c03cd7a4a4070e230557bb45e1ca9c`，#10 对照用户指定的 `0cda9b407f15dffc2d4fcb20fdd7387ba12485ad`。从对象检查所有新增文件及差异，使用一次性目录解包运行需要的文件，复用集成检出的依赖。两处 Git 差异检查通过。提交、推送、派遣及新增 worktree 均为零。业务与用户未提交修改全程只读。新增交付为本报告。

| 实际检查 | 结果 | 证据 |
| --- | --- | --- |
| #9 冻结测试，Windows x64、Node 24.21.0、Vitest 3.2.7 | `vitest run packages/kernel/test/credentials.test.ts --maxWorkers 1`，11/11 通过，包含 4 次真实子进程退出重开，退出码 71–74。 | Core `t58`；历史 [t25 报告](../t25/report01.md) 中的 Kernel 76/76 是原实现会话的全组结果 |
| #9 合成定向探针 | 目标震荡及锁定重试通过；复制库清空后的材料保留，以及独立只读进程的 `missing-key` 已复现。 | Core `t5f、t5m`；实测步骤及计数见上 |
| #9 Windows 原生候选 A | 复用迁移后的 fixture，实际冻结事务在 PID 19980 新建随机系统测试条目，PID 46180 重启并读回、清空。父进程精确回读条目已不存在。全部为合成输入；系统未使用真实凭据或 provider 历史。 | Core `t5h`；[t1b 报告](../t1b/report01.md)；`D:/Document/code/huhu/temp/issue-baseline/credentials-evidence/t25-credentials-evidence/verify-candidate-a.mjs` 和原 `candidate-a.log` |
| #10 冻结测试及定向探针 | `vitest run plugins/ssh/test/home-widget.test.ts --maxWorkers 1`，7/7 通过。两个补充探针记录已确认的引用与嵌套漂移。 | Core `t57、t5j`；[t3b 报告](../t3b/report01.md) |
| #10 隔离双运行时 | 复跑既有 Vite 投影夹具；Windows Edge 157.0.4341.60、Electron 44.9.1 / Chromium 152.0.7977.167 均通过，使用实际 SSH 注册和组件身份，核对未知、启用、撤权、停用及缺 preload。Vite 仍报告既有 React 依赖的 `use client` 构建提示。 | Core `t5k`；原夹具 `%TEMP%/huhu-t3b-widget-runtime.cjs` |
| 原型版本 | `fingerprint.mjs --expect` 分别验证 Safe `d3b206857caed6e0e1d2c0d6ee505a0387c8f44fdedc249efd578de4f4d13f83` 和 Widget `e05833795a1bea4a6d93a90396ee9da2b8d3070d79c5ba413217327ce0156342`。 | 对应 Change 的 `prototype-review.md` |

## 阻碍与接续

本任务的审查与报告无阻碍。建议先修复已复现的回收和注册表所有权缺口，再由新编号复核对应提交。只读凭据取用的进程合同需在依赖它的消费者接入之前确定。

### Modern Web Guidance

我检索了结构校验与可访问 Widget，读取了 `js`、`security`、`html` 和 `accessibility` 指南。本轮只读审查，使用了其中关于嵌套结构数据复制与所有权的原则核对元数据漂移。

## Lead 验收

由 Lead 核验后追加。
