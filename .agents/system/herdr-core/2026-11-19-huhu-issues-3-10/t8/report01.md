# 任务报告

- 共享根 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-19-huhu-issues-3-10
- terminal_address — t8
- task — task01.md
- 任务文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-19-huhu-issues-3-10/t8/task01.md
- 报告文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-19-huhu-issues-3-10/t8/report01.md
- 执行结果 — done

## 结论

已为 #8 Mail 和 #9 Safe 各交付规格、架构与分阶段计划。Mail 的本地消息身份、远端定位、SMTP 投递和备份各有状态所有者；Safe 只保护个人密码数据，运行凭据由其所属模块保存和使用。工程推荐为 Mail 在现有 TS Engine 中适配 one-mail，模块秘密优先验证 Engine 可用的系统钥匙串绑定。两项都是供审阅的方案。用户尚未选择同地址邮件迁入策略、附加 Graph 授权范围及旧保险箱数据的实际处置方式。

## 产物与改动

| Issue | 规格 | 架构与待决选择 | 切片及证据 |
| --- | --- | --- | --- |
| #8 Mail | [spec.md](../../../../dev/changes/2026-11-19-issue-8-mail-module/spec.md) | [design.md](../../../../dev/changes/2026-11-19-issue-8-mail-module/design.md) | [plan.md](../../../../dev/changes/2026-11-19-issue-8-mail-module/plan.md) |
| #9 Safe | [spec.md](../../../../dev/changes/2026-11-19-issue-9-safe-accounts/spec.md) | [design.md](../../../../dev/changes/2026-11-19-issue-9-safe-accounts/design.md) | [plan.md](../../../../dev/changes/2026-11-19-issue-9-safe-accounts/plan.md) |

工作区为 D:/Document/code/huhu，分支 feature/issue-fix，HEAD 为 9f870c0fad0c1d0538b9783214d2f4a3a3278b10。本 worker 的写入为上述六份新增 Markdown 及本报告。开始时两个 change 目录各只有 source.md，t8 目录只有 task01.md。未提交。共享分支已有 AGENTS.md 修改、来源快照及其他 worker 的目录。

## 验证

| 验收要求 | 实际检查与结果 | 证据位置 |
| --- | --- | --- |
| 核对派工身份和写入范围 | hc server status 返回 wta、0.1.21、Core ID 346bd5608735e3fcb27f9d01f5c8008e；本机 WTA、HC_TERMINAL_ID=t8。topic 续派 t4 → t8，manifest 为 t8 / task01.md / active。发布前无同名报告。 | [任务](task01.md)、[topic](../topic.md)、[manifest](../manifest.tsv) |
| 保留完整来源并区分基线 | #8 和 #9 来源分别为 568、316 行，均无评论。前后 git hash-object 分别为 82ec74f197baf0ad95e75ab917cfc07f48774e98 和 8c52a9d0db13d97b5c556f3791c44280e82743bd。Issue 的 Huhu 链接为 9132640，本 checkout 的 AGENTS.md、编辑器、桌面预览和实际插件入口已重新查证。 | [#8 原始快照](../../../../dev/changes/2026-11-19-issue-8-mail-module/source.md)、[#9 原始快照](../../../../dev/changes/2026-11-19-issue-9-safe-accounts/source.md) |
| 固定取证和复用边界 | gh api 读 one-mail d1be24d 的树、README 和关键文件，核对 18+1 预设、collect_conversations、stable_uid 到正文 u32 转换、IMAP 读标志确认、SMTP 重试及原生备份 database_key。Motty 1022282 的文件钥匙回退和 Apache-2.0 已核对。记录本地依赖和 npm 候选许可。ORCA 指定提交的 tree/commit 请求返回 404。 | [Mail 来源和差异](../../../../dev/changes/2026-11-19-issue-8-mail-module/design.md)、[Safe 候选与上游](../../../../dev/changes/2026-11-19-issue-9-safe-accounts/design.md) |
| 架构与故障窗口 | 沿 Engine boot → Dispatcher/幂等回执 → 插件 handler、VaultFiles/数据包/Git 分类追读。对照 SSH 表单取密、Git ASKPASS、自动化 envRefs → Agent CLI → Core、并存的 headless worker 路径。分别比较 TS/Rust 邮件核心、条目分载荷/整库快照、Engine 钥匙串/main safeStorage；用具体调用和故障时序约束结果。 | 两份 design.md 的当前调用链、提交顺序和恢复窗口 |
| 前端兼容性研究 | 运行 modern-web-guidance 的 search（sanitize untrusted HTML、edit password form）与 retrieve（sanitize-untrusted-html、security、forms、accessibility、validate-input-after-interaction）。对照 Electron 44.9.1 发布表的 Chromium 152.0.7977.167 和指南中的 Web Baseline，记录 HTML 净化回退与表单错误反馈。 | 两份 design.md 的前端章节及 Electron 发布链接 |
| Markdown、覆盖与产物 | UTF-8 读取六份文件，检查 61 个本地 Markdown 引用全部可达；将 #8 的 M-01–08、S0–9 和 #9 源文 A/B/C/D 共 23 项对照计划。两个目录各含原快照和三份新文件。最末 git diff --name-only 仍仅列任务开始前已有的 AGENTS.md；限定目录的 git status 确认新增产物。 | 两份 plan.md 的覆盖表和上方产物链接 |
| 运行证据的界限 | 本轮按派工只做研究、设计及文档检查。两项原型尚待制作和用户确认；产品构建、三平台应用、真实邮箱/SSH/Git/Agent、钥匙串、LAN 浏览器和旧库恢复均列为未来验证。 | 两份 plan.md 各切片的实际采证条件 |

## 阻碍与接续

本次文档交付完成，后续实施依赖如下。

- 可独立推进 Mail 的来源台账、消息与发送故障样例，Safe 的个人条目/标签、只读迁移盘点和隔离样本演练。Git HTTPS 去耦由 #9 直接负责。两个原型都可用脱敏资料先行走查。
- #9 的三平台存储选型约束 #7 SSH、#8 Mail 和 #4/#5 的秘密持久化。#4/#5 负责执行链及 Core 恢复材料的验证。#6 负责目录、共用开放策略、CLI 受控输入与 Web 文件传输；Mail、Safe 仍各自拥有领域 handler。
- 真实旧密码的迁移/保留/清理只按 #9 design 中的决策顺序处理；Mail 冲突账号和 Graph 扩展只阻塞 #8 design 所列切片。固定源码抽查未涵盖完整依赖闭包和素材授权，本机无 temp/sources，未取得 #4 指定版 ORCA 源码。测试账号、应用注册、系统安全存储及三平台打包条件待实施时核实。

## Lead 验收

由外部 Lead 核验本报告、业务产物及任务范围后追加。

- 通过。核对 #8、#9 共六份规划文档与本地链接。SMTP 未知结果、邮箱自有认证及个人保险箱和模块凭据分离的边界与批次一致。旧库处置和真实钥匙串、账号联调仍待后续确认。
