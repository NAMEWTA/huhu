# #5 T1.1 正文输入身份返工独立复核

- 共享根 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation
- terminal_address — t54
- task — task02.md
- 任务文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t54/task02.md
- 报告文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t54/report02.md
- 执行身份 — Windows Core wta / 346bd5608735e3fcb27f9d01f5c8008e / 0.1.21，HC_TERMINAL_ID=t54
- 执行结果 — done

## 结论

- **规格轴**：原反例已修复，正常正文、配置、旧记录与串行评论合并均通过。并行条件写仍会丢失已确认的正文或评论，HTTP 还接受会被 UTF-8 编码替换的孤立代理项。这两项均在冻结父提交复现。完整 T1.1 的并发写与 HTTP 边界验收暂不通过。
- **规范轴**：返工只改 Tasks 服务和其真实 HTTP 回归，复用 Vault 现有区段序列化与解析。冻结差异和 Tasks 类型检查通过，未发现返工新增的项目规范违规。现有条件写检查与实际写入分离，仍违反 Issue 对任务临界区的明确约束。

## 审查范围

父提交 `a5d82cb704cdd44fbae387518f7d1c4246908fb1`，候选 `6cc99edd0feefe75e601e8aded0e4329fa927f56`，树 `445dd878f5033e13321b0f97912c07a045444a87`。候选是指定父提交的直接子提交。差异仅为 `plugins/tasks/src/engine/service.ts` 和 `plugins/tasks/test/persistence-http.test.ts`。Windows x64，Node 24.21.0，Vitest 3.2.7。两份源码直接取自 Git 归档，临时副本复用已安装的锁定依赖。每组命令使用隔离的配置目录和合成 Vault。 [T1.1](../../../../dev/archive/changes/implemented/feature_2026-11-19-issue-5-task-automation/tasks/T1.1-create-task.md) · [本次返工记录](../t6n/report01.md) · [原独立审查](report01.md)

## 规格轴

### P1 · 并行条件写会丢失已确认的正文或评论

在真实 Engine HTTP 中，两条带相同 `expectedVersion` 和 `baseEditHash` 的请求并行编辑同一任务正文。候选的四次试验全部双成功，响应都报 revision 2，但正文和哈希各异。第一条为 `first body / 625d05cce2a8cd50`，第二条为 `second body / 400a350c4384580b`。磁盘和后续读取四次都只剩第二条。

另四次并行提交正文更新和评论，交替启动请求顺序。两个请求每次都返回成功，但最终文件两次只保留新正文（revision 2），另两次只保留评论和旧正文（revision 1）。父提交的两组试验各四次，结果相同。短时间内的两条写入都能通过同一个旧版本检查。后续原子替换依次写入各自基于旧文件生成的完整内容，`withRetry` 收不到冲突。

修复后，同一旧快照编辑两个不同正文应只有一个成功，编辑与独立评论应合并保留。版本读取、校验和提交需要覆盖同文件临界区。影响包含 Tasks 保存、评论与基于 revision/hash 的加工身份。定位 `packages/vault/src/write.ts:50–70`、`packages/vault/src/semantic/repository.ts:129–153`、`plugins/tasks/src/engine/service.ts:142–149,208–237`。 [Issue 的临界区要求](../../../../dev/archive/changes/implemented/feature_2026-11-19-issue-5-task-automation/source.md)

### P2 · 孤立代理项使 HTTP 返回的输入身份与磁盘不一致

创建正文为 U+FFFD 的任务，随后通过真实 JSON HTTP 提交正文为孤立 U+D800（JSON 转义值）。候选接受更新，写响应的正文仍为 U+D800，hash 为 `aedc86f4d1cabb68`，revision 为 2。磁盘的正文仍是 U+FFFD，随后读回 hash 为原值 `4b045974ea3758f4`，revision 却为 2；原始 revision 为 1。父提交结果相同。Markdown 解析发生在 UTF-8 编码之前，仓储写入 `Buffer.from(next)`，返回 DTO 仍从内存中的 `next` 生成。

HTTP 拒绝孤立代理项，或在计算身份、生成写响应之前统一为实际可持久化文本，均可消除不一致。有效中文、补充平面 emoji 和多行 CRLF 均通过正常探针。定位 `packages/contracts/src/dto/task.ts:65–76`、`plugins/tasks/src/engine/service.ts:230–237`、`packages/vault/src/semantic/repository.ts:142–153`。

### 已验证的行为

