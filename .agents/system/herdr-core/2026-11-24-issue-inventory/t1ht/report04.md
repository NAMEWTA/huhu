# 派发回执

- 共享根 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory
- terminal_address — t1ht
- task — task04.md
- 任务文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/t1ht/task04.md
- 回执文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/t1ht/report04.md
- 业务验收报告 — /home/wta/projects/huhu/.agents/dev/changes/2026-11-24-issue-inventory/evidences/{016-u0,017-hostui,018-endpoint}.md
- 执行结果 — done，交 Lead 验收

## 成果与运行指针

工作目录为 `/home/wta/projects/huhu/.agents/dev/worktree/inv-w2`，分支 `inv/w2` 自 `8e575dccef256fb6273f205b4758abd73e6ac645` 接续。三票独立提交，均含 `Refs: #14`。截图、指标、日志与图索引在 `/home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/runs/t1ht/task04/`。

### U0 · aedd6ef93188a8665033458f8e83febaeda05ff5

改动 `tests/e2e/helpers/launch.ts`、`tests/e2e/workflows/workbench-baseline.spec.ts`。使用主检出已有的未打包桌面产物 `0.0.2-rc.1 / b289ac3f87d5fd3c1f4493fc3e5795966c36be2c`，`builtAt=2026-11-24T14:18:21.217Z`。采样的服务器和前端同来自该产物。原始 26 图来自 `993eaa44bba908e1769cc1b9ceba927c18d1b419`，原安装包 SHA、精确窗口、应用缩放和保存错误日志未知。该 SHA 仅是图片提交，裁剪像素也只记录为裁剪尺寸。

Ubuntu 26.04.1 LTS x64 / Linux 7.0.0-43-generic，Xvfb X11，Electron 44.9.1 / Chromium 152.0.7977.167，独立邀请 Web Chromium 158.0.8127.18，Claude 浅色、CSS 正文字号 14px。桌面图 04/10 用 1000×720 内容窗口、125% 缩放，CSS 800×576、DPR 1.25；终端桌面用 1160×960、125%，CSS 928×768、DPR 1.25；独立 Web 都为 CSS 800×576、DPR 1。桌面与浏览器有各自的截图、DOM/几何及请求事实。

| 场景 | 最短操作及结果 |
| --- | --- |
| 图 04 中文保存 | 知识库打开中文笔记，手动保存模式用多次中文插入后点保存。两端正常路径均落盘。仅对这篇笔记的 `notes.save` 注入 `INTERNAL / 发生未预期错误` 后，两端复现红条及相同文案，保留未保存文字，磁盘仍上个已保存版本；去掉注入后点击保存可落盘。记录请求 ID 与字节数。正常样本未复现原始未知错误；缺原输入法、触发时序与宿主日志。 |
| 图 10 slash | 收件箱页面使用带标题、内容、来源的「快速捕获」表单，点正文键入 `/`。两端真实 `dialog:modal` 中菜单选项已生成，`menuInModal=false` 与 `optionHit=false`，截图均只看得见输入层，第一次 Esc 后表单仍打开。源码 `suggestion-floating-ui.ts` 把 popup 插入 body，符合观测到的 top layer 层级，后续 U1 可接 HostUI。 |
| 图 12 终端 | 桌面启动本地 Shell，向下分栏、拖动水平分割线，再从控制者向真实 PTY 输出最后一行定位标记，Web 观察同一会话。桌面末行底缘 562.96 CSS px 超过内容部 519.40；Web 末行底缘 556 超过内容部 427，命中位置实际是 `.agent-main-footer`。两端的裁切祖先均包含 `.agent-workspace-pane-body` 与 `.agent-workspace-leaf` 的 `overflow:hidden`，屏幕节点自身仍含该行。控制者实际 PTY 为 13×61，桌面渲染 13 行，Web 观察器渲染 14 行。用真实 Shell 证明裁切机制，图中 Windows Pi 1.6.0 的扩展组合仍按原图保留。 |

基线启动时继承的 Wayland 提示使 Electron 在 Xvfb 下提前退出，调整为 X11 后成功。1000×720、125% 的首轮上下分栏设定导致最小/最大比例均为 50%，因此采用更高的桌面窗口取拖动证据。两次运行的原件保留。最终对主检出的更新构建复跑，产物 `0.0.2-rc.1 / f1b0e7306002b38e547280d3680db1e711516dd2`（2026-11-24T14:45:32.901Z）上三个 Playwright 场景均完成采样，复核结果与截图、终端几何一致。看 `u0-final.json`、`u0-final.log` 与 `u0-final/`。

按 `u0-image-index.tsv` 点名的 26 图及当时可复用确认：

