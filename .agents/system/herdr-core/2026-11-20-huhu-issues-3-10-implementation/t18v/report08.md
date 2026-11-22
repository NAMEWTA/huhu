# task08.md · #7 H7 目录批量传输、ZIP 与发布复核

- 共享根 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation
- terminal_address — t18v
- task — task08.md
- 任务文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t18v/task08.md
- 报告文件 — D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t18v/report08.md
- 执行结果 — done
- 工作树 — D:/Document/code/huhu/temp/issue-worktrees/task-cutover
- 分支 — `impl/huhu-issues-3-10-ssh-transfers`
- 基线 — `0fe4f1bbce31aae33c179542ec8c981a133f59bb`

## 结论

H7.1–3 已交付。绑定双栏支持多选、拖放与递归目录传输。父任务汇总子项结果，同名目录、子目录及同名文件分别确认。Windows ZIP 处理可在本机和可用的绑定 SFTP 目录执行。传输中心显示各端能力及原因。

已修正独立复核的两个 P2。最终摘要读取期间接受的第二次暂停会阻止发布，直到再次继续。发布回包丢失后，使用已冻结的暂存摘要和原目标快照在原连接重新回读。能确认已提交时清理已核实的备份，发现备份字节变化时保留实物及路径。无法确认时保存原任务的待核实状态及完整路径，重复重查沿用原端点。 [独立发现](<D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t187/report12.md>)

## 产物与改动

| 提交 | 实际交付 | 证据 |
| --- | --- | --- |
| `5e3e59de637b34a3c7a92b598a15a8e774ba8021` | 复用 H7 单文件队列及文件会话，增加目录扫描、父子结果、逐项冲突、部分完成、双栏多选和拖放。沿用全局 2 个并发及 32 个待办。扫描拒绝本机 junction 和远端符号链接。 | [批量验收](<D:/Document/code/huhu/temp/issue-worktrees/task-cutover/.agents/dev/changes/2026-11-19-issue-7-ssh-module/evidence/H7-batch-windows.md>) |
| `731b50cca6abdcc9e5846f2ba6267153f262a999` | 使用现有系统选取入口、本机 Windows .NET ZIP 和绑定 SFTP 通道。显示压缩／解压可用性、ZIP SHA-256、成员清单及成员 SHA-256。按成员总量、解压体积和路径校验限制处理。 | [ZIP 验收](<D:/Document/code/huhu/temp/issue-worktrees/task-cutover/.agents/dev/changes/2026-11-19-issue-7-ssh-module/evidence/H7-archive-windows.md>) |
| `895ae975ae0250870a334ef5e5737640cebda189` | 按暂停版本重新核对最终目标。发布回执不明确时启动同源回读，原任务保留对账结果及现场路径，专用重查操作不会重新入传输队列。 | [发布复验](<D:/Document/code/huhu/temp/issue-worktrees/task-cutover/.agents/dev/changes/2026-11-19-issue-7-ssh-module/evidence/H7-publication-windows.md>) |

复用了 `FileSessions`、`SshManager.withSftp`、现有 SFTP 流与传输队列，参考了 Motty 固定版本的目录工作队列与发布处理。改动限于 SSH 插件、专属测试和 #7 证据。 [既有复用记录](<D:/Document/code/huhu/temp/issue-worktrees/task-cutover/.agents/dev/changes/2026-11-19-issue-7-ssh-module/evidence/H7-transfer-reuse.md>)

## 验证

| 验收要求 | 实际检查与结果 | 证据 |
| --- | --- | --- |
| 绑定目录、批量冲突、拖放和跨端 | Windows Workbench 用原生目录选择 IPC、多选、同名父目录合并、子目录及文件拒绝、远端向本机拖放。读取本机及两个端点字节，确认既有文件保留、链接未遍历、父任务显示部分完成。 | [Workbench 日志](<C:/Users/cdewta/AppData/Local/Temp/huhu-t18v-task08-e14bb12d/workbench.log>) |
| ZIP 支持与失败路径 | 本机和支持 SFTP 的远端均验证 ZIP 压缩、列表及解压，核对含中文成员的字节、摘要和时间戳。损坏包及重名解压失败保留原件。拒绝 SFTP 的回环端点只显示本机 ZIP 可用及远端不可用原因。 | [ZIP 验收](<D:/Document/code/huhu/temp/issue-worktrees/task-cutover/.agents/dev/changes/2026-11-19-issue-7-ssh-module/evidence/H7-archive-windows.md>) |
| 两个 P2 | 按独立探针的读门和丢回包时序复跑。第二次继续前目标保持旧字节。原连接 ID 一致，远端实际发布一次。可回读时确认新目标，无法读取时保留路径，重查后核验；同长度但内容改变的备份保留。Workbench 点击重查并核对实际 SFTP 副作用。 | [SSH 日志](<C:/Users/cdewta/AppData/Local/Temp/huhu-t18v-task08-e14bb12d/ssh-suite.log>) · [Workbench 日志](<C:/Users/cdewta/AppData/Local/Temp/huhu-t18v-task08-e14bb12d/workbench.log>) |
| 固定版本回归 | Windows Electron Workbench 9 项通过。SSH Vitest 62 项通过，其中发布验证 4 项。插件 TypeScript、SSH 与专属用例 Oxlint、改动样式 Stylelint、仓库 CSS 检查及 Git 差异检查通过。 | [桌面构建](<C:/Users/cdewta/AppData/Local/Temp/huhu-t18v-task08-e14bb12d/desktop-build.log>) · [Workbench](<C:/Users/cdewta/AppData/Local/Temp/huhu-t18v-task08-e14bb12d/workbench.log>) · [SSH](<C:/Users/cdewta/AppData/Local/Temp/huhu-t18v-task08-e14bb12d/ssh-suite.log>) · [TypeScript](<C:/Users/cdewta/AppData/Local/Temp/huhu-t18v-task08-e14bb12d/ssh-typecheck.log>) |

固定提交首次跑 SSH 全套时，既有主机密钥测试在解析临时生成的公钥时失败，四个发布用例均通过。工作树代码未变，复跑全套 62 项全部通过。 [首次日志](<C:/Users/cdewta/AppData/Local/Temp/huhu-t18v-task08-e14bb12d/ssh-suite-first.log>)

使用 Windows、隔离临时 Vault 和本机回环 SSH 夹具。工作树干净，10 个临时依赖 junction 已清理。本次未写入其他工作树、根锁或远端。

## 阻碍与接续

本切片无验收阻碍。本机系统选择器支持单文件或目录，批量拖放在绑定双栏内使用；系统外部拖入缺少可信路径。归档后端当前支持 ZIP，压缩与解压各限 16 MiB，最多 128 项，TAR／TGZ／7z 显示不可用原因。提交待核实回执沿用当前 Engine 生命周期的传输队列，无法回读原连接时保留实物及已记录路径。H6.2 剩余的文件动作、属性和文件特权按任务约定留给独立提交，H6.4 与转发另派。

## Lead 验收

由 Lead 追加。
