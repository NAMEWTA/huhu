# 派发回执

- 共享根 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory
- terminal_address — t1hs
- task — task01.md
- 任务文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/t1hs/task01.md
- 回执文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/t1hs/report01.md
- 业务验收报告 — `/home/wta/projects/huhu/.agents/dev/changes/2026-11-24-issue-inventory/evidences/{002-c12base,003-f05,010-f20}.md`
- 执行结果 — done（worker 交回）

## 成果与运行指针

工作目录 `/home/wta/projects/huhu/.agents/dev/worktree/inv-w1`，分支 `inv/w1`，基线 `59a6020ec`，交付 HEAD `51250684`。三个提交各自带 `Refs: #13`。工作树干净，已回收本次定向测试终端。运行观察见本回执，无额外附件。

### C12base — `b9dc77d9`

- 改动文件 `apps/engine/test/write-boundaries.test.ts`。可运行的合同样例通过真实 Engine 桌面令牌、独立 Web 监听器的邀请 Cookie 和 HTTP 服务令牌进入 Dispatcher。Notes 附件分别用原持久意图查调用回执和用 Vault 日志核对唯一提交的步骤与文件身份。计划以原任务及返回修订复读，受控 Task 以原 taskId/dispatchId 读取稳定 eventId/runId。真实 HTTP 接口重启后区分未受理、已完成和仅有受理记录的未知状态，验证另一主体不可查询并且同意图不重复创建任务。
- 定向验证 `flock /home/wta/projects/huhu/temp/dev/verify.lock volta run --node 24.22.1 pnpm exec vitest run apps/engine/test/write-boundaries.test.ts`，2 项通过。
- 样例使用合成静态 Web 入口，并调用真实会话与 HTTP API。受控 Task 使用不可用的 Space，验证本地受理与核实。若需要浏览器呈现补充，已有 `tests/e2e/workflows/external-task-web.spec.ts` 的「D09 同包 CLI 创建与 MCP 修改的同一任务刷新到桌面和 Web」走候选包。
- Lead 类型检查包 `@huhu/engine`。

### F05 — `61dd4580`

- 改动文件 `packages/editor/src/plain/plain-text-format.ts`、`packages/editor/src/plain/PlainTextEditor.tsx`、`packages/editor/test/plain-text.test.tsx`、`tests/e2e/workflows/json-format.spec.ts`。
- 复用已有 CodeMirror/Lezer JSON 语法树的源 token 范围，适配层只重排结构空白。保留重复键、成员顺序、数字拼写、字符串空白与转义、BOM 和原换行风格。非法 JSON、混合换行或输出超过 8 Mi 个 UTF-16 代码单元时返回原因。将格式化隔离为一笔撤销，格式化结果等于现文时跳过编辑事务。
- 定向验证 `flock /home/wta/projects/huhu/temp/dev/verify.lock volta run --node 24.22.1 pnpm exec vitest run packages/editor/test/plain-text.test.tsx`，17 项通过。
- Lead 执行 `tests/e2e/workflows/json-format.spec.ts` 的「F05 Linux 桌面：JSON 格式化自动保存、重开和单次撤销保持原字面值」和「F05 独立 Web：JSON 格式化自动保存、重开和单次撤销保持原字面值」。用例逐字节比对磁盘文件，并核对重开显示及非法 JSON 的诊断。
- Lead 类型检查包 `@huhu/editor`。

### F20 — `51250684`

- 改动文件 `packages/herdr-client/src/client.ts`、`packages/herdr-client/test/frames.test.ts`。
- 按字节定位 LF 再解码完整行。仅缓存未结束行，缓冲容量按需增长至 16 MiB。超限或无效 UTF-8 会断开 socket 并拒绝挂起调用，断线清理未结束行。成功 hello 回执触发同步切换，同块尾部的原字节直接交给原帧解码器。
- 定向验证 `flock /home/wta/projects/huhu/temp/dev/verify.lock volta run --node 24.22.1 pnpm exec vitest run packages/herdr-client/test/frames.test.ts`，13 项通过，包含每个字节切点、逐字节拆分、多行订阅、未结束行、超限及 hello 同块二进制帧。
- 定向验证 `flock /home/wta/projects/huhu/temp/dev/verify.lock volta run --node 24.22.1 pnpm exec vitest run packages/herdr-client/test/herdr-core.test.ts`，3 项通过，包含 hello 取消和连接释放。
- Lead 实机联验可沿用 `tests/e2e/shell.spec.ts` 的「Agent CLI：shell 里 exit 之后，会话标记为已结束（带退出码），不再提供终端；其他会话不受影响」及 `tests/e2e/workflows/web-terminal-widgets.spec.ts` 的「G7.2 同包 Web Agent 观察、接管并刷新原 shell 会话」。
- Lead 类型检查包 `@huhu/herdr-client`。

### 未运行

- Playwright E2E、构建、打包、类型检查、全量测试、全仓 lint、knip 和截图取证，依派发约定交由 Lead。
- C12base 未启动真实 provider，F20 未运行 live Core。Windows 和 macOS 不在本批验收范围。

## 阻碍与接续

无实施阻碍。待 Lead 按上述路径完成验收及回写。

## Lead 验收

- Lead 2026-11-24：已审查，三包类型检查通过，已合入 main 6a321df6；E2E json-format 待整合构建后运行。清单转 task02。
