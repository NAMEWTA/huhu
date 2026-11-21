# task01 · G07 收件箱正文回退修复 + H05 收件箱想法输入改用 compact 编辑器

角色：具体实现（gpt-6.2-sol medium）。工作目录 `/home/wta/projects/huhu-wt-inbox`，分支 `closeout4/inbox`（= `closeout4/final` 4b4ce9c，依赖已装）。提交，不推送。前端改动先按 AGENTS.md 执行 `zh-modern-web-guidance` 的 search / retrieve。

## A. G07：收件正文冷启动无回退
依据：`/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pG/report03.md`（根因、原型 `/tmp/g03/reader.js`、`/tmp/g03/reader.css`、`/tmp/g03/proto.py`、等价性方法）。规格 G07：首屏与非知识库模块冷启动对 rc.4 无回退。
- 按 report03「交给实现会话」第 1 条落地：`@huhu/editor` 提供独立的轻量阅读入口（不进入 rich 闭包），只对已与 OK `mdManager.parseWithFallback` 输出等价的普通段落直接渲染；其余交回 `CompactMarkdownView`。阅读样式与 OK 共用规则，不复制一套。记录 ID 绑定、切换条目丢弃过期结果、只读不写回。
- 差分测试：普通段落判定与渲染对照真实 OK 解析 / 序列化（单元测试，含 report03 的组合样本与拒绝样本）；复制 `text/plain`、`text/html` 与 OK 一致的 e2e。
- 不得改变富格式正文的显示：富格式样本（加粗、链接、列表、代码、Wiki 链接、空正文）在 e2e 中与原 compact 输出一致。
- 如另有更简单且同等有效的方案（如入口闭包拆分），可以采用，但须在报告中给出同一驱动的对照数据。

## B. H05：收件箱想法输入用 OK compact
规格 H05：「任务描述、收件箱想法的输入、保存、`@` 引用、撤销、输入法在 e2e 中通过」；OP-D18：inbox 想法编辑用 `compact`（保留 `@`）。当前 `plugins/inbox/src/ui/InboxModule.tsx` 约 400 行（编辑想法对话框的「内容」）仍为 textarea。
- 把想法正文编辑改为 `CompactMarkdownInput`（参照 `plugins/tasks/src/ui/compact.tsx` 的 referenceSearch、port flush，取消丢弃草稿）。快速捕获单行 input 与「转为任务」表单（约 479 行）是否在范围内：先核对规格 / 决定记录 / rc.4 行为，在报告中写明依据；转为任务的内容若属于任务描述输入，也须用 compact。
- e2e（真实 Electron，零重试）：收件想法的输入、保存后重开读回磁盘、`@` 引用补全插入、撤销 / 重做、CDP IME 组合（组合中不提交、提交后落盘、取消无残余）。任务描述同样要有 IME 与撤销的 e2e；已有覆盖则列出用例名，缺则补。

## 验证
- 门禁：format:check、lint、typecheck、test、test:vendor、build（含 check:ok-css）、knip、notices、`node scripts/ok-patches.mjs --check`（如改 vendor）。
- 指定 e2e：inbox 相关、compact-*、acceptance 中收件 / 任务相关、你新增的，零重试单 worker。
- G07：负载 <2、无其他 Electron/Playwright 时，`xvfb-run -a node scripts/measure-notes-startup.mjs /home/wta/projects/huhu-wt-rc4 10 --frame-click`（保留正文端点），给出收件正文 / 标题 / 任务 / 首屏 / 首页数据 / 首篇笔记 p50/p95 与配对区间；另用一条富格式收件正文样本补测一组（如驱动不支持，在 /tmp 复制驱动加参数，说明改动）。记录 uptime。

回报 `report01.md`（同目录），manifest 中 w4:pP 改为 `task01.md done`（阻塞写 blocked 并说明）。
