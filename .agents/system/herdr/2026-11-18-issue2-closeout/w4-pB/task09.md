# task09 · 文件树首次挂载命中空清单（产品）＋ a11y 键盘用例同步（测试）

角色：具体实现（gpt-6.2-sol medium）。工作目录 `/home/wta/projects/huhu-wt-layout`，分支 `closeout/issue2-layout`。开始前 `git merge --ff-only closeout/issue2-integration`（应快进到 cf882bd）。

依据：疑难分析 `w4:pD/report04.md`（必读，含受控时序探针 `/tmp/huhu-pD04-jXN8VA/`：`probe.cjs`、`prepare.py`、`split.py`）。

## 1 · 产品：文件路由注册与菜单回调拆成两段 effect
`packages/editor/src/host/explorer.tsx:77` 附近：文件列举路由只依赖 `deps`（稳定生命周期），隐藏操作 / 菜单钩子独立 effect 跟随回调变化；参考 `git show b12e156 -- packages/editor/src/host/explorer.tsx`，保留该文件其余改动（`94e79ea` 之后的内容）。另请评估：路由暂未注册时 `host-fetch.ts` 兜底对 `GET /api/documents` 返回成功空清单是否应改为可重试 / 非成功响应；如改动更小更稳妥可一并处理，否则在报告说明理由。
回归：把 pD 的「树首次挂载与创建完成同批」时序固化为确定性用例（单测或 e2e 均可，需在修复前红、修复后绿），断言新笔记在真实根目录列举与树行中都可见。

## 2 · 测试：`tests/e2e/a11y.spec.ts:64` 同步
树断言后等待 `new-note-dialog` 关闭、「键盘笔记」文档标签可见，再聚焦功能图标栏「任务」按 Enter，断言任务模块可见后继续原流程。保持纯键盘路径，不加固定等待。

## 验证
- 受影响单测、`pnpm typecheck`、`pnpm lint`、`pnpm knip`、`pnpm format:check`。
- `xvfb-run -a pnpm exec playwright test tests/e2e/a11y.spec.ts --retries=0`；`a11y.spec.ts:64 --repeat-each=30 --workers=6 --retries=0`；文件树相关 e2e（`tests/e2e/knowledge/explorer-keyboard.spec.ts`、`journey.spec.ts`、`workflows/acceptance.spec.ts`）零重试。
- 负载纪律：w4:pG 正在做启动测量。每次 e2e 前确认没有其他 Electron/Playwright 进程，记录起止 `uptime`。
- 写入范围：`packages/editor/src/host/explorer.tsx`、（如采纳）`packages/editor/src/host/host-fetch.ts`、新增/修改的回归测试、`tests/e2e/a11y.spec.ts`。其他文件先在报告说明。前端改动按 AGENTS.md 走 zh-modern-web-guidance。
回报 `report09.md`，manifest 中 w4:pB 改为 done。
