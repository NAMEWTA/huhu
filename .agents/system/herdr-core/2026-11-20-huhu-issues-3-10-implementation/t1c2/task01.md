# task01 · #8 Mail 专用 AI 设置和用户主动选择（S7.1／S7.2）

实现者唯一工作树 D:/Document/code/huhu/temp/issue-worktrees/agent-lifecycle，分支 impl/huhu-issues-3-10-mail-ai，起点 1bac3348。只写 plugins/mail 及其单独证据。Engine/Kernel 装配和包/凭据通用契约由 Lead 负责；给出必须的接线。先读 #8 source §M-08/§5.3/S7.1/S7.2 和原型确认记录，所有原型、场景已由用户确认。必须先跑 zh-modern-web-guidance search/retrieve再确定客户端代码。

优先交 S7.1。复用 Huhu Mail 设置、ModuleCredentials 的版本与机器保护，避免把 Mail AI 定义用不兼容 schema 写到 Mail 账号的既有 owner 文件里；根据现有设计用 Mail 内部独立子用途/命名并说明。one-mail 仅作已确认行为参考，检出 d1be24d5bb83c2da7123b167f119d5abd169b0af，README AGPL-3.0-only，不能随意复制实现。复用标准 OpenAI-compatible chat/completions、已有 UI 组件和 fetch。默认关闭。接收预期修订并区分保留、替换、清空。远端 HTTPS + Key，明文 HTTP 只允许真实 loopback 地址且绝不携 Key。拒绝 URL 用户信息、跳转、超时或替代目的地，凭据不进日志/持久意图/HTTP 回执和包。公开设置只显示状态、目的地和模型。测试连接只发无邮件内容的合成 ping，失败时保留已保存配置和用户可修正草稿。隔离 Vault 后旧本机绑定不可用。涉及客户端 DOM 时按指南落实可访问状态。

若 S7.1 门禁已通过并提交，再做 S7.2。只有用户显式选择内容和确认已保存目的地后才允许向单一后端发送，未选、未启用、切 Vault 或取消不得发。返回纯文本/已有安全渲染。功能无自动发件或其他工具调用；用户显式采纳时走已有可编辑 Mail 草稿入口。提供准确范围，先交付可验证垂直切片。

测试限 Windows、实际 Engine/app 与本地隔离 HTTPS/HTTP 夹具或注入的协议等价测试，使用合成资料。无真实邮箱、外部模型、ubuntu26、Git 远端写入。待 Lead 合入的静态装配和 package 证据列清。及时提交各可验成果，报告 D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t1c2/report01.md。
