# W19 集成、性能与无障碍

## W19.1 跨模块工作流 E2E

- 目标：[product](../product.md) §3 的三个工作流在真实应用中完整跑通。
- 依据：product §3 W-A、W-B、W-C。
- 前置：W05–W18 全部完成。
- 位置：`tests/e2e/workflows/{delegate-to-agent,write-and-restore,remote-script}.spec.ts`。
- 复用：testkit（fake provider、fake SSH 服务器、本地 bare 仓库）。
- 实现要点：W-A：捕获 → 转任务（Agent）→ 立即运行规则 → fake provider 回执 ask → 回答 → 成功 → 勾选；断言文件、运行记录、Agent CLI 历史中出现该会话。W-B：写笔记、批注、MCP 客户端读取并捕获、恢复上一版、同步到 bare 仓库。W-C：保险箱存密码与 Token → SSH 连接 → 脚本规则运行读取 Token 环境变量 → 输出写入运行结果；全 Vault 搜索不到秘密明文。
- 异常：每个工作流中途关闭并重开应用一次，结果一致。
- 测试：上述三个 spec 在三平台 CI 运行。
- 完成：三平台通过。

## W19.2 状态与边界巡检

- 目标：所有模块的空/加载/错误/只读/插件停用状态符合规范。
- 依据：[design-system](../design-system.md) §4–5；各模块“界面”节。
- 前置：W19.1。
- 位置：`tests/e2e/states/*.spec.ts`。
- 复用：testkit `edge-vault`、只读 Vault 夹具。
- 实现要点：对每个模块：空 Vault、只读 Vault、对应插件停用、Engine 断开时截图并断言关键文案与 Banner 存在；1024×768 与 960×600 无页面级水平滚动；缩放 150%。
- 异常：无。
- 测试：如上。
- 完成：全部断言通过；截图在 PR 中供审阅。

## W19.3 性能测量与优化

- 目标：[quality](../quality.md) §3 每项指标测量并达标。
- 依据：quality §3。
- 前置：W19.1。
- 位置：`tests/perf/`、`packages/testkit/src/fixtures/scale-vault/generate.ts`。
- 复用：无。
- 实现要点：bench 与 E2E 计时脚本；结果写入 PR 描述（不进入 Change）；未达标项定位并优化（常见：索引分批让出事件循环、文件树虚拟化、React Query 选择器）。
- 异常：无。
- 测试：bench 在 CI Linux runner 每周运行一次（`schedule`）。
- 完成：全部指标达标；8 小时 soak 结果记录。

## W19.4 无障碍与键盘

- 目标：axe 无 serious/critical；全部功能可键盘完成。
- 依据：design-system §7。
- 前置：W19.2。
- 位置：`tests/e2e/a11y.spec.ts`。
- 复用：@axe-core/playwright。
- 实现要点：每个模块主页面与主要对话框跑 axe；键盘脚本走通：新建笔记、新建并勾选任务、编辑规则、启动终端、连接 SSH。
- 异常：无。
- 测试：如上。
- 完成：通过。
