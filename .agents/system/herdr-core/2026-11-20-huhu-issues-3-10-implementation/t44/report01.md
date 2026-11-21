# 任务报告 · #5 T1.1 持久任务

- 共享根 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation
- terminal_address — t44
- task — task01.md
- 任务文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t44/task01.md
- 报告文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t44/report01.md
- 执行结果 — done
- 执行身份 — Windows 11 Pro，Core wta / 346bd5608735e3fcb27f9d01f5c8008e / 0.1.21，HC_TERMINAL_ID=t44，Codex CLI 0.171.0。

## 结论

已交付任务持久化与条件更新。真实 HTTP 在基线复现旧请求覆盖外部标题。候选对同一情形返回 `VERSION_CONFLICT`，完整编辑请求在可写字段快照相同的情况下合并新评论与区段外 Markdown。默认 Human、未配齐的 Agent 和显式已有会话均可从 Markdown 读回。隔离验证记录到零次 Agent 启动。

## 产物与改动

- 工作目录 — D:/Document/code/huhu/temp/issue-worktrees/tasks
- 分支 — `impl/huhu-issues-3-10-tasks`
- 基线 — `1b3b385797eee2dbd9d9af42c57be44dd8ad2562`
- 本地候选 — `a5d82cb704cdd44fbae387518f7d1c4246908fb1`，树 `16a9076558afb91921f36ac914211bf6d5c0b87c`，工作树干净。
- 编辑器从打开时的 DTO 发送 `baseEditHash`。哈希涵盖标题、类型、正文、标签、截止日、项目、执行配置和提醒。旧 `baseInputHash` 在旧版本补丁只写正文或执行配置时仍可提供该范围的条件依据。创建默认值集中在创建 schema，部分更新会保留省略的执行配置和提醒。 [服务](D:/Document/code/huhu/temp/issue-worktrees/tasks/plugins/tasks/src/engine/service.ts) · [HTTP 能力](D:/Document/code/huhu/temp/issue-worktrees/tasks/plugins/tasks/src/engine/index.ts) · [编辑器调用](D:/Document/code/huhu/temp/issue-worktrees/tasks/plugins/tasks/src/ui/TaskEditor.tsx)
- Agent 创建持久写入 `execution.target: { mode: "new" }`。显式 `{ mode: "existing", sessionId }` 持久使用 Huhu sessionId，`spaceId` 与模型等设置继续使用原执行配置字段。已有 schema 2 文件可以缺省该字段。显式 new 与缺省 new 的已配执行输入哈希相同。 [Task 定义](D:/Document/code/huhu/temp/issue-worktrees/tasks/packages/contracts/src/kinds/task.ts) · [DTO 与更新合同](D:/Document/code/huhu/temp/issue-worktrees/tasks/packages/contracts/src/dto/task.ts)

## 验证

| 验收要求 | 实际检查与结果 | 证据 |
| --- | --- | --- |
| 外部修改后条件写 | 基线真实 `POST /api/v1/call` 返回 `ok: true`，二次读取标题为“编辑器标题”。候选中旧哈希和过期编辑哈希两种请求均返回 `VERSION_CONFLICT`，外部标题和文件字节保持原值。 | [基线失败日志](D:/Document/code/huhu/temp/t44-red-f10fbcd4bfc14bc6a1af1c514db9cdc3/vitest-red.log) · [HTTP 回归](D:/Document/code/huhu/temp/issue-worktrees/tasks/plugins/tasks/test/persistence-http.test.ts) |
| 评论与区段外合并 | 编辑期间追加评论和外部 Markdown 后，文件版本变化且编辑哈希相同。用完整表单补丁更新成功，比较了带 CRLF 及尾随空白的前缀、原评论段和文件后缀。 | [HTTP 回归](D:/Document/code/huhu/temp/issue-worktrees/tasks/plugins/tasks/test/persistence-http.test.ts) |
| 类型、会话意图、引用和权限 | 默认 Human。Agent 缺 Space 或全缺配可创建，重启 Engine 后保留正文、模型、执行参数、默认 new、文件及文件夹路径引用。显式 existing 的 sessionId 写入 Markdown 并在重启后读回。混用目标字段和遗漏 sessionId 被拒绝。部分编辑保留配置与提醒。开放能力后，外部创建 Agent、代填执行配置、评论 Agent 均被拒绝，Human 讨论标记 external。 | [HTTP 回归](D:/Document/code/huhu/temp/issue-worktrees/tasks/plugins/tasks/test/persistence-http.test.ts) |
| 零启动 | HTTP 夹具用实际 Engine 与隔离 Vault。CLI 探测使用空夹具，`spawn` 拦截器记录 0 次调用，`tasks.runs` 返回空数组，`Task Runs` 目录未产生。 | [HTTP 回归](D:/Document/code/huhu/temp/issue-worktrees/tasks/plugins/tasks/test/persistence-http.test.ts) |
| 桌面实际入口 | 本次构建在 Electron 44.9.1 / Chromium 152.0.7977.167 运行。用 TaskEditor 创建 Human，打开编辑后通过 HTTP 追加评论，捕获保存请求内的打开时 `expectedVersion` / `baseEditHash`，验证改名及评论。已完成行的 `text-decoration-line` 为 `line-through`，看板实测三个状态列。 | [烟测脚本](D:/Document/code/huhu/temp/t44-electron-a2153dfa6a2b45fc9089d6ea8b2095b6/tasks-electron.cjs) · [运行日志](D:/Document/code/huhu/temp/t44-electron-a2153dfa6a2b45fc9089d6ea8b2095b6/electron-smoke.log) |
| 回归与构建 | Node 24.21.0，pnpm 12.10.1，Vitest 3.2.7，TypeScript 5.9.3。最终回归 11 个文件，133 通过，11 项按 Windows 的既有条件跳过。Contracts、Tasks、Automations、Engine 类型检查通过。七个提交文件通过 oxfmt、oxlint 和 Git diff 检查。Electron 构建通过。 | [回归日志](D:/Document/code/huhu/temp/t44-verify-6c1aa9c6c7ec465c87c732a5069c89b5/vitest.log) · [Electron 构建日志](D:/Document/code/huhu/temp/t44-build-bed0d7fef6574c9eb3c425f7c7a8daab/electron-build.log) |

