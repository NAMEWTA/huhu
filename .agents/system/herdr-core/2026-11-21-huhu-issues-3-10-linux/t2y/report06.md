# Task06 终稿

任务 t2y/task06.md，执行终端 t4d，Lead t3p。状态 done。候选基线 b25c6322，链尾 `264be309`。使用独立索引创建候选，工作树分支仍在基线。证据已随候选追加到 `G-ssh-exposure-linux.md`。

## 候选链

- `133dfc0b` 外部归档、自有 PTY 目录跟随、主机导入与四种转发模式，含回环测试。
- `72f99dd7` 追加候选证据和 CLI／HTTP MCP E2E spec。
- `264be309` 在归档探测和处理时禁用远端 Python 字节码缓存写入。

## 能力交付

| 能力 | 交付与限界 |
| --- | --- |
| `ssh.archives.support`、`ssh.archives.run` | 可选开放，默认关闭。支持探测为 execute/high，每条 SSH 连接至多一次并发合并的远端探测并缓存结果。归档从自有远端文件会话取得连接，校验 SFTP 属性修订、远端目录、输入及输出名称、大小上限和压缩覆盖确认。压缩调用远端 tar 或 zip，查看、解压及暂存均在远端。解压仅发布到新目录。归档依赖远端 Python 3、Linux 原子目录发布和相应 tar/gzip 或 zip 工具。Windows 原生 ZIP 由工作台调用。 |
| `ssh.fileSessions.directory`、`ssh.fileSessions.prepareDirectory`、`ssh.fileSessions.commitDirectory` | 可选开放，默认关闭。打开外部文件会话时可指定同主体、同连接代的 `shellId`。目录浏览经绑定 SFTP，提交需要原提示符修订、空闲输入和五秒内有效的一次性令牌。相同提交意图返回原结果，只向 PTY 输入一次。 |
| `ssh.hosts.import.confirm` | 可选开放，默认关闭。预览绑定主体、原始内容摘要、可见路由和目录修订。确认发布新主机，沿用稳定意图键。匹配的可见现有分组得到分配，隐藏、未知或歧义路径落到未分组。工作台须另行授予新主机的外部使用权限。 |
| 外部转发 | 本机固定目标、SOCKS5、HTTP CONNECT 监听由 Engine 分配 IPv4 回环端口。远端监听使用工作台保存的端口和目标，等到 `tcpip-forward` 成功回执后报告运行。回执只确认服务端接受请求，结果保留 `server-policy-unknown`。撤销主机释放监听，取消远端监听回执失败时关闭本主体的原连接以释放监听。 |

六个新开放工具均已有 SSH manifest 条目。Lead 的 `bed4beed` 包含 task05 的独立清单修正。E2E 也以严格的 `{ shellId }` 调用接口。工作台 UI 目录在本任务之外。

## 验证

- Node 24.21.0、pnpm 12.10.1。SSH 单包 `pnpm exec tsc --noEmit -p plugins/ssh` 通过。
- `plugins/ssh/test/public-resources.engine.test.ts` 46/46 通过，日志 `/tmp/huhu-t4d-task06-public-resources.log`。CLI 与 HTTP MCP 覆盖授权开关、跨主体、跨连接、一次性提交和过期、原修订及大小、归档覆写确认、导入分组、新主机未授权、三种本机监听及远端拒绝、成功回执与撤权。
- `plugins/ssh/test/shell-directory.test.ts` 2/2 通过，日志 `/tmp/huhu-t4d-task06-shell-directory.log`。链尾的 CLI／HTTP MCP 归档定向双测通过，日志 `/tmp/huhu-t4d-task06-archive-final.log`。回环夹具实际生成 TAR、TGZ 和 ZIP，读取和还原 TGZ 文件。真实服务器绑定策略、非 Linux 外部归档环境及 Windows 原生后端不在回环验证范围内。
- `tests/e2e/ssh/owned.spec.ts` 的 `CLI isolates SSH terminals, files, imports and forwarded listeners` 与 `HTTP MCP isolates SSH terminals, files, imports and forwarded listeners` 按职责仅编写，留待 Lead 串行验证。

Lead 验收（2026-11-22）：通过。链尾 `264be309` 合入集成 `5d043100`（owned.spec 冲突取实施者版本并保留 Lead 的主机选择），Lead 补 `cc671b5f`（domain-exposure 期望列表补 6 个新工具）。Lead 补跑：ssh/engine tsc、oxlint、oxfmt；vitest ssh+catalog+tool-access 16 文件 127/127；`pnpm build`；tests/e2e/ssh 17/17。SSH 81 项中仅 `ssh.fileSessions.localList`（Engine 本机文件系统）保持工作台专用。
