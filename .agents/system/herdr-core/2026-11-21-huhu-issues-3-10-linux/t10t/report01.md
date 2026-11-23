# t109 自动化旧端到端夹具迁移

任务 `t10t/task01.md`，Lead `t3p`，工作树 `agent-linux`，基线 `4ae7e7e4`。实现已写入工作树，等待 Lead 串行验证。

## 已确证的根因

- t109 第 262 项的 `error-context.md` 和 `trace.zip` 内的 `test.trace` 记录了打开规则、点击「立即运行」和打开运行页。运行列表在 30 秒内持续显示「整理周报 无法派遣」。trace 的失败点是 `hlgd@361`。证据位于 integration 的 `test-results/shell-自动化运行*/`。
- 旧用例的临时 Claude 可执行文件响应版本探测，只有旧的 `-p` 调用会输出带固定会话 ID 的结果。T7.1 已将 Agent 规则的立即运行切换到 Tasks，当前生产装配的原生接收适配器只有已配置的 Codex。Claude 在目录中可选，但 `plugins/agent-cli/src/engine/dispatch.ts` 为缺少接收适配器的目标返回 `provider_acceptance_unavailable`。Tasks 将不受支持的目标映射为 `blocked / target_unsupported`，运行页显示「无法派遣」。旧脚本无法让真实派遣链启动并产出回执。
- 本轮隔离目录 `/tmp/huhu-full-e2e.BGJhCi` 内未保留可对应此用例的派遣实体。旧用例在关闭 Electron 后清理临时 Vault，trace 也只记录了列表和等待失败。因此 `target_unsupported` 是由原夹具及当前源码路径确证的映射，未作为本轮 Vault 中直接提取的字段引用。未输出凭据或原始环境。
- 当前 Agent 详情由 `plugins/automations/src/ui/RunsPanel.tsx` 的 Tasks 分支渲染，显示已完成、投递后的结果和「定位原会话」。旧 `run-session` 与 `run-body` 断言属于已替换的详情结构。

## 已修改

- `tests/e2e/shell.spec.ts` 中的目标用例改名为「自动化运行：Agent 规则经 Tasks 派遣，运行页显示已完成和结果并可定位原会话」。修改范围为这一用例及其导入和 Core 清理 helper，保留文件内既有编辑。
- 沿用 T7.2/W8.3 的固定 Codex 和 `startCodexResponsesFixture`，首个本地 Responses 请求返回「周报已整理」。通过真实工作台创建规则并立即运行，等待真实 Core、Codex App Server 和 Tasks 完成，核对运行列表和详情。通过只读公开能力取得由结果回执投递的评论及其 session，核对同一运行的派遣绑定，并从运行页在 Agent CLI 定位该 session，对照工作区实际分栏的 ID。
- 每次建立独立 Vault、Electron userData、Core runtime、外层 HOME 和受控 provider HOME。保留原始失败，另附清理阶段名。清理关闭 Electron、专用 Core 和回环服务，再移除测试目录。
- 用例使用现有 `HUHU_CODEX_DISPATCH_BIN`。t109 的 `run-final-e2e.sh` 已传入 `temp/issue-evidence/huhu-2026-11-22/fixtures/codex-0.170.0/codex` 的绝对路径。Linux 生产装配按既有指纹校验实际可执行文件。缺少该配置时用例会报错。此改动未增加 fixture 文件或改动生产代码。

## 未运行的验证

- E2E 待 Lead 串行运行 `tests/e2e/shell.spec.ts` 中上述单一用例，沿用隔离显示与 Secret Service 环境、随应用的 Core 和固定 Codex。本工作会话未运行任何验证。
- 未运行 Vitest、E2E、类型检查、构建、打包或安装，未暂存或提交。
