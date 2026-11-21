# S7.2 Mail AI 选段与草稿 · Windows 合成验收

依赖 [S7.1 配置与验证](evidence-S7.1-mail-ai-settings.md)，按 [S7.2](tasks/S7.2-ai-selection.md) 和 [M-08 已确认原型](prototype-review.md) 验收。当前范围是单封正在阅读的邮件、一个显式选择的纯文字片段，并支持总结、提取待办、起草回复和一次提问。提问及所选片段会在同一确认操作中发出。

| 场景 | 实际观察 |
| --- | --- |
| Electron 44.9.1 / Chromium 152.0.7977.167，用隔离 IMAP 同步两封合成邮件 | 默认关闭时 AI 入口不可操作，模型夹具收到 0 次请求。开启后从缓存搜索定位首封，选一行，确认界面展示规范化的目标地址、模型和完整所选片段。未选时确认按钮禁用。用 Esc 取消已选片段后焦点回到原按钮，夹具仍只有设置保存时的合成 ping。 |
| Electron，选段后提取待办、失败后重试、起草回复 | 模拟服务返回 500，原邮件与选段保留，重新核对目的地后再确认可读到结果。整个用例对模型夹具发送 1 次合成 ping 和 3 次确认请求。每次确认的正文只含所选行，无另一行、另一封邮件、发件人和主题。 |
| Electron，模型响应尝试携带操作，用户随后采纳 | 结果以文本展示并收到焦点，合成标签没有成为可执行 DOM，响应工具字段未触发操作。采纳前草稿与发件箱均空。采纳打开来源邮箱的原有回复编辑器，修改并保存后有 1 份草稿，发件箱仍空。 |
| Windows x64、Node 24.21.0、真实 Engine HTTP，2 个独立回环模型夹具 | 确认短期有效且只可消费一次，绑定调用会话及配置修订。同一可移植 Vault ID 恢复到第二份本地 Vault，旧确认被拒绝且没有请求。切换服务后复用旧确认遭拒，新服务只收到此次保存的合成 ping。已启用 MCP 也无调用权限。 |
| Engine 中止已确认的在途请求 | 第一个后端共收到 1 次合成 ping 和 1 次总结，第二个共收到 1 次合成 ping 和 1 次对话。对话正文和问题保留确认时的空白。已发出请求后关闭调用，第二个夹具观察到连接中止，未完成响应，未向其他后端重试。已运行的 Engine 不在结果缓存、持久意图或运行日志保留合成正文和问题。 |

运行命令为 `node_modules/.bin/vitest.cmd run plugins/mail/test/ai-selection-engine.test.ts` 与 `node_modules/.bin/playwright.cmd test -c plugins/mail/test/playwright.config.ts`。当前 Electron 构建通过，Playwright 两项通过。Mail 全量用 `node_modules/.bin/vitest.cmd run --project @huhu/plugin-mail --maxWorkers 1` 通过 13 个文件、53 项。首次并行运行中，旧的同 UID 隔离用例触及 5 秒超时；串行复跑该用例耗时 1.26 秒。Mail TypeScript、格式、lint 与 CSS 类检查通过。使用隔离 Vault、本机回环服务和合成邮箱。测试范围为 Windows。

确认记录保存在 Mail 运行期内存。切 Vault、插件停用或保存新的配置后需要重新确认。取消前已到达服务的请求由连接中止结束，已接收数据的留存取决于配置的模型服务。静态目录按 [S7.1 接线](evidence-S7.1-mail-ai-settings.md#集成范围) 一并声明五项能力。已登录 Web 复用同一工作区和 Engine handler，当前运行证据来自 Electron 和回环 Engine API。
