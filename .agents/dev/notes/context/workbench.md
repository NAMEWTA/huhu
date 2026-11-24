# Huhu 工作台（总体）

初版架构核对于 2026-11-13（`8283c5c`）。桌面与 Web 入口、首页看板、模块凭据和 Graph 通知于 2026-11-23 按 `fc43ceef` 源码核对。

## 这部分负责什么

Huhu 是以本地 Vault（Markdown 为唯一事实来源）为根的桌面工作台：笔记、任务、档案、收件箱、保险箱、SSH、Agent CLI、自动化、版本与同步，外加 CLI 和 MCP 入口。0.0.1 的完整规格、决定和实施记录归档在
[`feature_2026-11-09-huhu-workbench-definition`](../../archive/changes/implemented/feature_2026-11-09-huhu-workbench-definition/README.md)；
其中 `decisions.md` 是 D-01…D-43 的完整台账（理由与否决做法），下面只列仍会约束后续开发、且容易踩错的部分。

## 从哪里读代码

| 问题 | 入口 | 需要知道的约束 |
| --- | --- | --- |
| 业务调用怎么进来 | [Dispatcher](../../../../packages/kernel/src/dispatcher.ts)、[浏览器共享](../../../../packages/kernel/src/server/web-share.ts)、[桌面入口](../../../../apps/desktop/src/renderer/main.tsx)、[浏览器入口](../../../../apps/desktop/src/web/main.tsx) | 业务走 Engine 能力。桌面通过 `window.huhuHost` preload 调用宿主功能；浏览器入口使用 Web 宿主与已受理的共享会话。CLI/MCP 的工具开放、授权与撤销在引擎中落实。 |
| 插件怎么贡献界面、命令和首页卡片 | `packages/workbench/src/contributions.ts`，各 `plugins/*/src/ui/index.tsx` | `homeWidgets` 卡片 id 形如 `widget:<插件>:<卡片>`；内置卡片仍由首页渲染（D-37）。 |
| 列表为何不刷新 | `packages/workbench/src/engine-client/query.ts` 的 `ENTITY_CAPS` | 引擎发 `entity.changed`（kind）→ 失效哪些查询前缀由这里映射；新增实体种类必须同时发事件并登记，否则 5 秒 staleTime 内是旧数据 |
| 版本号 | 根 `package.json` + `scripts/sync-version.mjs --check` | 单一来源；release 工作流要求标签等于该版本，rc 后缀可用（D-32/D-35） |
| UI 样式与组件 | `packages/ui/src/styles/proto/`、`components.css`、`packages/ui/src/components` | 原型 CSS 原样复制，`components.css` 只补缺失类；Radix + 薄封装，Huhu 自有界面不用 Tailwind（D-31；知识库编辑器的 OK vendor 例外，Tailwind 只在 `.ok-root` 内，见 [知识库编辑器决定](../decisions/2026-11-15-knowledge-editor-ok.md)）；数据表一律 `DataTable`（D-39/D-43） |
| 全文索引 | `packages/vault/src/index/vault-index.ts` | `node:sqlite` FTS5 内存库（D-34）；“清除搜索索引”只清 FTS（D-41） |
| 状态目录 | `Vault.stateDir` | 通常 `<vault>/.huhu`；只读且不可写时在系统临时目录。插件状态路径一律用 `vault.stateDir`，不要手拼 `<root>/.huhu` |

## 后续修改必须知道的事实

- **被取代的决定**：D-07“不用 SQLite”被 D-34 取代（内存常驻要求 ≤ 600 MiB，Orama 做不到）；D-17 里的 Tailwind/shadcn 被 D-31 取代；D-06 里的 `health` 插件被 D-40 取消（健康检查在 kernel `capabilities/health.ts`，界面在外壳 `packages/workbench/src/health`）；“首版 1.0.0”被 D-32 取代为 0.0.1。知识库编辑器：D-08 / D-09 / D-31 在编辑器与样式上的结论被 [2026-11-15 决定](../decisions/2026-11-15-knowledge-editor-ok.md) 取代。读 `decisions.md` 时先看这些后继。
- **有意不做**：多窗口/“在新窗口打开 Vault”（D-36，单实例锁 + 一 Vault 一 Engine）；应用级数据库与跨会话最近 Vault 列表（D-26）；签名/公证/自动更新（D-25）；多语言（D-28）。
- **写入**：单 Vault 单写者锁；单文件原子写；多文件操作走 `.huhu/operations/` 日志，数据页“未完成操作”读 `vault.pendingOperations`，关闭/切换 Vault 前有未完成操作必须先备份。
- **测试位置**：单元测试在各包 `test/`；e2e 在 `tests/e2e`（`acceptance.spec.ts` 对应规格 ACC-*）；CI 为 `.github/workflows/ci.yml`（windows-2022 / macos-15 / ubuntu-22.04），发布为 `release.yml`（草稿预发布）。

## 独立 Web 构建

2026-11-23 收尾补齐独立浏览器入口。`apps/desktop` 的 `build:web` 用独立 Vite 配置产出 `out/web`；桌面 `build` 同时构建两端，Engine 从 `out/web` 提供公开静态资源和深链。两端共享 `WorkbenchApp`，浏览器通过邀请与同源 bootstrap 连接，桌面通过 preload 取得 Engine。空 `plugins/mcp` 包已删除，MCP 继续由 kernel 的统一能力网关承接。源码构建和桌面/浏览器联验已通过，最终预览安装包尚待验收。[共享工作台](../../../../apps/desktop/src/renderer/workbench.tsx) · [Web 配置](../../../../apps/desktop/vite.config.ts) · [Engine 宿主](../../../../apps/desktop/src/main/engine-supervisor.ts)

