# C01 真实来源 E2E 更新

- 共享根 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-23-huhu-closeout-release`
- Lead / terminal — `t3p` / `t1dd`
- 任务 / 报告 — `t1dd/task03.md` / `t1dd/report03.md`
- 执行结果 — 测试代码已完成，待 Lead 运行。工作目录 `/home/wta/projects/huhu`，共享 main。

## 改动

- `tests/e2e/workflows/task-journey.spec.ts` 的 C01 用例验证固定 Linux Codex 0.170.0 的 SHA-256。两次真实 Codex App Server 依次在桌面的受控私有 home 和原工作目录完成 A、B 各一个持久 turn。每次先用原生协议核对 UUID、cwd、已完成的 turn 和 rollout 路径，再等源进程退出。测试读取 Codex 自己写入的原始文件。
- 桌面从 Tasks 编辑器直接选择 B。保存后校验还没有 Huhu 会话或额外模型请求。派遣只生成一个绑定到 B 的 Huhu 会话，原生问题的 sessionId 和 runId 与该任务一致，UI 回答与结果只各出现一次。
- 模型请求分别记账。种子 A/B 共两次，每次匹配各自 prompt。任务原生问答共两次，首轮含任务正文和 B 的旧内容，续轮含同一问题的唯一回答。A 的历史字节保持一致，B 保有原文件设备号、inode 和出生时间，原内容保留并追加任务正文。派遣后的 `thread/read` 只读核对同一 UUID、原 cwd、原 rollout、一个原 turn 和一个新完成 turn。
- 新增测试专用的 `tests/e2e/helpers/codex-persistent-source.ts`，复用已实测的 stdio 协议及回环 Responses 服务。现有 Responses helper 增加多条种子响应，保留此前 `seedReply` 调用的行为。

## 范围与验证

本用例采用真实 App Server 生成来源。现有项目没有经复验的固定 Codex TUI 首页及信任提示驱动，本轮选用已有成功协议的低成本路径。用例验证真实 provider 生成并关闭的持久来源，以及从桌面任务编辑器开始的完整恢复路径。普通用户经 Huhu 交互 Codex 打开、完成一轮并退出的来源路径仍待 Lead 单独验证。

- `git diff --check` 通过。
- 三个改动文件的 TypeScript 语法转译检查通过。
- 两个测试 helper 的定向语义检查通过。

```bash
pnpm exec tsc --noEmit --skipLibCheck --strict --noUncheckedIndexedAccess --exactOptionalPropertyTypes --target es2024 --module NodeNext --types node tests/e2e/helpers/codex-persistent-source.ts plugins/agent-cli/test/fixtures/codex-responses.ts
```

本轮未运行 Electron/Playwright、桌面构建、打包或全仓类型检查。原有成功日志 `temp/closeout-release/codex-resume-protocol.log` 证明使用的原生协议。下方用例尚待使用已有桌面构建运行。

```bash
HUHU_CODEX_DISPATCH_BIN="$PWD/temp/issue-evidence/huhu-2026-11-22/fixtures/codex-0.170.0/codex" pnpm exec playwright test tests/e2e/workflows/task-journey.spec.ts -g 'C01 任务编辑器直接恢复所选的 Codex 持久历史并完成原生问答'
```

Lead 已收取测试实现，t1fd 开始真实UI验收，未记通过。
