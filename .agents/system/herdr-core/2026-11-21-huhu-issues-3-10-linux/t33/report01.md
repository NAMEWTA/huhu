# 任务报告

- 共享根 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux
- terminal_address — `t3y`，任务目录为 `t33`
- task — `task01.md`
- 任务文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t33/task01.md
- 报告文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t33/report01.md
- 执行结果 — done

## 结论

| 切片 | 基线分类 | 本轮结果 |
| --- | --- | --- |
| S2.3 阅读正文和原文 | 部分 | 沿用正文解析、折叠、标读和附件元数据。增加视口初载、对话原文、页内时间正序和返回最新。图片默认屏蔽，用户点击后只加载当前消息版本通过检查的 HTTPS 图片。回环和传输替身检查通过，渲染 E2E 待运行。 |
| S8.2 Web 草稿附件及 OAuth | 部分 | 基线已有桌面附件、Web OAuth 控件和 Engine 宿主回调。补浏览器文件选择、取消、一次性二进制上传和重开草稿的附件管理。验证 9 MiB 字节与哈希、句柄鉴权及 Web OAuth 回环。跨实体设备 LAN 待验证。 |
| P3.4 复制密码 | 缺失 | 对当前账号显式取值，桌面复用 preload，Web 用异步 Clipboard API。反馈保留遮罩，锁定和切换会取消在途读取。端上 E2E 已写，待运行。 |
| P10.1 普通管理及敏感读取 | 已完成 | 复验独立开放、多个入口、锁定、同键及撤权 3 项。保留已有能力和调用身份。 |
| P10.2 现行消费者切换 | 部分 | Git、SSH、Mail 分别通过 Safe 锁定后的真实回环认证。Agent 配置在 Safe 锁定后可读。旧 Agent/Automations 规则环境入口拒绝取用，生产扫描只见兼容识别和 Safe 自己的状态事件。Agent 受保护交互启动和 Automations 受保护运行是 Windows 路径，旧组合证据和剩余验收见 Safe 证据。 |

## 产物与改动

- 候选提交 `b039409e4a9b5f17698063aa1491434653bcded9`，父 `1c2f8089ac399c5660291b20f042318cc4abfe04`，工作树 `/home/wta/projects/huhu/temp/issue-worktrees/agent-linux`，分支 `impl/huhu-issues-3-10-mail-safe`。临时索引生成候选，业务与测试文件同候选一致，分支 HEAD 仍在父提交。
- 两份 Linux 证据在候选树的 `.agents/dev/changes/2026-11-19-issue-8-mail-module/evidence/S2.3-S8.2-linux.md` 及 `.agents/dev/archive/changes/implemented/feature_2026-11-19-issue-9-safe-accounts/evidence/P3.4-P10-linux.md`。工作树 `.agents` 是只读挂载，证据副本可从本任务目录读取。
- `plugins/mail` 复用草稿条件写、受管对象和 MIME 解析。图片加载仅取当前邮件包含的 URL，验证 DNS 后固定出站地址并限制静态图像媒体类型、大小与时间，回传 `data:`。受管附件取消覆盖断流、句柄撤销和发布对象后 CAS 提交前的回收。
- 单列宿主接线。`packages/kernel/src/server/web-share.ts` 增加 `POST /api/v1/mail/attachments/:handle`，沿用现有 Web 会话、Origin/Host 和转发头策略。`apps/engine/src/boot.ts` 向该端点提供 Mail 的上传服务和插件/Vault 状态检查。授权基于已通过能力入口登记的单次句柄。Web 只发送本机选择的文件字节，草稿中保存现有的受管引用。
- `plugins/safe/src/ui/PersonalWorkspace.tsx` 复用账号敏感读取以及会话代取消。桌面复制后 30 秒只清理仍匹配的剪贴板内容，普通 LAN HTTP 无能力时提示显式显示后手动复制。SSH 路径进行了只读源码核对和一个临时回环夹具测试。

## 验证

均以独立 `XDG_RUNTIME_DIR` 单文件执行。

