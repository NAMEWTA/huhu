# W04 Vault 持久化与索引

## W04.1 Vault 生命周期与启动页

- 目标：启动页能打开已有文件夹、新建空 Vault、打开示例 Vault；切换与关闭 Vault；只读打开。
- 依据：[workbench](../modules/workbench.md) §2–3；ACC-WB-01、02、03（切换部分，草稿在 W06）。
- 前置：W03.5、W02.3。
- 位置：`packages/vault/src/{vault,lock,paths}.ts`、`packages/vault/src/platform/`、`packages/workbench/src/pages/launch/`、`apps/desktop/src/main/vault-windows.ts`。
- 复用：R-06；原型 `vault.jsx` 启动页结构（R-55）。
- 实现要点：`vault.json` 创建与读取；写者锁与陈旧锁回收；路径守卫（security §1）；只读模式（所有写能力返回 `READ_ONLY_VAULT`）；本次运行最近列表（Main 内存）；新建 Vault 写默认设置与默认自动化规则文件（规则内容由 automations 插件提供的模板函数生成，W13 前先由 vault 包内常量生成同一份内容并在 W13.1 移交）；示例 Vault 复制到用户选择的空目录。
- 异常：目录不存在、无权限、被另一窗口打开（聚焦该窗口）、被他处 Engine 锁定（只读打开选项）。
- 测试：集成测试锁竞争（两个 Engine 同一 Vault）；路径守卫单元测试（`..`、绝对路径、符号链接、Windows 保留名）；E2E ACC-WB-01、02。
- 完成：ACC-WB-01、02 通过；切换 Vault 后旧 vaultId 事件被客户端丢弃（单元测试）。

## W04.2 原子写、回执与操作日志

- 目标：单文件原子写与多文件操作在崩溃后可恢复。
- 依据：[data-model](../data-model.md) §7。
- 前置：W04.1。
- 位置：`packages/vault/src/{write,receipts,operations}.ts`。
- 复用：R-07。
- 实现要点：`writeFile`/`rename`/`delete` 带 `expectedVersion`；操作日志 `prepared → committed`，步骤级 `done`；备份；启动时恢复与 `needs_attention`；30 天清理。
- 异常：磁盘满、权限错误 → `WRITE_PARTIAL` 附 opId；第三方中途修改 → `needs_attention`。
- 测试：故障注入（每一步后模拟崩溃：子进程 `process.exit`）后重启验证回滚或完成；版本冲突测试。
- 完成：所有断点测试通过，结果与 data-model §7 描述一致。

## W04.3 语义 Markdown 仓储

- 目标：各插件通过统一仓储读写语义文件，未知键与格式保留。
- 依据：data-model §4–5；ACC-AR-05（通用部分）。
- 前置：W04.2、W03.1。
- 位置：`packages/vault/src/semantic/{repository,frontmatter,filename,kinds}.ts`、`packages/contracts/src/kinds/*.ts`。
- 复用：R-10、R-12。
- 实现要点：kind 注册（目录、zod 模式、文件名规则）；`read(kind, id)`、`list(kind)`、`create`、`patch(id, changes, expectedVersion)`（只改变化的键，保留注释/顺序/未知键/EOL/BOM）、`rename`（标题变更）；解析失败与 id 冲突登记到问题列表；未来 schema 只读。
- 异常：坏 YAML、缺 id、id 冲突、schema 过新。
- 测试：`edge-vault` 往返字节比较（未修改字段的文件除被改的键外字节不变）；W01.5 夹具全部可解析。
- 完成：测试通过；问题列表可通过能力查询（供 W18 健康中心）。

## W04.4 文件监听与外部修改

- 目标：外部程序对 Vault 的修改在 1 秒内反映到索引并发布事件；自身写入不产生回声。
- 依据：data-model §3（重命名配对）；[knowledge](../modules/knowledge.md) §5 外部修改。
- 前置：W04.2。
- 位置：`packages/vault/src/watch/`、`packages/vault/src/identity.ts`。
- 复用：R-08、R-09、R-07（回执）。
- 实现要点：@parcel/watcher 订阅 Vault 根（忽略规则 data-model §2）；250ms 批处理；回执过滤自写；`dev:ino` 重命名配对与哈希回退；`vault.fileChanged` 事件；Linux inotify 上限错误回退轮询（30 秒全量 stat 比较）并登记健康问题。
- 异常：Vault 根被删除或卸载 → Engine 进入只读并提示。
- 测试：集成测试：外部创建/修改/删除/重命名文件、自写不回声、重命名保持 note id。
- 完成：测试三平台通过。

## W04.5 内存索引、全文检索与 vault 能力

- 目标：`vault.info`、`vault.tree`、`vault.search`、`vault.readFile`、`vault.reindex` 可用；命令面板可搜索。
- 依据：data-model §10；interfaces §2（kernel 行）；ACC-WB-07。
- 前置：W04.3、W04.4、W02.5。
- 位置：`packages/vault/src/index/{tree,entities,links,search}.ts`、`packages/kernel/src/capabilities/vault.ts`。
- 复用：R-11、R-26。
- 实现要点：启动全量构建在后台进行，构建期间 `vault.tree` 可用（先给出路径树）、`vault.search` 返回 `indexing: true`；双链解析与反链；增量更新；重建可取消；Orama 中文分词使用 Orama 内置 tokenizer 加 CJK 二元切分（bigram）处理中文。
- 异常：取消重建保留旧索引；超过 10 MiB 的文件只索引元数据。
- 测试：bench（quality §3 索引与检索指标）；中文检索单元测试；ACC-WB-07 E2E。
- 完成：测试通过；scale-vault 指标记录在 PR。

## W04.6 数据包导出与导入

- 目标：导出受管数据包、从数据包创建新 Vault。
- 依据：data-model §9；ACC-WB-04、ACC-SY-08。
- 前置：W04.3。
- 位置：`packages/vault/src/package/{export,import}.ts`、`packages/kernel/src/capabilities/package.ts`。
- 复用：依赖 fflate。
- 实现要点：清单与哈希；附件可选；导入前完整校验；导入到临时目录再移动；保留或重生 vaultId。
- 异常：恶意包（quality §1 夹具）全部拒绝且不留文件；导出中取消删除半成品。
- 测试：往返哈希一致；恶意包测试。
- 完成：ACC-WB-04 通过（ACC-SY-08 的保险箱部分在 W11 完成后复测）。
