# #7 H2.2 / #9 P5.1 · Windows SSH 主机独立认证复核

- 任务 [t13x/task03.md](./task03.md)
- 执行结果 **done**。指定的真实 Engine 夹具首轮串行通过，1 个文件、3 项测试，Vitest 退出 0。
- 候选 `657428876632f9a420f321a7b1c85a559dc0633a`，直接父提交 `5bbc27240f3a249f5e1871d7da2cc8bb1fce5542`。
- 环境为 Windows x64、Node.js 24.21.0、Vitest 3.2.7。既有桌面 `EngineClient` 经回环 HTTP 按 hostId 调用真实 Engine，SSH 服务使用当前候选的 `ssh2` 夹具并且仅监听 `127.0.0.1`。主机、身份文件和凭据均由夹具生成。

## 实测

| 项目 | 观察结果 |
| --- | --- |
| 模块独立认证 | SSH 自有密码和受密码保护的私钥在 Safe 未初始化、锁定及停用时均可按 hostId 连接。使用一个合成的本机身份文件和受保护口令连接也成功。候选 Engine 向 SSH 插件传入现有 Windows 本机凭据宿主，主机定义的凭据目标由主机名、端口和用户名确定。 |
| 首次信任和私钥口令 | 夹具经 `ssh.hostKeyPrompt` 处理首次主机信任。拒绝时返回 `SSH_DISCONNECTED`，服务端认证计数为 0。接纳首次信任后连接成功。错误口令和显式清空口令均返回 `SSH_AUTH_FAILED`，服务端没有收到新的认证请求。补回正确口令后可连接。 |
| 保存失败、版本冲突和换目标 | 注入受保护配置发布失败后返回 `INTERNAL`，列表仍显示原 revision，原密码可连接。两个编辑者持同一版提交时一项成功、一项 `VERSION_CONFLICT`，继续用旧版本替换也被拒绝。清空密码后连接失败，重新配置可恢复。端口改到另一回环服务后，状态为 `needs-reconfiguration`，新服务的连接计数为 0。显式配置新目标的密码后连接成功。 |
| 复制、删除和重开 | 副本获得独立 hostId，私钥与口令状态均为 `unconfigured`，连接返回 `SSH_AUTH_FAILED`。按版本删除副本后连接该 ID 得到 `NOT_FOUND`，源主机仍可连接。源 Vault 重开后保留主机 revision 与分组，列表覆盖标签、显式 keepalive 0 和省略 keepalive 的区别。 |
| ZIP 恢复 | ZIP 收录了主机定义。在同一本机应用目录下导入至新的 Vault 路径后，主机仍可列出，密码标为 `needs-reconfiguration`。尝试连接返回 `SSH_AUTH_FAILED`，现有回环服务的连接计数保持原值。恢复目录的字节扫描未发现合成密码，源 Vault 重开后仍可连接。 |
| 普通查询与管理授权 | 普通列表与能力目录未出现所检的合成秘密。列表未含合成私钥、口令或身份文件路径。夹具对源 Vault 与应用本机目录的文件扫描未检出相关标记，共享幂等日志未记录 `ssh.hosts.configure`。实测 desktop 可配置，CLI、MCP 得到 `CAPABILITY_NOT_EXPOSED`，Web 经 Dispatcher 得到 `PERMISSION_DENIED`。源码中 configure、copy 和 remove 均使用桌面专用管理描述符。 |

## 复跑证据与范围

- Git 归档和合成 Vault 均放在 Windows 系统临时目录的新建子目录中。应用锁与本机现有依赖锁匹配，102 个工作区链接指向归档源码，297 个第三方依赖链接指向已安装包。测试前后归档锁的 Git 对象均为 `03c864cafb3cc7a0d3b096f55d12bc98f4cf203b`。
- 密码及备份、替换发布失败及版本冲突、私钥与身份文件三个夹具分别用时 1.279 秒、0.666 秒、3.929 秒。整次 Vitest 运行用时 17.27 秒。保留了候选的原断言和超时。
- 既有清理钩子删除测试主机、关闭 Engine 和回环 SSH 服务。退出后合成 Vault 根计数为 0，临时目录已回读为空并清除归档，验证窗格 `t14r` 已关闭并移除。候选差异的 `git diff --check` 通过。本轮未创建 worktree，未写业务源码、锁文件或远端。
- 范围限于现有 Windows Engine 夹具及合成回环验证。界面、代理与跳板、实际 SSH 主机和真实账号属于本轮范围之外。

归档根目录下的复跑命令如下。运行进程的 `TMP` 和 `TEMP` 指向单独创建的临时子目录。

```powershell
node node_modules/vitest/vitest.mjs run plugins/ssh/test/host-auth.engine.test.ts --no-file-parallelism --maxWorkers=1 --reporter=verbose
```

依据 [H2.2 验收](../../../../dev/changes/2026-11-19-issue-7-ssh-module/tasks/H2.2-host-record.md)、[P5.1 验收](../../../../dev/archive/changes/implemented/feature_2026-11-19-issue-9-safe-accounts/tasks/P5.1-ssh-host-auth.md) 和 [实施报告](../t12p/report04.md)。

## Lead 验收
