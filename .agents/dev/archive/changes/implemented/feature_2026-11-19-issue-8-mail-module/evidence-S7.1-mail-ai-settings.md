# S7.1 Mail AI 设置 · Windows 合成验收

基线 `1bac3348`。规格见 [S7.1](tasks/S7.1-ai-settings.md) 和 [M-08 原型确认](prototype-review.md)。复用 Mail 工作区已有设置区、Engine 能力和 ModuleCredentials。核对了 one-mail `d1be24d5bb83c2da7123b167f119d5abd169b0af` 的行为与 AGPL-3.0-only 许可，代码由 Huhu 实现。

## 实测

| 入口 / 环境 | 用户动作及观察 |
| --- | --- |
| Windows x64、Node 24.21.0、真实 Engine loopback HTTP API、Windows Credential Manager；本机信任隔离测试证书 | 默认关闭。HTTPS 合成连接测试没有写配置。成功保存、替换、省略 Key 保留及重启读回均通过。401 与跳转返回可修复错误并保留原版本。旧修订、远端 HTTP、伪回环、URL 用户信息/查询/片段和回环携 Key 被拒。 |
| 同一 Engine、隔离 HTTP 夹具 | 输入 localhost 后保存展示最终回环 IP。HTTP 无 Authorization。拖住响应会超时，当前配置保留。HTTPS 共 6 次预期请求，HTTP 共 2 次，跳转地址收到 0 次。夹具观察到的验证请求使用固定合成 ping。 |
| 真 Vault 包导出并导入第二个文件夹 | 可移植定义只含模型、目的地、启用和绑定元数据。本机凭据使用独立 Mail AI 命名，与邮箱账号定义分文件。运行目录和包定义均未观察到两把合成 Key。新 Vault 读到设置后显示需重新配置 Key，使用旧绑定发起连接次数为 0。清除 HTTPS Key 时关闭邮件 AI，清除操作不向服务发送请求。 |
| Electron 44.9.1 / Chromium 152.0.7977.167、独立桌面 userData、回环 HTTP | 从邮件工作区展开设置，操作测试和保存，观察默认关闭和异步反馈。服务返回 500 后已保存模型及可编辑草稿同时保留。刷新后只展示已保存状态。夹具共 3 次合成 ping，无 Authorization。 |

运行命令为 `node_modules/.bin/vitest.cmd run plugins/mail/test/ai-settings-engine.test.ts`、进入 `apps/desktop` 后运行 `node_modules/.bin/electron-vite.cmd build`，以及在仓库根运行 `node_modules/.bin/playwright.cmd test -c plugins/mail/test/playwright.config.ts`。Engine 与 Electron 本轮分别通过 1 项。Mail TypeScript、格式和 lint 通过。

## 集成范围

设置写入和测试在 Engine 主机桌面完成，沿用 Mail 账号设置入口的本机凭据边界。已登录 Web 可查看公开设置。能力以 `idempotency: "handler"` 绕开通用持久意图和缓存。此分支使用现有动态能力注册，Lead 如需发布静态目录，在 Engine 的 Mail 描述清单追加 `Object.values(mail.mailAiCapabilityDescriptors)`，并向 `mail.apply` 末尾选项传入 `{ aiCatalogDeclared: true }`。整包夹具已跑，仍由 Lead 核对整合后的 Engine 包范围及安装产物。
