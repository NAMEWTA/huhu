# H7.3 ZIP Windows 验收

Windows Electron Workbench、临时 Vault、两台回环 SSH。执行 `playwright test tests/e2e/workflows/ssh-workspaces.spec.ts --workers=1 -g H7.3`，1 项通过。

- 从绑定的 SFTP 目录压缩含中文目录和文件名的树，核对远端 ZIP 文件签名、SHA-256、成员清单及文件摘要。解压后回读远端文件字节和时间戳。
- 已存在同名解压目录及损坏的 ZIP 各有失败反馈。原目标和源文件字节均保留。
- 本机 ZIP 压缩、列表及解压通过 Workbench 和本机 .NET 后端验证。测试通过原生路径选取 IPC 切换本机目录，系统对话框由 fixture 返回临时路径。
- 另一端点拒绝 SFTP 子通道时，界面保留可用的本机 ZIP 能力并显示远端原因。远端归档通过 SFTP 读写与本机 ZIP 后端协作，无需目标机安装工具。
- 支持 ZIP，入口给出 TAR、TGZ 和 7z 的不可用原因。压缩包和解压字节上限各为 16 MiB，最多 128 个成员。