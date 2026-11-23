# #7 H4.3 · SSH 跨窗口控制交接的终端桥

- 共享根 /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux，Core wta-ubuntu，Lead t3p，执行终端 t4x
- 任务 t4x/task08.md，报告 t4x/report08.md
- 工作树 /home/wta/projects/huhu/temp/issue-worktrees/agent-linux，分支 impl/huhu-issues-3-10-h7-window-control，基线 84d19cb8cb180c2daa28ad2d5964f2729e196d49

按 dev-build、t5h/report04.md 和 H4.3，完成现有 SSH 终端桥上同 shell 的跨工作台窗口输入控制交接。只写 plugins/ssh/src/engine/terminal-bridge.ts、必要的模块内纯类型/消息文件及 plugins/ssh/test/terminal-runtime.test.ts。Engine 宿主识别、预加载、桌面窗口、渲染器 UI、公共 registry 入口由 Lead 写。保持一个 shell、一个控制 socket、其余为观察，对端读取从同一原 attach 的回放开始。禁止为交接重开 SSH 或远端 shell。

为 View 扩充一个由宿主可信传入的可选标记（例如 desktopHandoff?: boolean），仅显示该标记的桌面 SSH 视图（排除 ssh-local-* 和公开工具 shell）可使用新增文本控制消息。浏览器 query 和请求体不授予标记。建议三步：源视图发 prepare，桥返回有界的短期随机 ticket；目标同一 shell 以 observe 附着并发 claim，保持只读且只有一个候选；源收到目标附着后发 commit，以 source 当前控制权与 prepare 观察一致为前置，由桥在同一事件 turn 转移控制或保留观察。源端确认后可解绑，源输/resize 丢弃，目的端当前 cols/rows 接管。目标关闭、取消、过期、重复或迟到消息、另一个 shell、Web 视图、关闭源和第三个排队者都守住所有权。回告各消息的判别字段与结果，含失败和角色确认；保持与原本缩放、关闭、回放/背压兼容。成功 ACK 可在同一原 socket 安全重交，确保不会再次转移。超时无需开启后台进程，使用短期有界内存和明确清理。对观察者发起的换窗，目标保持 observe 且不进入排队，原控制者保持原地。

验证只运行 pnpm exec vitest run plugins/ssh/test/terminal-runtime.test.ts 及本包类型检查。采用已有内存 socket 夹具，核对具体 write/resize 调用次数、实际角色确认和可预期的回退。没有浏览器、打包、E2E 或远端写入。报告标明完整消息合同、路径、真实测试结果、待 Lead 接线处。
