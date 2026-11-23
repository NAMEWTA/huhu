# Web 候选夹具修复
Lead t3p worker t12g，agent-linux。读 AGENTS/dev-build 与 temp/final-audit/t124-report01.md。仅修 tests/e2e/workflows/web-terminal-widgets.spec.ts 两项：
1 Web fixture 采用 Playwright fixture 独立 teardown 预算（复用 git-credentials-package.spec.ts 模式），主体超时也须逐项限时清理路由/浏览器/桌面，不让一个失败阻止后续清理。不得修改公共 candidate-desktop helper；需要接口变更报 Lead。
2 raw observer 负向输入/resize 必须在观察 socket 仍连接、无控制者新输入/重获尺寸主导权时验证实际 PTY 尺寸不变。复用 shell 自身受控轮询或 WINCH 观测，不用最后断开后 stty 的弱断言；保持同 session PID/Core 正控，核对完整尺寸及干净关闭码，定时/事件有上限、报告精确观察窗口。不增加产品能力，仅验收。
不修改产品、其他 spec，不提交、不重置、不派子代理、不运行任何测试/types/lint/build。此为测试任务无需modernweb查询；如查工具须不提权。不调用 hc send。报告 temp/final-audit/t12g-report01.md 列修改、未运行验证。
