# #6 Mail 工具逐项开放（Linux）

- 基线为 `eaa5545ad27524b55eaf9f22db37c39561b0b64f`。范围为 Mail 模块、测试和 Engine 的一行静态目录装配。
- 目录含 53 项。48 项可逐项开放，5 项保持关闭。目录与运行时绑定复用同一描述符，所有项的 `defaultExposed` 为 `false`。
- 外部写入使用 Mail 已有草稿 ID／修订、投递 operationId、删除影响摘要、配置/预检句柄，或能力输入中指定的 `requestId`。Mail 域回执仅保留摘要、标识、修订和状态。临时句柄在重启后过期。原结果无法核实时返回未知。
- 引擎恢复 HTTP MCP 逻辑会话后保留原主体和只读对账能力。共享 Dispatcher 对领域写入重交返回 `INTERNAL`／`outcome: unknown`，行为沿用 t26 的 Lead 验收决议。

## Mail AI

外部准备先绑定 Vault 会话主体、已保存的账号修订、邮件来源摘要、正文 UTF-16 选区、模式、问题、配置修订和目标。准备阶段只读本地缓存并创建短时待批准项。桌面和 Web 工作台使用同一确认界面，显示完整选区、问题、账号、目录及目标服务。批准后只有同一逻辑主体可消费一次，发送前复验来源、配置和授权。

待批准项及其正文和问题只驻留内存。工具曝光策略版本变化会作废当前待发批准，需要重新准备。已完成请求在可对账入口重交时返回完成状态。外部响应只提供文本，工作台采纳流程沿用原可编辑草稿，投递仍由独立发件操作完成。

## 验证记录

| 项目 | 结果 | 依据 |
| --- | --- | --- |
| 静态目录与 Mail 回执 | 3 项通过。目录与插件清单逐 ID 相等，秘密编辑及工作台批准无法外授。验证同主体合并、异参冲突、重启后的安全投影、未知不重复执行。 | `plugins/mail/test/tool-exposure.test.ts`、`plugins/mail/test/tool-intents.test.ts`、`/tmp/huhu-t2r-offline-targeted.log` |
| 既有 Mail 回归 | 中断前版本的 55 个断言通过，1 个回环 IMAP 夹具 EPIPE 使进程退出失败。候选补充了 readline 错误处理，待复测。 | `/tmp/huhu-t2r-mail-regression.log` |
| CLI／HTTP MCP 双入口 | 两项参数化真实入口用例已落地。恢复后的沙箱在第一处回环夹具绑定报 `listen EPERM: operation not permitted 127.0.0.1`，该次运行未达到业务断言。 | `plugins/mail/test/tool-exposure.test.ts`、`/tmp/huhu-t2r-mail-exposure.log` |
| 桌面／Web 批准 | 两个界面复用的批准流程已落地，Playwright 已列出三个用例，其中新增用例覆盖键盘关闭、精确内容和一次发送。回环环境受限，浏览器交互待验证。运行时实际为 Electron 44.9.1、Chromium 152.0.7977.167。 | `plugins/mail/test/mail-ai.e2e.ts` |
| 静态门禁 | 限并发的全仓类型检查、`pnpm format:check`、`pnpm knip` 通过。直接执行 Oxlint、Stylelint 和两条 lint 规则样例通过。完整 `pnpm lint` 脚本中 Node 的同步子进程调用被沙箱标为 `EPERM`，脚本门禁待复验。 | `/tmp/huhu-t2r-typecheck-constrained.log`、`/tmp/huhu-t2r-format.log`、`/tmp/huhu-t2r-knip.log`、`/tmp/huhu-t2r-lint-retry.log`、`/tmp/huhu-t2r-lint-equivalent.log` |
| 全量测试 | 待回环运行环境恢复后执行，命令为 `flock /tmp/huhu-fulltest.lock pnpm test -- --maxWorkers=2`。 | task01 与 Lead 的 worker 上限 |

## Lead 装配

Engine 用 `registry.declareDescriptors("mail", mail.mailCapabilityDescriptors)` 代替原手工枚举。Mail 模块索引导出聚合描述符，定义来自账号目录、账号移除、账号设置、对话、草稿/投递、AI、OAuth、缓存、邮件子集和同步周期的原注册模块。各 handler 绑定聚合中的相同对象。清单补齐 4 个原运行时能力和 3 个工作台批准能力。Engine 的 Mail 插件注册参数沿用现有装配。

### Modern Web Guidance

- `dialog`：我复用了通过 `showModal()` 打开的原生 `Dialog`。原生对话框负责背景惰性、Escape 和焦点返回，关闭控件排在批准之前。指南指出 “the browser returns it to the invoker”。
- `html`：我用 `dl`、`dt` 和 `dd` 展示目标、账号及将发送的文本，沿用现有工作台组件。指南要求保持 HTML 的原生语义。
- `accessibility`：我沿用组件的标题关联和具名关闭按钮，待确认内容按正常文档顺序呈现。指南要求 “Provide a logical tab order”。
