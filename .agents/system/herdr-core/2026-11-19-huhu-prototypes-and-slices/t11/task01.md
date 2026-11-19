# task01.md · 拆分实施任务与方案更新

- 共享根 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-19-huhu-prototypes-and-slices
- topic — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-19-huhu-prototypes-and-slices/topic.md
- manifest — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-19-huhu-prototypes-and-slices/manifest.tsv
- terminal_address — t11
- 身份 — 本机 wta Core，HC_TERMINAL_ID=t11。Astra 只写 Markdown 规划，Sol 只写原型及确认记录。
- 当前任务 — task01.md
- 任务文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-19-huhu-prototypes-and-slices/t11/task01.md
- 报告文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-19-huhu-prototypes-and-slices/t11/report01.md
- Lead 回告 — 外部 Lead 读取报告，发布后输出其路径。
- 工作目录 — D:/Document/code/huhu
- 接续 — 上一轮的独立 change 已在原位置，本任务复用其文档。

## 用户约束

- 用户要求用上游默认分支最新源码、当前 Huhu 检出为标准。原 Issue 固定引用保留历史出处，以 `temp/sources` 及批次来源清单查实际版本。克隆在进行中，可先读现有 Huhu 文件，禁止另行克隆或修改来源文件。
- #6 用户确定局域网邀请在服务开启期间可以重复用，可撤销；关闭服务或换 Vault 后失效，界面提供独立撤销、可见状态/重取链接，具体是否注销已建立的会话若无决定应清楚标注或给可选路径。
- 用户确认产品尚未发布，无需旧格式兼容。#9 不规划旧库迁入、手工转存或兼容入口，按新模型和模块独立认证。其他 issue 不为旧接口/数据格式增设兼容实现。仍规划新格式正常备份恢复，不触碰或删除真实旧数据。
- 原文第三方项目作为授权源码、功能及信息结构的参考。产出使用 Huhu 自有主题、导航、组件和文案，保持可辨识，不复制第三方专有界面或资产。

## 唯一写入范围

- #3 · `.agents/dev/changes/2026-11-19-issue-3-desktop-shell/`。三平台标题栏、工作台/启动/错误、菜单与焦点、脏内容关闭/重试；原生行为只能模拟。
- #10 · `.agents/dev/changes/2026-11-19-issue-10-widget-dashboard/`。目录、添加/配置独立实例、拖拽/缩放与键盘、保存/取消/冲突、窄窗和缺失插件。

读取 AGENTS.md、dev-plan SKILL 和完整切片方法/模板，结合 dev-spec、dev-architecture、dev-grill。按已有交付编号拆成 tasks/<编号>-<slug>.md，以可单独交接的规模为准。若已有一行包含多项独立可验收行为则继续细分并保留上级 ID。每份 task 写可见结果、规格和代码入口、真实依赖、边界、正常/失败与验证步骤、对应 prototype/index.html 场景和 prototype-review.md 待确认范围。plan.md 更新成索引与依赖，正文只维护一处。必要时按用户已确认的三个规则修订本组 spec/design/plan，尽量维持同一权威决定，明确开发版本与实际环境约束。不得修改 source.md、prototype 或 prototype-review.md。核对每个切片有链接及覆盖关系，每个界面切片有确认要求。

并行组只修改自己范围，不开启其他子代理，不写产品代码、仓库全局配置、GitHub、Git 提交或推送。相应原型/任务由另组并行写，不能视为自己的变更。优先完成可运行产物和报告，避免过度研究。

## 报告

按 system-herdr-core 文件协作协议，核对 task、topic、manifest active 和终端身份。写指定同号报告，注明模型、实际产物、覆盖、已执行验证和待决项。报告完整后同目录原子发布且不覆盖。
