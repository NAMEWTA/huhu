# #7 H2.2 主机与模块自有认证的工作台入口

- 共享根 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation`
- 终端地址 — `t179`
- 工作目录 — `D:/Document/code/huhu/temp/issue-worktrees/safe-personal`
- 分支 — `impl/huhu-issues-3-10-ssh-confirmed-ui`
- 基线 — `3b837a7dcbe4cbee24284069f29f03fd0575fb61`
- 任务文件 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t179/task02.md`
- 报告文件 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t179/report02.md`

继续 H2.2-host-record.md 和 H2.3-host-references.md 的桌面入口。完整原型已确认。复用 ssh.hosts.configure/copy/remove、主机目录和现有 Dialog。用主机自身的、版本化的认证补丁替换界面新增/编辑路径中的 Safe 写入。覆盖密码、SSH Agent、粘贴密钥和本机身份文件的现有后端支持，根据业务状态显示可用性。编辑留空保留，明确清空有独立操作。使用真实工作台合成样例验证新建、编辑失败保留、独立认证、复制和先解除引用再删除。保持既有无远端依赖的导入流程。旧库数据不在测试中处理。H2.6 的未保存连接测试如果当前无能力，报告所需最小合同。

仅可写 plugins/ssh/src/ui、H2.2/H2.3 对应文档和 SSH 定向测试。其他工区、插件公共装配、根锁与认证契约由 Lead。再次按 zh-modern-web-guidance 搜索和获取本任务前端指南。验证使用固定 pnpm 和 Windows，不启动额外 agent、不连接外部主机。需要 pnpm 禁用自动校验用显式 --config.verify-deps-before-run=false，保持根锁原样。报告按文件协议发布。