| 场景 | 候选实测 |
| --- | --- |
| 原报告反例 | 同样的 `New input` 改成 `"\nNew input\n"`。磁盘正文、即时写响应和再次读取均保留原正文、hash `41704227570599c3`、revision 1。父提交同请求的正文和 hash 相同，revision 从 1 升到 2。候选内置 HTTP 回归另覆盖混合 CRLF/LF 边界。 |
| 改正文并重开 | 真正改正文时增加一次 revision，hash 改变，重启 Engine 后值一致。附加探针以含中文、emoji、CRLF 和代码围栏的正文验证序列化回读。磁盘保留 BOM、区段前 CRLF 和尾随空白、已追加评论及区段后字节，代码内的字面 `</task>` 转义后可回读。 |
| 旧记录、执行配置和顺序追加评论 | 在合成旧文件中移除 target 后读回，旧 `baseInputHash` 可跨单独评论追加把 target 补为显式 new，hash/revision 均不变。改模型时 hash 改变且 revision 加一。旧输入哈希继续尝试改正文返回 `VERSION_CONFLICT`。仅写评论改变文件版本，正文 identity 稳定。 |
| 空正文、坏 Markdown 与请求类型 | 正文清空时增加一次 revision，随后只加空白保持稳定。向空任务提交未闭合代码围栏时，文件保留提交文本，写响应与读回一致地报告 `<task> 未闭合`、正文空及结构阻塞，hash/revision 保持空正文身份；库存行为仍允许保存有问题的 Markdown。数组、对象、数字及 null 正文均返回 `INVALID_INPUT`，磁盘字节不变。 |
| 保存无执行 | 冻结新增及原有 HTTP 测试覆盖重启、旧编辑冲突、外部评论权限、缺配与 existing。合成夹具记录零次 spawn，未创建 `Task Runs`。 |

## 规范轴

- 候选在 `TasksService.update` 中先调用 `replaceTaskSection`，再用与读 DTO 相同的 `parseTaskBody(...).task ?? ""` 比较身份，空补丁沿用读回正文。随后把同一份区段写入原仓储，无新接口、存储格式、依赖或客户端改动。有效输入的序列化和读取行为保持一致。
- Issue 已明确单 Vault 写锁不足以串行同任务异步写入。本轮通过 HTTP 验证了共享 Vault 条件写的既有缺口。修复时仍应复用既有仓储条件写和冲突语义，并覆盖同一任务的正文、评论及其他写入口。 [行为规格](../../../../dev/archive/changes/implemented/feature_2026-11-19-issue-5-task-automation/spec.md)

## 执行记录

在临时归档根执行以下命令。独立探针只存在于临时归档目录，使用冻结 HTTP 测试的启动和清理夹具。全部关键输出收录于以上结论。

```powershell
# 候选提交的仓库回归
node node_modules/vitest/vitest.mjs run --maxWorkers=1 --testTimeout 60000 --hookTimeout 60000 --exclude '**/t54-r2-probe.test.ts' plugins/tasks/test packages/contracts/test plugins/automations/test

# 分别从父提交和候选的归档运行
node node_modules/vitest/vitest.mjs run --maxWorkers=1 --testTimeout 60000 --hookTimeout 60000 plugins/tasks/test/t54-r2-probe.test.ts
node node_modules/vitest/vitest.mjs run --maxWorkers=1 --testTimeout 60000 --hookTimeout 60000 plugins/tasks/test/t54-r2-race.test.ts

# 候选类型检查
node node_modules/typescript/bin/tsc -p vendor/cosmokit/tsconfig.json
node node_modules/typescript/bin/tsc -p vendor/cordis/tsconfig.json
node node_modules/typescript/bin/tsc -p plugins/tasks/tsconfig.json
git diff --check a5d82cb704cdd44fbae387518f7d1c4246908fb1 6cc99edd0feefe75e601e8aded0e4329fa927f56
```

- 候选仓库回归 11 文件，134 通过，11 个 Windows 条件跳过。差异和类型检查通过。
- 同一组五个独立探针，父提交为 2 通过、3 失败，候选为 3 通过、2 失败。减少的一项是原始正文反例。并发探针另从两个版本各采样八次，核对每次响应与最终文件字节。
- 本轮创建的命令 pane `t71`、`t72`、`t74` 均已确认结束，并通过 `hc rm` 删除。

## 本地合入范围与接续

可单独保留 `6cc99ed` 的有效正文规范化修补及其回归测试。完整 T1.1 持久写验收需要关闭并发丢写，并统一 HTTP 接受值、响应和磁盘正文身份。两项需复跑真实 HTTP 和磁盘核对。桌面缺配保存和 existing 选择仍待确认原型版本后的实现及走查，实际 existing 绑定仍由 W6.1 提供。本轮未重新运行 Electron，界面依据沿用原报告与冻结差异。 [原型确认记录](../../../../dev/archive/changes/implemented/feature_2026-11-19-issue-5-task-automation/prototype-review.md) · [W6.1 执行合同](../../../../dev/archive/changes/implemented/feature_2026-11-19-issue-4-agent-cli/tasks/W6.1-bound-input.md)

## Lead 验收

Lead 接收独立复核。T1.1 两提交保持冻结。并发更新与评论需同文件条件写修复，UTF-8 边界需一致后再合入。

由 Lead 追加。
