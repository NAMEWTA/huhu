# #6 Web 与外部评论、#8 Mail 独立审查

- 共享根 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-23-huhu-closeout-release`
- terminal_address — `t1dm`，Lead `t3p`
- task — `task01.md`
- 任务文件 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-23-huhu-closeout-release/t1dm/task01.md`
- 报告文件 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-23-huhu-closeout-release/t1dm/report01.md`
- 执行结果 — `done`。只读审查 `/home/wta/projects/huhu` 的 `main`，交付基线 `fc43ceef5b64ca1c9a68404c9110a6ca46883034`，审查 `cc551778c8d7130e8cd7cbb6bb95c6a4d1fc1ea2` 上的工作树改动及新增文件。已纳入 Lead 修订后由两个 Vite 配置各自传入 editorRoot 的版本。Tasks 仅审 `tasks.comments.add` 切片。

## 结论

#8 有三项需补齐，分别影响未读状态、缓存故障时的账号管理及分栏偏好。Lead 的 Mail E2E 已通过本轮基本交互和目录刷新取消路径。#6 在本次切片内未发现代码阻断，完整构建和源码构建的桌面加浏览器联验均有通过记录，最终候选包及跨入口验证仍待收口。

## 规格轴

1. **P2 · #8 同一封副本可以在账号行显示未读，而联系人列表显示已读。** 用一个账号的两个普通可见目录，按 `Archive, Work` 配置，两份邮件使用相同 RFC822 Message-ID 和日期。令 `Archive` 的 UID 1 未读，`Work` 的 UID 2 已读。账号摘要对同级目录沿用配置顺序并保留第一条，联系人用既有日期、来源和 UID 排序后选中 UID 2。我用 Node 26 抽取当前两个聚合函数执行合成数据，实际获得 `rowUnread=1`、`conversationUnread=0`，联系人采用 `Work` 副本。改用同一可见邮件身份与同级副本排序，并用相反已读状态和目录顺序补例。当前单测覆盖跨账号相同 UID，未覆盖同账号跨目录副本。 [#8 M-01/M-02](../../../../dev/archive/changes/implemented/feature_2026-11-19-issue-8-mail-module/spec.md#L20) · [账号聚合](../../../../../plugins/mail/src/engine/message-cache.ts#L244) · [联系人排序](../../../../../plugins/mail/src/engine/conversations.ts#L55) · [联系人去重](../../../../../plugins/mail/src/engine/conversations.ts#L78) · [单测](../../../../../plugins/mail/test/messages-engine.test.ts#L105)

2. **P2 · #8 重建型缓存的访问错误可以让全部账号和管理入口消失。** 在合成 Vault 内，让一个已配置目录对应的缓存位置产生 Vault 路径守卫错误，例如缓存目录的旧符号链接指向 Vault 外。只读探针用真实文件系统与当前路径守卫得到 `PATH_OUTSIDE_VAULT`，异常从摘要函数上抛。新工作区把摘要和必需的账号清单放进同一个请求。冷启动时这次请求失败使 `rows` 为空，依据 `available` 启用的账号管理也不可用，连另一健康账号也无法管理。保留现有路径守卫，让账号清单及认证信息独立返回，出错的摘要应显示未知或错误。可用两个账号和一个不可读缓存验证冷启动后两行仍在，健康账号可选，受影响账号仍可管理。探针验证了函数级异常，界面影响由调用链直接得出。 [缓存读路径](../../../../../plugins/mail/src/engine/message-cache.ts#L256) · [Vault 守卫](../../../../../packages/vault/src/paths.ts#L34) · [账号清单的投影调用](../../../../../plugins/mail/src/engine/registration.ts#L81) · [工作区查询](../../../../../plugins/mail/src/ui/MailModule.tsx#L99) · [管理入口条件](../../../../../plugins/mail/src/ui/MailModule.tsx#L395)

3. **P2 · #8 分栏宽度只在当前 Mail 工作区存活期间保留。** 调整两处分栏，关闭应用并重新打开同一个 Vault。两个宽度从 `260` 和 `208` 初始化，拖动与键盘只更新组件 state，因此重开恢复默认值。原始 Issue §5.4 明确要求按 Vault/插件保存偏好。关闭条件是同一个 Vault 重开恢复两处宽度，另一个 Vault 使用自己的偏好或默认值，窄窗只约束当前呈现宽度。现有 E2E 检查拖动及窄屏返回，未重开 Vault 验证偏好。 [原始契约](../../../../dev/archive/changes/implemented/feature_2026-11-19-issue-8-mail-module/source.md#L239) · [宽度初始化](../../../../../plugins/mail/src/ui/MailModule.tsx#L94) · [账号宽度回调](../../../../../plugins/mail/src/ui/MailModule.tsx#L542) · [联系人宽度回调](../../../../../plugins/mail/src/ui/MailModule.tsx#L1028) · [E2E](../../../../../tests/e2e/workflows/mail.spec.ts#L611)

## 规范轴

- **待修复的复用问题与第 1 项同源。** 账号摘要复用了公开目录过滤和缓存解析，却在另一路重复确定身份及胜出副本，两个已生效规则得出相反结果。可复用现有副本选择逻辑，并保留轻量摘要缓存。第 2 项还需保持账号 setup 与可重建缓存的故障边界。 [项目复用规则](../../../../../AGENTS.md) · [现有选择逻辑](../../../../../plugins/mail/src/engine/conversations.ts#L78)
- **#6 构建及宿主边界。** 两配置共享编辑器构建选项，由各自可解析的配置根传入路径。桌面入口从 `window.huhuHost` 拉取 Vault 和 Engine 状态，Web 从邀请和同源 bootstrap 进入共享工作台。Engine 资源路径指向 `out/web`，其根路径及既有深链路由从独立制品服务，打包包含规则为 `out/**`。检查空 MCP workspace、锁文件 importer、工作区消费者及发布配置，Linux Go 步骤与 `beforePack` 的 Linux PTY 构建对应。未暂存的删除仍被基于 `git ls-files` 的版本检查枚举，候选提交应带齐删除后再核对版本。 [Web Vite](../../../../../apps/desktop/vite.config.ts#L5) · [Electron Vite](../../../../../apps/desktop/electron.vite.config.ts#L41) · [桌面入口](../../../../../apps/desktop/src/renderer/main.tsx#L136) · [Web 入口](../../../../../apps/desktop/src/web/main.tsx#L11) · [Engine 路径](../../../../../apps/desktop/src/main/engine-supervisor.ts#L144) · [打包规则](../../../../../apps/desktop/electron-builder.yml#L10) · [发布 Go 步骤](../../../../../.github/workflows/release.yml#L26) · [版本检查](../../../../../scripts/sync-version.mjs#L17)
- **#6 外部评论边界。** 已授权的外部调用沿用评论存储与实体更新，服务端生成 ID、外部作者标识和来源，运行、问题、会话和回执类型只接受内部调用者的字段。普通评论写入保持执行输入版本与哈希，独立授权的回复或补充仍可由用户显式选取消息。未发现通过普通写评论触发派遣或冒充运行回执的路径。 [#6 规格](../../../../dev/archive/changes/implemented/feature_2026-11-19-issue-6-unified-tools-web/spec.md#L12) · [#5 普通讨论与显式补充](../../../../dev/archive/changes/implemented/feature_2026-11-19-issue-5-task-automation/spec.md#L12) · [评论能力](../../../../../plugins/tasks/src/engine/index.ts#L634) · [存储](../../../../../plugins/tasks/src/engine/service.ts#L377) · [HTTP 用例](../../../../../plugins/tasks/test/persistence-http.test.ts#L321)
- **#8 身份、取消和可操作性。** 新行刷新与管理动作绑定被操作账号，选中账号和被操作账号可以不同。目录级请求在切换账号或卸载时取消，账号行请求独立按账号持有，关闭 Mail 或替换 Engine 时清理。管理仍复用修复、改名和删除影响预览。分栏提供指针捕获和键盘范围，窄屏用既有回退路径，Lead E2E 实测右键进入、修复取消回焦、键盘改名与删除、拖动、最小宽度及窄屏逐层回焦。菜单独立的 Escape、Tab 和触屏路径尚未在本轮实测。 [账号动作与清理](../../../../../plugins/mail/src/ui/MailModule.tsx#L203) · [目录请求清理](../../../../../plugins/mail/src/ui/MailModule.tsx#L820) · [菜单焦点](../../../../../plugins/mail/src/ui/MailAccountRow.tsx#L142) · [分隔条](../../../../../plugins/mail/src/ui/MailPaneSeparator.tsx#L30)

## 已核对的证据

| 项目 | 结果 | 证据 |
| --- | --- | --- |
| 确认原型 | 分别复算 #6 的 `e607f23a…` 和 #8 的 `9d0b1509…`，均匹配 2026-11-21 确认记录。原型提供交互基线。 | [#6 确认](../../../../dev/archive/changes/implemented/feature_2026-11-19-issue-6-unified-tools-web/prototype-review.md) · [#8 确认](../../../../dev/archive/changes/implemented/feature_2026-11-19-issue-8-mail-module/prototype-review.md) |
| 构建和类型 | Lead desktop 定向 tsc `t1dj` 通过。早期独立 Web 构建 `t1dk` 通过。初次 Electron 配置失败后，`t1dp` 在 editorRoot 修订版构建 CLI、main、preload、renderer 和 Web，日志有最终 build-info。四个受影响 spec 的定向 tsc `t1ds` 由 Lead 确认为通过。 | [重跑构建日志](../../../../../temp/closeout-release/mail-web-build-recheck.log) · [定向配置](../../../../../temp/closeout-release/tsconfig-ui.json) · [定向类型日志](../../../../../temp/closeout-release/ui-spec-types.log) |
| Mail 源码构建 E2E | `t1dq` 三项通过，切账号取消 Graph、关闭 Mail 标签取消 Graph、双账号与分栏窄屏。JSON 为 3 expected、0 unexpected、0 flaky。Graph 两项走原有「同步目录」按钮。 | [Mail Playwright JSON](../../../../../temp/closeout-release/mail-ui/result.json) · [Mail 日志](../../../../../temp/closeout-release/mail-ui.log) |
| Web 源码构建 E2E | `t1dr` 一项通过，已核对独立 HTML、根路径与深链、资源 MIME、两邀请三浏览器、撤销、编辑保存和重开，浏览器检查无 preload。JSON 为 1 expected、0 unexpected、0 flaky。 | [Web Playwright JSON](../../../../../temp/closeout-release/web-ui/result.json) · [用例](../../../../../tests/e2e/workflows/web-share.spec.ts#L138) |
| 定向单测及探针 | 实施报告记录 Tasks 定向 1 项与 Mail 单文件 1 项通过。我独立执行上述两项 Mail 函数级探针、原型指纹和 `git diff --check`。 | [Web/评论实施报告](../t1d8/report01.md) · [Mail 实施报告](../t1d5/report02.md) |

## 关闭条件与未运行验证

- **#6** 在最终候选安装包验证 Web 根路径、深链、邀请和撤销，运行 Gateway 的 `200 → 503 → 200` 缺入口复原以及 CLI-only、HTTP MCP-only 两个外部 Agent 评论和原会话流程。Linux 发布需有实际 Go/PTY 构建与安装包证据。源码构建的通过记录适用于已运行的软件包前置步骤。 [候选 Web](../../../../../tests/e2e/workflows/web-share.spec.ts#L80) · [Gateway 缺入口](../../../../../tests/e2e/workflows/gateway-package-boundaries.spec.ts#L12) · [外部 Agent](../../../../../tests/e2e/workflows/external-agent-desktop.spec.ts#L96)
- **#8** 修复三个已定位的缺口并补上相应定向验证。在最终版本复核真实工作台两账号及不同入口、窄屏与焦点。现有通过记录覆盖合成邮箱，线上提供商和实际设备的范围沿用既有发布验收。
- 本审查未启动 E2E、打包或全仓类型检查，也未改动业务文件。以上真实运行证据均来自 Lead，单测通过来自实施者报告。

### Modern Web Guidance

我检索并查阅了菜单键盘与焦点、可访问性、响应式布局和指针拖动指南，用于核对现有实现及标出未实测的路径。本轮只读审查。

## Lead 收取与验收
worker 因 .agents 在其沙箱内只读，将完整报告交于 /tmp/huhu-t1dm-report01-j8ekrs16.md；Lead 读取后收取到本路径，未代替 worker 接受权限提示。接受独立审查交付，#8 三项转实施返工，#6 保留最终包验证条件。
