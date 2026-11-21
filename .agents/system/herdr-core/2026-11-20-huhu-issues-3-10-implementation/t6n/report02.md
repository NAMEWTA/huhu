# #5 并发回归与正文 UTF-8 写入边界

- 执行结果 — 已完成。正文修复可独立合入，组合验证通过。
- 执行终端 — Windows Core `wta` / `346bd5608735e3fcb27f9d01f5c8008e` / `0.1.21`，已核对 `HC_TERMINAL_ID=t6n`。
- 工作树 — `D:/Document/code/huhu/temp/issue-worktrees/tasks`，分支 `impl/huhu-issues-3-10-tasks`。保存报告前确认工作树干净。
- 任务 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t6n/task02.md`
- 报告 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t6n/report02.md`

| 对象 | 提交 | Git 树 |
| --- | --- | --- |
| 保留的 Tasks 父提交 | `6b43fceceee002bd3141648946e1d907c1d9349c` | `2fb6b9c0b9871d7e4e8cd3be9faf53c66cfd68da` |
| 独立正文修复与回归 | `4b4d4f32e09385dbb2f171375f1ee82a4fc1b1b7` | `b22e713d5b155457e7d834de691e7ee29cf03246` |
| 组合验证头 | `29d68b3ae136709191c9c4e515fd2506d17c843a` | `ec71b470b0cd66bd748a18239b8cd40145936a68` |

组合头通过 `git cherry-pick -x` 引入 Lead 的 Vault 提交 `e940403b9ee497ce4c4b1d4015d8b69361ac3db6`。核对了 `write.ts` 和 `operations.test.ts` 的 Git blob，两者均与 Lead 源提交一致。Lead 合入本轮 Tasks 工作时取独立提交 `4b4d4f32e09385dbb2f171375f1ee82a4fc1b1b7`，集成分支的 Vault 保护由原 `e940403` 提供。 [组合校验日志](C:/Users/cdewta/AppData/Local/Temp/huhu-t6n-evidence/task02-combined-checks.log)

## 独立反例与红绿

已复核 t54 的并发丢写和孤立代理项两个反例，使用现有隔离 Vault 夹具经真实 Engine 的 `POST /api/v1/call` 实测。 [t54 独立审查](../t54/report02.md)

| 场景 | `6b43fce` 基线与候选结果 |
| --- | --- |
| 同一编辑快照的两个正文 | `6b43fce` 已通过。一条返回成功，另一条返回 `VERSION_CONFLICT`，真实文件和新读回的 DTO 都是成功的版本，`inputRevision` 只推进一次。组合头复跑通过。 [并发编辑回归](D:/Document/code/huhu/temp/issue-worktrees/tasks/plugins/tasks/test/persistence-http.test.ts:135) |
| 正文和评论并行 | `6b43fce` 已通过。分别先发评论和先发编辑，两次都观察到请求双成功，磁盘与读回都保留评论及新正文，revision 只推进一次。现有 taskId 写队列覆盖两条路径。组合头复跑通过。 [并发评论回归](D:/Document/code/huhu/temp/issue-worktrees/tasks/plugins/tasks/test/persistence-http.test.ts:149) |
| 孤立代理项的创建与更新 | 基线创建三种无效正文都返回 `ok: true`，把 U+FFFD 正文更新成孤立高代理也返回成功。候选创建和更新均拒绝孤立高代理、孤立低代理和反转代理对，返回 `INVALID_INPUT`。无效创建前后任务文件清单及原文件字节一致。无效更新前后完整文件和读回 DTO 一致，包含版本、哈希和 revision。随后合法中文、emoji 和内部 CRLF 均以原 UTF-8 字节写入并在关闭重开后回读，合法更新恰好推进一次 revision。合成夹具零次 `spawn`。 [HTTP 回归](D:/Document/code/huhu/temp/issue-worktrees/tasks/plugins/tasks/test/persistence-http.test.ts:165) |
| JSON Schema | 基线导出未带正文 `pattern`。候选复用 `TaskFields`，通过 Zod `regex` 将完整字符串约束提供给创建和补丁。导出正则在常规和 Unicode 两种模式下均接受空串、中文、合法 emoji、CRLF 和有效 U+FFFD，并拒绝附带尾部 CRLF 的无效代理项。 [Task 入参](D:/Document/code/huhu/temp/issue-worktrees/tasks/packages/contracts/src/dto/task.ts:65) · [导出回归](D:/Document/code/huhu/temp/issue-worktrees/tasks/plugins/tasks/test/persistence-http.test.ts:208) |

基线定向跑 3 项并发通过和 4 项正文边界测试按预期失败。独立候选的 `persistence-http.test.ts` 全部 16 项通过。组合头最终跑 13 个文件，168 项通过，11 项按现有 Windows 条件跳过，包含 Vault 文件操作 13 项。 [基线红测](C:/Users/cdewta/AppData/Local/Temp/huhu-t6n-evidence/task02-baseline.log) · [独立候选绿测](C:/Users/cdewta/AppData/Local/Temp/huhu-t6n-evidence/task02-green.log) · [组合回归](C:/Users/cdewta/AppData/Local/Temp/huhu-t6n-evidence/task02-combined.log)

## 范围与验证环境

- 共享改动仅在 `packages/contracts/src/dto/task.ts` 的 Task 正文入参，创建和补丁沿用原 schema 出口。正则只匹配 BMP 非代理码元或合法高低代理对，兼容 ES2023。新增测试在原 Tasks HTTP 夹具，退出后清理合成 Vault。
- Windows x64，Node 24.21.0、Vitest 3.2.7。复用前轮 pnpm 已安装依赖和指向本工作树的工作区包链接。本工作树锁文件保持 `e7c2876017054b1a8944cf954b2cec97981bfdc0`。本轮观察到集成锁文件只增加一处已有 `tsx 4.23.15` 的 importer 关联，解析版本保持一致。未使用真实 Vault 或 provider，未新增 worktree、代理或命令 pane。 [依赖核对](C:/Users/cdewta/AppData/Local/Temp/huhu-t6n-evidence/task02-deps.log)
- Contracts、Tasks、Vault、Engine 类型检查、oxlint 和 `git diff --check` 通过。独立 Tasks/Contracts 改动通过 oxfmt。组合 oxfmt 的唯一报项是 Lead 原提交中的 `packages/vault/test/operations.test.ts`，组合保留了原文件字节。 [独立检查](C:/Users/cdewta/AppData/Local/Temp/huhu-t6n-evidence/task02-checks.log) · [组合类型与 lint](C:/Users/cdewta/AppData/Local/Temp/huhu-t6n-evidence/task02-combined-types.log) · [格式报项](C:/Users/cdewta/AppData/Local/Temp/huhu-t6n-evidence/task02-combined-checks.log)

## Lead 验收

由 Lead 追加。
