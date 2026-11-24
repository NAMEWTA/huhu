# task01 · G07：补首页数据完成与非知识库模块直接冷启动的测量端点

角色：具体实现（gpt-6.2-sol medium）。工作目录 `/home/wta/projects/huhu-wt-parity`，分支 `closeout2/g07`（= main f16f614，依赖已装）。完成后提交，不推送。**只改测量脚本，不改产品代码。**

依据：规格 G07（`spec.md:79`）「首屏与非知识库模块的冷启动指标对 rc.4 基线无回退」。现脚本 `scripts/measure-notes-startup.mjs` 只测工作台外壳+引擎就绪（同帧 rAF `homeMs`，旧 locator `homeLocatorMs`）、从工作台切到收件箱外壳。独立审查指出未测：首页卡片数据填充完成（`packages/workbench/src/home/HomeModule.tsx` 的 `home.summary` 就绪前会渲染空容器）、各非知识库模块直接冷启动入口。见 `.agents/system/herdr/2026-11-18-issue2-closeout/w4-pE/report05.md`「G07」、`w4-pG-report01.md`（locator 退避机制）。rc.4 基线工作树 `/home/wta/projects/huhu-wt-rc4`（9132640，已构建，旧版 UI 结构可能不同，需兼容）。

要求：
1. 新增端点（两侧 rc.4 与候选都可测，语义相同）：
   - `homeDataMs`：冷启动到首页卡片数据填充完成（选择两侧都存在、能代表数据到达的 DOM 条件，例如至少一张卡片出现非占位内容；给出选择理由与两侧 DOM 对照）。
   - 非知识库模块直接冷启动：以设置中「启动时打开的模块」或等价的持久化状态（两侧都支持的方式；若 rc.4 不支持，用启动后立即通过与用户相同的入口导航并单独标注）分别冷启动到「任务」「收件箱」主区可见并有数据，各一个端点。
   - 同帧 rAF 计时；同时保留 locator 版以对照。
2. 增加 `--pairs N` 支持 ≥40 对；输出每端点 p50/p95、配对差中位、较慢对数，以及配对差的 bootstrap 95% 区间（固定随机种子）；`--aa` 模式同样输出。
3. 冒烟：`xvfb-run -a node scripts/measure-notes-startup.mjs /home/wta/projects/huhu-wt-rc4 2` 与 `--aa 2` 能跑通（只验证格式）。`pnpm lint`、`format:check`。正式测量由 Lead 执行。
4. 负载纪律：w4:pK、w4:pM 同时工作；冒烟前确认无其他 Electron/Playwright。
回报 `report01.md`（端点定义、两侧 DOM 对照、冒烟输出），manifest 中 w4:pN 改为 done。
