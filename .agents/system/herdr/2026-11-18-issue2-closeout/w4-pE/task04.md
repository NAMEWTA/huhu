# task04 · 复核 report03 应修项的修复（最终候选）

角色：独立审查（gpt-6.2-sol xhigh），只读业务文件。工作目录 `/home/wta/projects/huhu-wt-review`，`git checkout --detach cf882bd`（`closeout/issue2-integration`）。

范围：`git diff ca28e78..cf882bd` 及 `git log --graph 471dfdf..cf882bd`。
- `e6c1e25`（pB，报告 `w4:pB/report08.md`）：应修 1 树菜单模板目录继承、应修 2 `templatePath` 仅限桌面调用方。
- `cea7b3c`（pC，报告 `w4:pC/report09.md`）：4f5d524 连带的 `service.test.ts:279` 夹具。Lead 决定保留 `notes.move` 目标目录必须已存在的严格行为（外部调用方需先 `folders.create`），请评价该决定对外部能力契约的影响。

验收条件：两项应修是否真正关闭（对照固定 OK `templates-resolver.ts`）、有无新回归或越权、是否还有阻断关闭 Issue #2 的问题。不要跑 e2e 或全量单测（Lead 正在跑门禁和 G07 测量，需要低负载）；可跑单个单测文件。
回报 `report04.md`，manifest 中 w4:pE 改为 done。
