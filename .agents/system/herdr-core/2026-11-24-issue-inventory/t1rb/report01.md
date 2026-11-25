# 派发回执

- 共享根 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory
- terminal_address — t1rb
- task — task01.md
- 任务文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/t1rb/task01.md
- 回执文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/t1rb/report01.md
- 业务验收报告 — /home/wta/projects/huhu/.agents/dev/changes/2026-11-24-issue-inventory/evidences/076-aw2.md、077-aw3.md
- 执行结果 — blocked。两票各交回一笔提交，下面所列能力及 Lead 验收仍待完成。

## 成果与运行指针

工作目录为 `/home/wta/projects/huhu/.agents/dev/worktree/inv-w2`，分支 `inv/w2`，接手基线 `daefdcc3`。复用已确认原型 `96b22cdaa663016ae351a006be8e46fbb936a85c17489b52059f6debf3018775`、现有 Plan API、规则/扫描实现、HostUI 与真实 Agent 目录。原始验证输出位于 `/home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/runs/t1rb/task01/`。

### 076-aw2 · 计划中心与模板

- 提交 `74f43657`。
- 自动化首页从统一计划 API 读取目录。支持搜索、来源/动作/状态组合筛选、排序、游标分页、空库与无匹配状态、独立行尾操作、选中详情与返回焦点。启停、删除、来源改期执行修订校验。详情保留计划、来源 Task 和最近发生的身份。
- 规则模板只填草稿，普通规则、中心的新状态观察和一次性任务提醒可以按暂停状态创建。默认扫描从独立确认入口调用已有恢复能力，模板浏览和取消没有创建动作。
- 改动文件 — `plugins/automations/src/engine/{observations,plans,task-reminder-plans}.ts`、`plugins/automations/src/shared/plan-directory.ts`、`plugins/automations/src/ui/{AutomationsModule,ObservationEditor,PlanDirectory,PlanScheduleControls,RuleDetails,RuleEditor,TaskReminderEditor}.tsx`、`plugins/automations/src/ui/{automations.css,plan-presentation.ts}`、`plugins/automations/test/plan-directory.test.ts`、`tests/e2e/workflows/automation-center.spec.ts`。
- 已跑 `pnpm exec vitest run plugins/automations/test/plan-directory.test.ts`，2/2。已跑 `pnpm --filter @huhu/plugin-automations run typecheck`，通过。

### 077-aw3 · 完整编辑与目标

- 提交 `0fb8257d`。
- 规则表单支持每日/周几/高级 Cron、明确计划时区、真实宽限、扫描窗口和自定义绝对范围、逾期/未排期、并发及补充指令。既有来源的固定间隔保留秒/分钟合同，一次性提醒与观察沿用各自的端口。草稿预览通过同一服务解释器读取候选，失效时中止或舍弃响应。
- 规则、观察、一次性任务提醒和改期表单统一接入未保存确认。规则冲突保留输入，核对并显式采用当前修订后只提交用户改过的字段。固定需求显示新 Task 模式，从 Agent 检测目录选择真实模型与推理档位。立即运行保留同会话的原请求键供核实，带原规则版本，工作台终端权限继续走既有执行路径。
- 改动文件 — `plugins/agent-cli/src/engine/{capabilities,index}.ts`、`plugins/automations/huhu-plugin.json`、`plugins/automations/src/engine/{index,plans,service}.ts`、`plugins/automations/src/ui/{AutomationsModule,ObservationEditor,PlanDirectory,PlanScheduleControls,RuleDetails,RuleDraftDialog,RuleEditor,TaskReminderEditor,use-draft-dismissal}.tsx`、`plugins/automations/src/ui/{automations.css,cron-presets.ts,i18n.ts,plan-presentation.ts,plan-write.ts}`、`plugins/automations/test/{cron-presets,default-task-scan,service}.test.ts`、`tests/e2e/workflows/{acceptance,automation-center,task-journey}.spec.ts`。
- 保持测试一文件一命令，Node 24.22.1。共用 `flock /home/wta/projects/huhu/temp/dev/verify.lock`。厂商声明预备命令 `pnpm --filter "./vendor/*" run build:types` 通过。
- `pnpm --filter @huhu/plugin-automations run typecheck` 和 `pnpm --filter @huhu/plugin-agent-cli run typecheck` 通过。
- `pnpm exec vitest run plugins/automations/test/cron-presets.test.ts` 通过，4/4。
- `pnpm exec vitest run plugins/automations/test/default-task-scan.test.ts` 通过，7/7。首次复跑发现草稿预览注册声明缺失，补齐并增加通过真实引擎读取草稿预览的用例后通过。
- `pnpm exec vitest run plugins/automations/test/service.test.ts` 通过，49/49。
- `pnpm exec vitest run plugins/automations/test/scheduler.test.ts` 通过，12/12。
- 最终 `git diff --cached --check` 通过，提交后工作树干净。验证终端均已回收。

### 交给 Lead 的定向 E2E

`tests/e2e/workflows/automation-center.spec.ts`

- AW2：模板只填草稿，目录组合筛选并保留原计划身份
- AW3：扫描草稿预览无写入，关闭保护草稿并保留并发冲突输入
- AW3：暂停规则的手动请求断线后从原意图核实
- AW3：独立 Web 窄容器保留编辑内容和返回焦点

原有回归入口同步到新版交互。分别见 `tests/e2e/workflows/acceptance.spec.ts` 的 MailPlan、F31 和「桌面规则的独立环境」流程，及 `tests/e2e/workflows/task-journey.spec.ts` 的 T4.1/T5.5。

### 未运行的验证

- 按派发约定，E2E、实机视觉走查、真实 provider 与外部源服务、构建、打包、全仓测试与检查均留给 Lead。新测试文件和既有场景的适配均未运行 E2E。
- 未验证桌面和 Web 的全来源交叉旅程。真实设备/权限变化、跨源历史、DST 与手动运行断线端到端行为仍须在同一整合版本验收。

## 阻碍与接续

- **AW2 · AU01/AU03/AU10。** 当前详情可精确打开来源 Task、定位最近发生并按已核对的会话代次导航。来源模块与通知的反向直达、非 Task 来源对象的精确定位、跨来源完整历史仍需对应导航/历史接口。邮箱、Git、SSH 模板说明所需来源配置，当前端口没有从中心创建一份暂停的来源配置草稿。全局暂停缺少统一控制端口。
- **AW3 · AU06/AU07/AU09/AU11/AU12。** 一般规则存储与调度仍是 Cron。固定间隔可改现有来源计划，任意动作的一次性/间隔新建及自由切换需要正式调度合同。一任务提醒保存 UTC 绝对时刻并通过宿主校验客户端本地间隙/回拨，任意 IANA 输入时区和跨来源的服务预览仍待接线。当前目标区展示真实 Space/客户端/模型能力，profile、工具权限和跨计划运行期管理仍需领域端口。原手动意图保留于当前工作台页面，客户端完全关闭后仍需产品级恢复入口。
- 没有改动业务验收文件。共用该检出与 worker 供 Lead 验收和回收。

## Lead 验收


- Lead 2026-11-25：AW2/AW3 经冲突解决 a26d1ae3 与布局修复 1f7fba45 后通过。清单转 task02。
