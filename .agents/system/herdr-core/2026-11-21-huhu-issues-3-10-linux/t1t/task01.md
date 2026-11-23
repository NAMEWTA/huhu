# task01.md 独立审查第 2 轮：集成 22e91432..fc048b6b 的未审改动

## 定位

- 共享根 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux`
- topic — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/topic.md`
- manifest — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/manifest.tsv`
- terminal_address — `t1t`
- 当前任务 — `task01.md`
- 任务文件 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t1t/task01.md`
- 报告文件 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t1t/report01.md`
- Lead 回告方式 — Lead 在 Core 外部，主动读报告。发布终稿后在终端最后一行打印报告绝对路径并停下。
- 工作目录 — `/home/wta/projects/huhu/temp/issue-snapshots/fc048b6b`（`git archive fc048b6b` 快照，Lead 已解包；不要修改其中文件）。Git 对象只读：`git -C /home/wta/projects/huhu show/diff/log`。
- 接续依据 — 第 1 轮 `t11/report01.md` 已覆盖 0f242e2f、H11.2、Mail AI、2b280794 合并；本轮不重复。

## 目标与输入

按 dev-review 两轴（规格符合度、项目规范）独立审查以下提交，报告真实缺陷、规则违反与待验证风险，给出文件:行号、影响与可复现依据。不修改业务文件。

1. `6f30ffa8`（t6/task03 报告 `t6/report03.md`）：40 项可移植凭据用例从 Windows 放开到 Linux。重点：是否只是去掉平台判断而失去了原用例要证的行为；测试保护注入是否仍不可经 HTTP/CLI/MCP/env/renderer 触达；保留 Windows 限定的理由是否真实。
2. `2a170094`（t10/report02.md，合并 `7344d3e5`）：#4 受控 Codex 派遣在 Linux。规格 `.agents/dev/changes/2026-11-19-issue-4-*`。重点：原生回执与 ACK 去重、POSIX 路径/进程语义、未知结果不重放、不写真实原生 Agent 历史。
3. `f70f1a44`（合并 `4a9a7305`）：CLI 自启动 Engine 复用桌面模块凭据、无头 SSH 作业保活。重点：凭据复用的主体/Vault 绑定、保活不会让撤权/停用后的作业继续、Engine 退出回收。
4. `decfca90`（POSIX 下清洗 Git 私有环境变量）、`cccaf2ea`（可移植 AI 设置拒绝 API Key）、`5021f54c`（Vault 独占创建发布后暂存清理失败不报假失败；`packages/vault/src/write.ts`）。
5. `f7901b0a`（Mail AI 选择用例放开，及 `.agents/dev/changes/2026-11-19-huhu-issues-3-10/decisions-2026-11-21.md` 末节）、`fc048b6b`（health.run 与外部布局读取不启动 Herdr Core；工作台调用者仍可为恢复布局拉起 Core）。

## 读写范围与产物

- 可读范围 — 整个仓库与 Git 对象；快照目录。
- 可写业务范围 — 无。只写报告和同目录临时稿。
- 禁止改动 — 一切业务文件、快照内文件；不 push；不启动子 agent。
- 本机内存有限且两名实现者正在跑测试：只运行与具体疑点相关的单个 vitest 文件，加 `--maxWorkers=1`；不跑全量测试、不跑 e2e、不 build。需要依赖时在快照内 `pnpm install --frozen-lockfile --prefer-offline`（仅此一项允许写快照的 node_modules）。跑测试前设 `XDG_RUNTIME_DIR="$(mktemp -d /tmp/hc-xdg.XXXXXX)"`。

## 验收

- 报告逐提交给出：结论（通过/有缺陷）、缺陷（严重度、文件:行号、失败情景）、待验证风险、实际运行的命令与结果。
- 报告格式按 `/home/wta/projects/huhu/.agents/skills/system-herdr-core/assets/report.md`：先写同目录 `.tmp`，再 `ln` 发布并删除临时稿；发布后打印报告绝对路径并停下。
