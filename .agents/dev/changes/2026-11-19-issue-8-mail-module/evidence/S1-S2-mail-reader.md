# Mail 首封收件、正文与已读验证

Windows 回环验证对应 [S1a.2](../tasks/S1a.2-first-message.md)、[S2.3](../tasks/S2.3-read-message.md) 和 [S2.4](../tasks/S2.4-read-state.md)。确认稿和四个资源维持 `7d17ffa6` 所记录的 `9d0b1509bc58dd3146cce0dc9281ac443e6629c96cb9ec702e6490af5e201a65` 指纹。

| 路径 | 实际观测 |
| --- | --- |
| 首封收件 | 两个真实回环 IMAP 账号有相同 UID 42，各自得到摘要、原文及独立本地 ID。Edge 从已有账号同步并点击邮件主题进入阅读。 |
| 正文 | 首次正文 HTTP 请求按探针注入失败，正文区域显示可重试。重试正常打开 MIME HTML，支持长正文展开、纯文本、引用折叠及查看 RFC822 原文。附件只展示文件名与 MIME 类型。合成 HTML 中的外链图片、样式资源和框架发起 0 个外部请求，脚本未执行。切到原文仍为 0。 |
| 可见后标读 | 读取摘要、打开仍在视口之外的正文、读取失败时均为 0 次标读能力调用。正文滚入视口后，夹具观察到第一次 `UID STORE +FLAGS.SILENT (\Seen)`。该次返回 OK 但 `UID FETCH FLAGS` 不含 `\Seen`，界面显示「本机已读 · 待同步」。显式重试后远端 FLAGS 确认，状态变为「已读 · 服务器已确认」。 |
| 持久与换代 | 本机已读待同步存入现有缓存，刷新及 Engine 重开后可查。两个不同账号的回环请求各自独立。UIDVALIDITY 变化后旧 ID 不会收到 STORE，旧正文返回待刷新，新记录以独立消息 ID 出现。只读 Vault 的标读和同步被拒绝，原文可读。 |

[阅读截图](S1-workbench/mail-reader-1440.png) · [复跑步骤和浏览器探针](S1-workbench.md#重跑) · [Engine 回环测试](../../../../../plugins/mail/test/messages-engine.test.ts)

本轮验证保留每目录最新一封的 S1a.2 缓存模型。邮箱 HTML 默认屏蔽远程资源。单封远程图片放行需要共享 Renderer 的资源策略接线，桌面外链当前可通过现有宿主复制地址。完整桌面安装包、实际 Web 会话及多封历史定位等待组合验收。