| 验证文件 | 通过 | 观察 |
| --- | ---: | --- |
| `plugins/mail/test/remote-images.test.ts` | 2 | 允许媒体与大小，DNS、安全地址、跳转和无凭据出站，`t48` |
| `plugins/mail/test/messages-engine.test.ts` | 1 | 两账号、换代与批准消息版本，`t48` |
| `plugins/mail/test/web-draft-attachments.engine.test.ts` | 1 | 9 MiB、双 Vault、会话、取消、回收、重开、哈希，`t49` |
| `plugins/mail/test/draft-attachments-engine.test.ts` | 8 | 桌面变更、合并及备份边界，`t45` |
| `plugins/mail/test/oauth-engine.test.ts` | 2 | 回环 OAuth、Web 身份与 Safe 锁定后 Mail 同步，`t45` |
| `plugins/safe/test/external.engine.test.ts` | 3 | 同一合成条目的独立授权、同键与撤销，`t45` |
| `plugins/versioning/test/remote-auth.engine.test.ts` | 2 | 选择旧 Safe 迁移和真实 Git fetch/push 两例，`t48` |
| `apps/engine/test/module-credential-host.test.ts` | 1 | 选择 Agent 配置及归档用例，`t48` |
| `plugins/ssh/test/host-auth.engine.test.ts` | 1 | 选择 SSH 密码及 Safe 三种状态回环用例，`t4b` |
| `apps/engine/test/engine.test.ts` | 1 | 选择旧规则环境拒绝用例，`t4b` |

另验证 Mail 与 Safe 各自的 TypeScript 项目编译、工作树和候选 diff 检查。第一轮附件回归仍把 Web 移除为拒绝项，断言失败后没有释放旧测试的导出门闩而超时。更新了授权会话的回归期望并复跑，8 项全部通过。

### 未运行的验证

- `tests/e2e/workflows/mail.spec.ts`「窄屏 Web 工作台流式上传 9 MiB 邮件附件，重开草稿验证哈希并可取消」「邮件阅读按单封放行图片，原文和切换邮件保持默认屏蔽」。
- `tests/e2e/workflows/safe-tags.spec.ts`「保险箱只复制所选第三个账号，剪贴板拒绝有反馈且锁定拦截迟到复制」。
- `tests/e2e/shell.spec.ts`「Agent 受保护启动在 Safe 未初始化、锁定和停用时接入真实终端」及 `tests/e2e/workflows/acceptance.spec.ts`「终端规则在桌面配置和清除受保护环境，Safe 停用后仍可运行」。
- 第二台物理设备 LAN、真实外部图片服务器、同一版本安装包的五消费者联动。实施者任务规定由后续集成运行浏览器、Electron、整包和全量验证。邮箱验证仅用回环夹具。

## 阻碍与接续

实施范围内无剩余改动。P10.2 的 Linux 受保护启动与运行缺少受支持的生产路径，已有 Windows 验收用例及 Linux 识别和拒绝证据。报告结论以单模块回环、源码边界以及候选植入的两份证据为准。

## Lead 验收

待 Lead 验收。

Lead 验收（2026-11-22）：通过（含 Lead 返工）。候选 `b039409e` 合入集成 `cd0ea9c4`。Lead 返工：
- `72b0bad5`：三个新能力未进 Mail manifest，tool-exposure 目录断言失败；`mail.messages.loadRemoteImages` 按 #6 改为 `exposable: true`、默认关，去掉固定的工作台调用者限制，并补 CLI/HTTP MCP 矩阵；Web 上传句柄两项保持工作台专用传输步骤。
- `e9e6fcd9`：E2E 公共 `openApp().close()` 退出前清除页面路由。根因：用例遗留的 `page.route` 在 Playwright 关闭上下文时挂住退出 flush 的 Engine 调用（FocusPauseOnClose），桌面按 TB-14/15 保留窗口并弹原生对话框，用例 60s 超时。该问题自 `51d08635` 起存在，影响 session-flush B09/C06/A08 与 mail 图片用例。
- `82f0d188`：Web 写信“取消上传”按钮位于 `busy` 禁用的 fieldset 内，上传期间无法取消（产品缺陷），移出 fieldset；safe-tags 复制用例在后门写入后锁定/解锁刷新列表并以当前会话锁定。
Lead 补跑：mail/safe/kernel/workbench/engine tsc、oxlint、oxfmt；vitest mail+safe+kernel+相关 engine/versioning/ssh 39 文件 365 过 3 跳；`pnpm build`；mail.spec 8/8、safe-tags 3/3；Agent 受保护启动与终端规则受保护环境 2 例仅 Windows，跳过。未运行：第二台物理设备 LAN、真实外部图片服务器、同版安装包五消费者联动。
