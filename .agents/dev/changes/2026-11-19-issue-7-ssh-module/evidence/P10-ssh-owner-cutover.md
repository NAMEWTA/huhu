# SSH 所有者凭据切换 Windows 证据

SSH 的拨号（直接、工作区、跳板和转发）统一经 `HostConfigurations.withAuthentication` 和模块凭据 lease。移除旧的 Safe 服务消费、旧写入／删除能力和插件依赖。旧目录仅脱敏读取，展示需要修复。旧主机出现于任一跳时，拨号前直接返回模块认证错误。旧文件和 Safe 条目均保留。

从隔离 Vault 执行 `vitest run --no-cache --pool forks --maxWorkers 1 plugins/ssh/test/host-auth.engine.test.ts plugins/ssh/test/directory.test.ts plugins/ssh/test/forwarding.engine.test.ts plugins/ssh/test/manager.test.ts`。覆盖模块密码在 Safe 未初始化、锁定和停用下真实回环认证。兼容夹具验证直接连接、经过旧跳板和转发均零拨号，旧文件逐字节一致，Safe 中原条目仍可解锁读取。已有 SSH 私钥、版本检查及连接回归复用原用例。