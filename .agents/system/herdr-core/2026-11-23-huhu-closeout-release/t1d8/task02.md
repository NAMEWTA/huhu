# Dashboard 网格运行对照夹具
身份：t1d8/task02.md，Lead t3p，共享根 /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-23-huhu-closeout-release，工作目录 /home/wta/projects/huhu。读取 topic/manifest、AGENTS 和 dev-build，禁止子代理。

任务：完成 #10 W01-01 实际比较所需的可运行同样本 PoC 和自动化测试脚本，交给 Lead 串行运行后决定生产接入。先完整读 .agents/dev/archive/changes/implemented/feature_2026-11-19-issue-10-widget-dashboard/tasks/W01-01-grid-comparison.md、design.md、spec.md，以及 t1d4/report01.md。现在不凭静态阅读宣布选型成功，也不先大改生产画布。

已获取 root/temp/sources：react-grid-layout ec4ab79c97448947b04601c2237b2861d94a0fcb v2.3.0、gridstack a7f828af1c5366c02aff8a8c8fafda2abbff58a6 v14.1.1、homarr b440fdd574c9daa229f5cf64f7b2532770799664 v2.13.1。核对许可与真实 API。比较现有 Huhu + RGL + GridStack + Homarr 真实布局逻辑/交互；若 Homarr 仅提取纯函数或适配组件，准确标明范围，不能冒充整个上游 App。不要为对照安装其整个服务栈。

同一有空位、输入框、不同尺寸卡样本。给 Lead 一条可运行命令启动 harness、另一条 Playwright 跑同手势并产出 JSON/trace/截图：移动、碰撞让位、min/max 调整、保存重开、窄屏、缩放、触摸/键盘等价操作、输入/选中文字不拖动、快速离开与卸载。依据现有规格断言，不仅比较“能渲染”。记录适配代码成本及实际采用上游代码。生产只接胜出一种，设计优先 RGL 达标即用，最终实施另发 task。

可写 temp/closeout-release/grid-comparison/（独立 harness 可 package.json/lock）、必要 tests/e2e 专用对照 spec 和 evidence 草稿。不改生产 Dashboard、根锁文件、版本、Mail、Task/Agent、新 Web 入口。不提交。前端先做 modern guidance search/retrieve。worker 不运行 build/Electron/Playwright/截图/重型检查，只写代码，单个相关 Vitest 可跑。依赖安装需要的命令交 Lead。报告 report02.md 原子发布，列准备命令与未执行验证；hc send t3p 回告。
