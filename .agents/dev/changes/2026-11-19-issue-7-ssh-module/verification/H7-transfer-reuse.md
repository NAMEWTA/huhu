# H7 传输复用与验收边界

- Engine 继续从 H6 的 `FileSessions` 取得原始连接身份，通过 `SshManager.withSftp` 借用其连接及独立 SFTP 通道。沿用 SSH 插件内部能力、桌面授权和 Vault 关闭生命周期。
- 已有 `sftp.ts` 提供远端路径规范化、SFTP 读写流、文件大小上限、错误映射及同目录暂存。保留旧单文件入口，传输中心使用相同的 SFTP 协议和同目录发布，在任务所有者中加上快照、确认、校验和终态。
- `FilesPanel` 保留原来的文件入口、原生上传和保存选取。独立文件视图提供传输中心和原来源入口。
- 对照本机 Motty `main@2daa9db582e16edf60a60b7ada26f47f808f973c` 的 `internal/sftpclient/worker.go`。参考 `enqueueTransfer`、`schedule`、`Pause`、`Resume` 与 `remoteCopy` 的任务所有权和双端流，结合 `write_protocol_test.go` 验证对应的保全语义。沿用 Huhu 自己的 Engine 和界面。
- 原型指纹为 `0a890ec3a9f26bbedc304f7b61e9cb41975d8b48df4ca2a96a33ee05fb473d2b`。对照 `fileView`、`conflictDialog`、`startTransfer`。真实验收分别核对稳定任务、原会话、覆盖确认、源和目标的最终字节、失败时的原件与暂存。

## 第一条真实路径

Windows Electron Workbench 在本机临时 Vault 与回环 SSH 之间执行实际上传和下载。拒绝覆盖保留原目标，确认覆盖后逐字节核对远端，切回工作区再打开传输中心仍是原任务。等待确认时目标被修改，旧确认返回失败并保留新内容。返回来源保留文件会话 ID，清历史后本机和远端文件仍在。

复跑 `playwright test tests/e2e/workflows/ssh-workspaces.spec.ts --workers=1 -g H7.1`，1 项通过。SSH Vitest 58 项通过。
