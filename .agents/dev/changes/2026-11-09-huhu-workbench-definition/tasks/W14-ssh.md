# W14 SSH

## W14.1 主机配置与模块界面

- 目标：主机的新增/编辑/删除、模块侧栏、主机页概览（含带文字的连接路径图）。
- 依据：[ssh](../modules/ssh.md) §2；ACC-SH-04。
- 前置：W11.3、W02.3。
- 位置：`plugins/ssh/{huhu-plugin.json,src/engine/{hosts,capabilities}.ts,src/ui/{SshModule,HostList,HostOverview,HostEditor,RouteDiagram}.tsx}`。
- 复用：R-43。
- 实现要点：字段校验（主机名、端口、循环跳板）；凭据下拉列出允许 ssh 引用的保险箱条目；路径图节点显示名称、`user@host:port`、信任状态；删除主机时被作为跳板的提示。
- 异常：引用的保险箱条目已删除 → 编辑框显示失效。
- 测试：ACC-SH-04；组件测试。
- 完成：ACC-SH-04 通过。

## W14.2 连接、逐跳信任与认证

- 目标：直连与跳板链连接，每跳主机密钥确认，认证使用保险箱凭据或系统 agent。
- 依据：ssh §3 连接；ACC-SH-01、02、03、07。
- 前置：W14.1。
- 位置：`plugins/ssh/src/engine/{route,connection,host-keys/}`、`plugins/ssh/src/ui/HostKeyDialog.tsx`、`packages/testkit/src/fake-ssh-server/`。
- 复用：R-40、R-41。
- 实现要点：路由冻结与 `attemptId`；`forwardOut` 链；`hostVerifier` 异步等待决定（120 秒超时）；known_hosts 写入；认证方式；超时；连接状态事件；审计；断开逆序关闭。
- 异常：指纹变化立即拒绝且不发送凭据；迟到决定忽略；保险箱锁定提示解锁。
- 测试：fake ssh 服务器（两个实例模拟跳板）；ACC-SH-01、02、03、07。
- 完成：四个 ACC 通过。

## W14.3 Shell、Exec 与 SFTP

- 目标：多 shell 与并排、Exec 运行与中断、远程文件浏览与操作、主机审计页。
- 依据：ssh §2–3；ACC-SH-05、06、08。
- 前置：W14.2、W12.2。
- 位置：`plugins/ssh/src/engine/{shells,exec,sftp,audit}.ts`、`plugins/ssh/src/ui/{ShellsTab,ExecTab,FilesTab,AuditTab}.tsx`。
- 复用：R-42、R-39（TerminalView）。
- 实现要点：shell 流经 `/ws/terminal/ssh-<id>`；断开后旧 shell 标记结束；Exec 超时与 `signal('INT')`；上传临时文件后 rename、覆盖确认；下载经 `saveFile`；审计按月 ndjson。
- 异常：传输中断清理临时文件；SFTP 子系统不可用时文件页提示。
- 测试：ACC-SH-05、06、08。
- 完成：三个 ACC 通过。