| 页面及图片 | 已有原型确认范围 |
| --- | --- |
| 知识库／日记 01–07 | #2 归档 `feature_2026-11-14-knowledge-ok-parity/ui-design.md` 为现有编辑器行为依据，#3 已确认文档保存/关闭反馈。图 06 是月历参考；常驻月历、单条批注新版布局与截图所示异常各自待对应验证。 |
| 新建任务 08–09、收件箱 10 | #5 已确认人工派遣、任务详情及运行抽屉的回答/补充/结果和待核实。新窄栏排布与 Inbox 原生对话框内菜单按本批事实及后续原型。 |
| 邮件 11 | #8 已确认邮箱连接测试、保留草稿、部分接受按失败收件人重试、结果待核实；新版设置入口与窄窗三栏尚待对应确认。 |
| Agent CLI 12–17 | #4 已确认会话选择、等待/断线反馈及从任务定位，四向分栏和调整比例有同版原型演示。图 17 是 ORCA 参考，紧凑两级启动器与去重复导航的新界面仍需同范围确认。 |
| 自动化 18、共享控件 19–20 | #5 已确认编辑保留启停、预览三次、DST 缺口反馈及回拨早/晚选择；新的表单容器和主题原生替代仍须按页面验收。 |
| 工具 21 | #6 已确认逐项与批量授权、可用性说明、Web 分享与撤销；新授权布局及 HTTP-only 是 #14 后续，旧 stdio 界面不作为新契约。 |
| 版本与同步 22、外观 24 | 现行设置页与主题为现状依据；本批未找到符合截图改版范围的新确认。 |
| 保险箱 23 | #9 已确认多账号下拉、锁定清理、模块独立授权与恢复反馈；三栏与窄窗逐级返回属于待确认的新布局。 |
| 看板 25–26 | #10 已确认宽窄调整、布局、保存冲突和带草稿离场；新版添加卡片的搜索/分类及动作分组需按本页范围确认。 |

复用查了 Huhu 的 DocumentSession / NotesService、原生 Dialog 与 vendor popup、WorkspaceCanvas / TerminalView。共享源码核到 Open Knowledge `44a2e0a6acce`、ORCA `7041ea022826`、Herdr Core `ce81486e3d40`、Homarr `b440fdd574c9`；本批无上游代码拷贝或新依赖。对应原型记录在各 #3/#4/#5/#6/#8/#9/#10 的归档 `prototype-review.md`，以上只登记其中明确确认或演示的范围。

### HostUI · 8dd2c3d7fbeeb5a51a026432b8d6517575ab4f9f

改动 `packages/ui/src/components/host-ui.ts`、`packages/ui/src/index.ts`、`apps/desktop/test/host-ui-contract.test.ts`。公共样例用容器和事件传入当前层，沿原 `Dialog` 使用的浏览器原生 modal 机制，避免为整个工作台安装额外 Esc 监听器。日期合同区分纯日期、UTC 时刻、带时区的本地时钟输入。

| 消费者 | 可运行样例约定 |
| --- | --- |
| Inbox 内嵌命令 | 浮层挂最近打开的 dialog。第一次 Esc 收菜单且回到原字段，下一次交外层；输入法组合中保留 Esc。此表单示例没有日期字段。 |
| 编辑器 | 普通文档浮层挂所属主题作用域，内嵌浮层随最近 dialog；离场后原节点失效。无纯日期时传 `null`，纯日期原样保留 YYYY-MM-DD。 |
| Automations 编辑 | 复用字段/按钮自己的浮层与焦点返回。绝对时刻保留 UTC，指定时区的本地日期时间保留输入并可记录回拨早/晚；明确清空时值为 `null`，保留选择的时区。实际缺口/回拨解析沿调度服务。 |

`flock /home/wta/projects/huhu/temp/dev/verify.lock volta run --node 24.22.1 pnpm exec vitest run apps/desktop/test/host-ui-contract.test.ts` 4 项通过。样例用 DOM/事件验证契约，真实 Inbox/编辑器挂载迁移与 Automations 表单接线归 U1/U4。U0 记录的是迁移前现状。

### Endpoint · c2594be9b3d6da35fb7b6a08f7652a06a461b106

新增 `apps/engine/test/endpoint-contract.test.ts`。以现有 `boot({port})`、`startEngineServer`、`apps/cli/src/connect.ts` 和 Gateway 实际请求落地。对普通 CLI 展示从 Vault 专属 descriptor 读取当前地址和临时令牌；停机移除 descriptor，重启后按原路径重新发现，拒绝另一个根绑定的 descriptor。对没有 huhu 命令的外部客户端使用直接 HTTP initialize → tools/list → vault_info；重启后使用同一个明确选择的回环 URL 和同一持久授权，新建 MCP 会话。开关关了返回 404 且 CLI 继续可用，重启前的临时令牌、撤销或无效令牌返回 401，CLI/桌面令牌访问 MCP 返回 403。尝试在已占用固定端口启动同一监听实现时保留 `EADDRINUSE`，先前监听地址不变。

`flock /home/wta/projects/huhu/temp/dev/verify.lock volta run --node 24.22.1 pnpm exec vitest run apps/engine/test/endpoint-contract.test.ts` 2 项通过。这是对已生效地址的消费合同。机器与 Vault 绑定的持久端口配置、待重启值与复制生效地址、浏览器受限端口校验、HTTP-only 清理和远端 TLS 属于 U5 实施。当前样例显式重传 `port`，没有将样例当作持久配置验收。

## 阻碍与接续

U0 例外复现用同一个 `tests/e2e/workflows/workbench-baseline.spec.ts`，xvfb-run 与 Playwright 嵌在共享验证锁内，最多 1 worker。保存、slash、末行的用例名分别为「U0 中文笔记编辑与受控保存失败」「U0 快速捕获对话框的 slash 命中与层次」「U0 真实 PTY 分栏拖动后的末行与光标」。Lead 在组合产物上重跑可发同样的 `HUHU_U0_DESKTOP_APP`，本机命令保存于运行附件。待 Lead 对 `@huhu/ui`、`@huhu/desktop`、`@huhu/engine` 及 Playwright TS 入口执行类型核对。未运行 U0 以外的 E2E、构建或打包。

## Lead 验收

- Lead 2026-11-24：U0/HostUI/Endpoint 合入 main，类型检查与合同测试通过。清单转 task05。
