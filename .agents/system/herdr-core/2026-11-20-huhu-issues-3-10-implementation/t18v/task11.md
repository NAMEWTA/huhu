# #7 H10 SSH 模块设置与 Remote 监听语义
共享根 D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation
terminal_address t18v
task task11.md
report t18v/report11.md

基线 95b7352c，工作树 D:/Document/code/huhu/temp/issue-worktrees/task-cutover，分支 impl/huhu-issues-3-10-ssh-settings。源码与已确认原型按 H10.1–H10.3 排序。优先实现能真正改变 Shell、文件默认值、连接和工具的偏好，沿用 Motty 对应源码和 Huhu Settings 贡献；无法支持的字段给出真实可用状态。先完成已发的 H8 Remote 审查修正，记录收到服务端确认时的请求地址，明确实际绑定由服务器策略决定，实际 Local/SOCKS5/HTTP 保持端口证据。之后按切片提交。可写 plugins/ssh、测试与对应证据；公共 apps Engine/Renderer 仍由 Lead 装配，Lead 正在切换旧 SSH 测试调用。新页面测试加到统一 tests/e2e/ssh，不新建插件 Playwright 配置。HTML/CSS/客户端先做 MWG search/retrieve。Windows 当前本机回环合成，其他主机及登录无需访问。输出 report11.md。
