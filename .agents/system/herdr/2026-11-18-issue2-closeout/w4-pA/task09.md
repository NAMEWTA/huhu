# task09 · G07 启动测量脚本改用同帧计时端点

角色：具体实现（gpt-6.2-sol medium）。工作目录 `/home/wta/projects/huhu-wt-parity`，分支 `closeout/issue2-parity`。开始前 `git merge --ff-only closeout/issue2-integration`（应快进到 cf882bd）。

依据：疑难分析 `w4:pG/report01.md`（必读）及其探针 `/tmp/pg07/dual.mjs`、`/tmp/pg07/observe.mjs`。

## 要求
修改 `scripts/measure-notes-startup.mjs`（仅此文件；如需共用辅助，先在报告说明）：
1. firstWindow 后立即在页面内用 `page.waitForFunction(..., { polling: "raf" })` 同帧检查工作台节点非零布局、CSS 可见与「引擎就绪」文本，返回浏览器命中时刻（`performance.timeOrigin + performance.now()`），与 Electron launch 起点同钟换算得到 `homeMs`。
2. 保留旧计时（locator 可见 + 文本等待）作为 `homeLocatorMs` 并列输出到每条样本与汇总；汇总对两者都给 p50/p95，并新增配对差中位数与「候选较慢对数」输出（homeMs、homeLocatorMs、inboxMs、noteMs）。
3. 仍用原两个条件断言（工作台可见、引擎就绪）；收件箱、首篇笔记、2,001 篇 Vault、独立 profile、交替先后保持不变。旧版 rc.4 构建（legacy: true）同样适用。
4. 增加可选 `--aa` 模式：两侧都用候选构建（交替标签），用于给出同构建波动。
5. 验证：`node --check`；`xvfb-run -a node scripts/measure-notes-startup.mjs /home/wta/projects/huhu-wt-rc4 2` 冒烟一次、`--aa 2` 冒烟一次（只验证能跑通与输出格式，不做正式结论）；运行前后记 `uptime`，确认无其他 Electron/Playwright 进程。`pnpm lint`、`pnpm format:check`。
6. 不跑 e2e；正式 20 对测量由 Lead 执行。
回报 `report09.md`，manifest 中 w4:pA 改为 done。