共享构建选项接受调用者显式传入的编辑器目录。electron-vite 会打包配置模块，不能假定被内联 helper 的 `import.meta.dirname` 仍是原文件目录；两个构建入口分别验证，单独 Web 成功不足以证明 Electron 配置可用。[构建选项](../../../../apps/desktop/scripts/workbench-vite-options.ts)

## 看板与关窗

桌面和 Web 读取同一份 Vault 看板布局 `.huhu/home/widgets.json`。各工作台编辑各自的草稿，提交带基础 revision 和幂等键，收到保存回执后才接受新的布局。旧查询需在发布回执前结算，防止迟到的读取覆盖保存结果。桌面原生关窗结算看板和文档，保存失败或回执未确认时用户可保留窗口重试，也可按提示退出。 [看板能力](../../../../packages/kernel/src/capabilities/home-dashboard.ts) · [工作台看板](../../../../packages/workbench/src/home/useDashboard.ts) · [桌面退出](../../../../apps/desktop/src/main/index.ts)

2026-11-23 同条件四候选对照后采用 `react-grid-layout@2.3.0`：公开传感器、坐标与尺寸约束负责手势，Huhu 保留草稿、提交修订与碰撞让位。键盘和指针共用布局变换；宽窄视图保持同一实例节点。RGL 的格位没有变化时可能跳过活跃卡渲染，公开 onDrag/onResize 回调负责刷新像素反馈；放置预览复用同一 compactor 结果，不能只依赖上游滞后一拍的占位节点。Escape 与 touchcancel 先标记领域回滚，再通过正常 stop 清理手势监听，不能靠重挂载销毁卡片。源码鼠标、触摸取消、单次跨格停住与键盘回归通过。[生产画布](../../../../packages/workbench/src/home/DashboardGrid.tsx) · [选型及冻结夹具](../../archive/changes/implemented/feature_2026-11-19-issue-10-widget-dashboard/evidences/W01-01-grid-comparison.md)

## 模块凭据与邮件通知

- Safe 保存个人网站与应用账号，由主密码保护。Mail、Git HTTPS、Agent CLI、Automations 分别拥有运行凭据。Safe 锁定不阻断模块正常认证。桌面凭据宿主的本机密文在 Vault 之外，绑定本机 Vault 实例，通过系统凭据后端保护密钥，Linux 使用 Secret Service。Vault 包可恢复新版 Safe 密文和模块配置，模块认证须按所属模块重新配置。旧版从 Safe 引用运行凭据的约定已被替代，旧格式迁入不在本批范围。 [Safe 个人记录](../../../../plugins/safe/src/engine/personal.ts) · [桌面凭据宿主](../../../../apps/engine/src/module-credential-host.ts) · [模块装配](../../../../apps/engine/src/boot.ts)
- Graph 中旧邮件回到 Inbox 时更新列表，用户不会再次收到新信通知。新信通知需要非首扫增量中的到达证据和未读状态。观察身份、待确认与延后通知随同步状态保存，翻页、缓存窗口替换和重启仍可区分旧信回流与新信到达。独立补列可更新列表，通知判断仍以增量为准。 [Graph 增量](../../../../plugins/mail/src/engine/graph-mail.ts) · [邮件缓存与通知](../../../../plugins/mail/src/engine/message-cache.ts)
- Mail 账号行未读与联系人列表使用相同的邮件副本选择规则；可重建缓存损坏时保留账号定义和管理入口，不能把缓存故障显示成账号消失。账号栏和联系人栏宽度保存在 Vault settings 中，窄屏只改变显示投影。[副本选择](../../../../plugins/mail/src/engine/mail-copies.ts) · [账号摘要](../../../../plugins/mail/src/engine/message-cache.ts)
- 模块只注册一个导航离场守卫，Mail 在其中依次结算草稿和分栏偏好。分栏写入必须等待写权限查询，离场时排空包括等待期间新增的写入；失败保留原目标值供重试。成功回执取消同 Vault 的旧设置读取后再更新缓存，避免重挂载恢复旧宽度。2026-11-23 的延迟与失败桌面回归已验证这条约束，最终发布包仍单独验收。[保存协调](../../../../plugins/mail/src/ui/useMailPaneWidths.ts) · [模块守卫](../../../../plugins/mail/src/ui/MailModule.tsx) · 本次证据（本机原件 `temp/dev/feature_2026-11-23-closeout-preview-release/integration/legacy-7984bff4/mail-lifecycle.json`）

## 本轮交付的验证边界

应用与驱动固定在 `f6c4e0d5` 的 Linux AppImage 验过关窗、Web、看板、任务、Agent 历史和邮件认证恢复等路径。Graph 通知有真实 Engine 集成证据。真实线上 Gmail/Microsoft/IMAP/SMTP、第二台 LAN 设备、Windows/macOS 安装与系统凭据后端、完整 GNOME 窗口操作、真实 OS 输入法与读屏矩阵仍待实机核验。#7 SSH 暂停，#11 与 #12 超出本次收尾范围。

## 0.0.1-rc.2 留下的历史验证说明

- 三平台真机验证（Windows/macOS 实机，仅 CI 与 Linux 本机跑过）；8 小时 soak；KN-03 / SF-07 / AG-06 手动记录；VS-05 / VS-08 真实远端。
- 编辑输入延迟 p95 ≤ 16 ms：非空闲机器上 13.0–16.4 ms，负载下 43.9 ms；需在空闲机器上正式测一次。
- rc.2 草稿 Release 未发布；之后的两个提交（清除搜索索引等）未推送，不在 rc.2 中。

相关历史交付见[归档验收](../../archive/changes/implemented/feature_2026-11-19-huhu-issues-3-10/evidence.md)。
