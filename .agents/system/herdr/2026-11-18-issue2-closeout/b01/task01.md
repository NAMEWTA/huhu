# B01 · 复刻矩阵 94 行补行为断言

角色：具体实现（gpt-6.2-sol medium）。工作树 `/home/wta/projects/huhu-wt-b01`，分支 `closeout4/b01`（= closeout4/final a86dbbf，依赖已装）。通用要求 `/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/wp-common.md`。测试纪律：全部改完再统一跑一次定向 e2e（单 worker、`--retries=0`），只重跑失败项；不跑全量、不测性能；启动 Electron 前确认无其他 Electron/Playwright（另一个会话 w5:p8 也会跑 e2e，有就等）。

依据：`.agents/dev/archive/changes/implemented/feature_2026-11-14-knowledge-ok-parity/evidence/parity-matrix.md` 第 18 节：前一会话撤回了 94 行旧「已验证」标记（各行写明证据缺口）。规格 B01：复刻矩阵逐项对应 OK 能力且有验证。前一会话报告 `/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w5:p7/report01.md`。

要求：
- 对 94 行逐行补「该能力的具体行为断言」：优先复用固定 OK 的上游测试（已接入 test:vendor 的文件中找对应 it，或原样接入新的上游测试文件并登记 PATCHES）；用户可见交互类用 Huhu Electron e2e（真实键盘/鼠标/剪贴板，断言节点结构、选区、磁盘字节）。同类能力可在一个 spec 中参数化，避免为每行启动一次 Electron。
- 每行写回链接（文件:行）并恢复标记；确认 Huhu 中该能力确实缺失或行为不同的，按缺陷修复（先判红）；属 Q2/Q10 等已登记不在范围的，写明登记出处，不另立排除。
- 更新第 18 节计数。门禁同通用要求（vendor 改动刷新重放）。
回报 `/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/b01/report01.md`，manifest 中 `b01` 行改为 `task01.md done`。