已运行的验证命令如下。每次应用、安装、构建和测试使用独立的 TEMP/TMP。Electron 另外隔离 Vault、userData 和用户配置目录。

```powershell
node node_modules/vitest/vitest.mjs run --project '@huhu/plugin-tasks' --testTimeout 30000 plugins/tasks/test/persistence-http.test.ts
node node_modules/vitest/vitest.mjs run --maxWorkers 2 --testTimeout 60000 --hookTimeout 60000 plugins/tasks/test packages/contracts/test plugins/automations/test
node node_modules/typescript/bin/tsc -p packages/contracts/tsconfig.json
node node_modules/typescript/bin/tsc -p plugins/tasks/tsconfig.json
node node_modules/typescript/bin/tsc -p plugins/automations/tsconfig.json
node node_modules/typescript/bin/tsc -p apps/engine/tsconfig.json
# 以下在 apps/desktop 下执行
node_modules/.bin/electron-vite.cmd build
```

## 阻碍与接续

- #4 W6.1 设计的 `agent.targets.list`、`agent.runs.dispatch` 和 `agent.runs.inspect` 需由实际接口核对。Tasks 基线和复核时的 receipt 候选 `ce5289ddd1ae5713167f6987fe6db53c3beef51f` 均未注册这些入口。W6.1 的 existing 合同需要 Space、Huhu sessionId 和实际绑定。当前候选让带有 existing 意图的任务在旧扫描流程中显示阻塞，等 T2/T3/T7 接入并验证真实绑定。 [W6.1 设计](D:/Document/code/huhu/temp/issue-worktrees/tasks/.agents/dev/changes/2026-11-19-issue-4-agent-cli/design.md:39) · [旧扫描预检](D:/Document/code/huhu/temp/issue-worktrees/tasks/plugins/automations/src/engine/scan.ts:76)
- 缺配保存已验收 HTTP。现有表单的 Space／CLI 校验和会话选择控件属于待确认的原型交互。此次桌面更新限于保存请求字段。 [原型确认记录](D:/Document/code/huhu/temp/issue-worktrees/tasks/.agents/dev/changes/2026-11-19-issue-5-task-automation/prototype-review.md)
- 首次宽跑有默认超时，且首条评论入夹具时触发现有 `appendComment` 的文件尾空白修整。复验放宽宿主测试超时，并以评论写入后、任务编辑前的字节为保留基线。首次建立 `<comments>` 时整理文件尾空白仍是 Vault helper 的既有行为。 [Vault 区段实现](D:/Document/code/huhu/temp/issue-worktrees/tasks/packages/vault/src/markdown/regions.ts:202)
- 本切片无交付阻碍。相应改动均在本地候选，交由 Lead 核验。

### Modern Web Guidance

我用 `search "prevent stale form updates"` 与 `retrieve forms` 核对了保存流。依据 “Never treat browser constraints as a data integrity defense”，我在既有 POST 里传递编辑快照，由服务端在条件写前核验。 [forms 指南取证](D:/Document/code/huhu/temp/t44-web-e8b01f129cb84401baad590a07b296b0/mwg-guide-15132-1795149693893.md)

## Lead 验收

由 Lead 核验后追加。
