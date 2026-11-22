# #7 H6.2/H7.1–3 使用已有文件会话完成目录批量传输

- terminal_address `t18v`
- 工作树 `D:/Document/code/huhu/temp/issue-worktrees/task-cutover`
- 沿用分支 `impl/huhu-issues-3-10-ssh-transfers` 从 `0fe4f1bbce31aae33c179542ec8c981a133f59bb` 起
- 报告 `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t18v/report08.md`

接续 H7 真实单文件队列、暂停、续传及跨 SSH 端点。按确认原型补齐目录与批量选择/拖放；递归任务在当前绑定目录根安全展开，保留主任务/子结果、并发上限、同名目录逐项确认及部分失败反馈。优先复用已有队列和 Motty 对照，禁止跟随逃逸的符号链接或默默改写其他文件。按 H7.3 检查实际现有原生选取和档案格式能力，界面分别给出当端可用及原因，支持的压缩路径需有实际摘要/列表与失败测试。H6.2 缺失文件动作可作为后续独立提交处理，H6.4 与转发另派。

可写 SSH 和专属测试、#7 证据。UI 先 search/retrieve。只用 Windows、隔离 Vault 和两台本机回环 SSH fixture。不写其他工作树、根锁、真实 SSH 或远端。阶段结果及时提交，复验真实 Workbench 界面和 SFTP 字节。


## 独立回环复核补充

t187/report12.md 在同一组合测到了两项 H7 边界，请在目录任务稳定提交后修正，或先交独立补丁。最终目标重新计算摘要期间的第二次暂停应阻止最后发布。发布回包丢失且原 SSH 连接仍在线时，按本任务暂存校验结果和原目标摘要用同端点回读辨认真实提交，保留或安全清理可确证备份。无法核实的状态与备份位置需在任务回执里明确保存；重复点击重查不得按新文件重新发布。独立探针和夹具路径见 t187/report12.md，使用实际回环端点复跑。

