# #7 H2.1 主机目录的数据与选择契约

- 共享根 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation
- topic — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/topic.md
- manifest — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/manifest.tsv
- terminal_address — t88
- 身份 — Windows Core wta / 346bd5608735e3fcb27f9d01f5c8008e / 0.1.21，HC_TERMINAL_ID=t88
- 当前任务 — task01.md
- 任务文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t88/task01.md
- 报告文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t88/report01.md
- Lead 收件 — 回告终稿绝对路径。
- 工作树 — D:/Document/code/huhu/temp/issue-worktrees/ssh，分支 impl/huhu-issues-3-10-ssh，基线 `65bd6eb`。

按 dev-build/dev-verify 读 #7 H2.1、规格 H02/H03 与设计，依据现有 HostStore、SSH registry、Vault 原子条件写和 Huhu 直接调用者，复用优先。实现 H2.1 可独立测试的后端目录投影和持久组织操作，按真实 hostId 区分同名账户，核对用户、标签、名称、地址检索，分组无环、选中稳定目标组、置顶/排序和同一 Vault 重开。搜索与目录结果不披露秘密版资料，也不连接主机。整体目录更新要保留不受影响的主机与分组，过期版本显式冲突。沿用已接入的 #6 授权与静态描述，现有 SSH 业务保持正常。产品右键、网格、拖动及反馈仍待原型确认，选区逻辑若可独立验证可作为纯领域函数。用真实 Engine HTTP、隔离测试 Vault、同名合成主机验证，零真实 SSH 连接。

仅写 SSH 插件自有 engine、manifest、私有 schema、测试及按需证据。公共导出、App/Engine 装配、根锁、#9 凭据和 Vault 包收集器由 Lead 持有；不篡改用户真实主机、凭据、远端服务，不新增工作树或自行派遣。只在 Windows，保留精确候选 SHA、验证证据及剩余体验边界。任务完成后关闭已完成且无后续用途的命令 pane。
