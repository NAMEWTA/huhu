# #7 H3.1 首次与变化指纹的连接反馈

- 共享根 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation`
- 终端地址 — `t179`
- 独立工区 — `D:/Document/code/huhu/temp/issue-worktrees/safe-personal`
- 分支 — `impl/huhu-issues-3-10-ssh-confirmed-ui`
- 基线 — `ff3221aa9a7b6be3813cdfd5ae622521e8ab1c22`
- 报告 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t179/report03.md`

按 H3.1、spec、design 和已确认原型，审阅现有连接 manager、Known Hosts 和工作台。优先闭合首次指纹的可见归属、拒绝和跨离开重进的待答恢复，以及变化指纹在准确连接／hop 阻断、拒绝旧回答和从独立已知主机入口核对的行为。复用当前 trust API 和共享 Dialog；只有缺少真实必要契约才在插件内做最小调整。用本机回环的项目既有正常 SSH 测试夹具验证客户端连接反馈，禁止连接网络上的实际主机或变更真实用户配置。可写 plugins/ssh、定向 tests/e2e/ssh 与对应 H3.1 证据。先执行现代 Web 指南 search 和 retrieve。固定 pnpm Windows，保持根锁和公共装配原样。不能实际完成的验收项在报告精确说明。

实施按 dev-build，证据按 dev-verify。提交自己的狭义改动并用文件协议发布 report03.md。不启动其他 agent，请交由 Lead 整合。
