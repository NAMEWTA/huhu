# #9 P2.1 与 P2.2 彩色标签和账号搜索

- 共享根 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation`
- 终端地址 — `t17j`
- 独立工区 — `D:/Document/code/huhu/temp/issue-worktrees/safe-accounts`
- 分支 — `impl/huhu-issues-3-10-safe-confirmed-ui`
- 基线 — `e2f84e9d44f61c14d3e42f4b5e2b2f83e9e8dcb6`
- 报告 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t17j/report02.md`

按 P2.1、P2.2、spec、design 和已确认原型，复用 Safe 的私有加密标签、私有查询、已有工作区、Field 和 Dialog。闭合新建/复用/编辑/变色/删除，条目选择标签，多标签交集与无标签，搜索命中定位具体账号。验证锁定清除旧筛选、取消和改名冲突保留关联、标签名/搜索私有字段不进明文索引、秘密词不被检索。可写 plugins/safe、Safe 专用的新测试文件 tests/e2e/workflows/safe-tags.spec.ts 及对应 P2 证据。先执行现代 Web 指南 search 和 retrieve。隔离 Vault，合成数据，固定 pnpm Windows，保持根锁、公共装配及其他 E2E 文件原样。报告精确区分已验证与未验证。

实施按 dev-build，证据按 dev-verify。提交自己的狭义改动并用文件协议发布 report02.md。不启动其他 agent，请交由 Lead 整合。
