# task01.md 独立审查：集成 22e91432 上的四组改动

## 定位

- 共享根 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux`
- topic — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/topic.md`
- manifest — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/manifest.tsv`
- terminal_address — `t11`
- 身份核对 — 本机 Linux 默认 Core，终端名 `review-1`，worker 内 `HC_TERMINAL_ID` 应为 `t11`。
- 当前任务 — `task01.md`
- 任务文件 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t11/task01.md`
- 报告文件 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t11/report01.md`
- Lead 回告方式 — Lead 在 Core 外部，主动读报告。发布终稿后在终端最后一行打印报告绝对路径并停下。
- 工作目录 — `/home/wta/projects/huhu/temp/issue-snapshots/22e91432`（`git archive 22e91432` 的快照，Lead 正在其中跑 install/build/test/e2e，日志写到 `/home/wta/projects/huhu/temp/issue-baseline/linux-22e91432-*.log`；不要修改快照中的文件）。Git 对象只读：`git -C /home/wta/projects/huhu show/diff/log`。
- 接续依据 — 无

## 目标与输入

按 dev-review 两轴（规格符合度、项目规范）独立审查以下改动，报告真实缺陷、规则违反与待验证风险，给出文件:行号和影响。不修改业务文件。

1. #9 P0.1 跨平台本机凭据保护：`git show 0f242e2f`。规格 `.agents/dev/changes/2026-11-19-issue-9-safe-accounts/{spec,design}.md` 与 `tasks/P0.1-local-protection.md`、实现者报告 `t6/report01.md`。重点：不允许明文/弱回退；Linux 固定 Secret Service 的含义；已有密文不被新钥匙覆盖；测试注入点 `BootOptions.moduleCredentialProtection` 不能经 HTTP/CLI/MCP/env/renderer 触达；打包解包是否覆盖目标平台的原生绑定。
2. #7 H11.2 SSH Exec 作业：`git diff be7a8b8e 0748a516`（c23a8258 WIP + 6269093e + 0748a516），以及 Lead 在合并提交 `22e91432` 中的 boot.ts 接线和测试调整（`git show 22e91432 --first-parent -m -- apps/engine plugins/ssh/test`，对比第一父 `6fa64d54`）。规格 `.agents/dev/changes/2026-11-19-issue-7-ssh-module/{spec,design}.md` §12、A13、A16，`tasks/H11.2*`，#6 G5c；原任务 `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t18v/task15.md`；实现者报告 `t5/report01.md`。重点：默认关闭与逐项授权；跨主体/错 Vault/过期路由拒绝；同意图不重复执行；本机接收超时为待核实；取消按原 job；关闭观察不取消；输出上限与 UTF-8 游标；只读操作不拨号、不夹带凭据；连接回收；stdio MCP 共享主体被拦截。
3. #8 S7.1/S7.2 Mail AI：`git diff 1bac3348 5c1c52a9`，以及 Lead 接线 `3fa0f3de`、`85770368`。规格 `.agents/dev/changes/2026-11-19-issue-8-mail-module/` 的 S7.x 任务；实现者报告 `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t1c2/report01.md`。重点：只发送用户确认的片段；未确认零请求；Key 存于 Mail 自有凭据、不进 Vault 包明文；单次确认绑定主体/Vault/修订；结果安全渲染；采纳回复只进可编辑草稿、绝不自动发信；静态目录与运行时注册一致。
4. Lead 的 origin/main 合并 `2b280794` 冲突处理：`git show 2b280794 --cc` 及 `git diff 4d86c84b 2b280794 -- packages/vault/src/write.ts`。重点：`writeChecked` 中 `beforeCommit` 同步发布与 main 的独占创建暂存（`createExclusive` / `createExclusiveSync`）合并是否正确（EEXIST→nameConflict、硬链接回退、暂存清理、`creationStage` 记账、receipts 记录/撤销）；`grow`→`hu-flex-fill` 类名改动是否有遗漏；`check-ok-class-collisions.mjs` 路径过滤；上游台账 R-71 改号。

## 读写范围与产物

- 可读范围 — 整个仓库与 Git 对象；快照目录。
- 可写业务范围 — 无。只写报告和同目录临时稿。
- 禁止改动 — 一切业务文件、快照内文件；不 push；不启动子 agent。可以在 `/tmp` 下另建临时目录运行你自己的复现脚本或测试（例如 `git -C /home/wta/projects/huhu archive <sha> | tar -x -C /tmp/...`，依赖用 `pnpm install --frozen-lockfile --prefer-offline`）。跑测试前设 `XDG_RUNTIME_DIR="$(mktemp -d /tmp/hc-xdg.XXXXXX)"`。
- 预期产物 — `t11/report01.md`：按严重度排序的发现表（文件:行、问题、触发场景、影响、建议），每项标 `确认`（有复现或代码确证）或 `待验证`；以及每组改动的结论（可合入 / 修复后合入 / 不可合入）。

## 验收与验证

发现要可复核：给出复现步骤或精确代码路径。不确定的标 `待验证`，不要夸大。

## worker 执行约定

1. 读 topic 和 manifest，核对共享根、地址 `t11` 与任务文件名。manifest 当前行须为 `t11	task01.md	active`。
2. 先查报告路径；已有身份匹配的终稿则仅打印路径。
3. 只写自己的报告和同目录临时稿。
4. 按 `/home/wta/projects/huhu/.agents/skills/system-herdr-core/assets/report.md` 格式：`report01.md.tmp` → `ln report01.md.tmp report01.md && rm report01.md.tmp`。
5. 发布后在终端打印报告绝对路径并停下。
