# 恢复派遣定向类型修复

- 共享根 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-23-huhu-closeout-release`
- Lead / terminal — `t3p` / `t1dd`
- 任务 / 报告 — `t1dd/task02.md` / `t1dd/report02.md`
- 结果 — 定向修复完成。工作目录 `/home/wta/projects/huhu`，共享 main。

`plugins/tasks/src/ui/TaskEditor.tsx:201` 的 `err()` 从索引字典读取时用 `?? null` 归一化缺失文案，返回 `string | null`。会话目标选择器继续用 `null` 触发自身的查询结果判断。已失效的历史选择持续显示原选项、禁用状态及重选提示，目录加载中或查询失败时分别显示对应状态。

## 验证

- `node /tmp/huhu-t1dd-task02-probe.cjs` 使用实际源码中的 `err()` 和选择器 props，启用 TypeScript `strict` 与 `noUncheckedIndexedAccess`。旧表达式复现 TS2322，修复后零诊断。同一脚本用 React 的静态渲染核对五种状态，涵盖当前选项、修订已变、查询加载中、查询失败、提交校验文案。全部通过。
- `git diff --check` 通过。
- Lead 的 `t1f5` Engine live 1/1 通过，记录位于 `temp/closeout-release/resume-engine-live.log`。现有桌面用例以两条手写 rollout 为来源，仍需通过真实 Codex 产生持久 source turn 和真实 UI 路径证明普通用户来源闭环。

## 未运行的验证

本轮未运行桌面整套类型检查、Electron/Playwright、构建、打包或全量测试。Lead 重跑原类型命令和原生产品路径。

### Modern Web Guidance

我用 task01 已取得的 `forms` 和 `select-menu-interaction` 指南复核失效选项和错误描述的关联。本轮只修复错误值类型。

Lead t1f6 desktop与指定E2E types及桌面构建全部通过。
