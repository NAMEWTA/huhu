# H8.1 转发规则配置 Windows 验收

沿用已确认的「端口转发」规则列表及编辑预览。先复用 SSH 主机目录、跳板路径指纹、Vault 文件版本与既有 Dialog。对照本机 Motty `2daa9db582e16edf60a60b7ada26f47f808f973c` 的 `internal/portforward/forward.go`。该实现按模式区分监听地点、固定出口与动态目的地。

执行 `vitest run --no-cache --pool forks --maxWorkers 1 plugins/ssh/test/forwarding.engine.test.ts`。隔离 Vault 的真实 Engine 写入四类规则并重开，配置保存前后本机探测端口仍可绑定。旧版本更新被拒，动态模式拒绝固定目标，后端拒绝非回环绑定字段及不可用中继。直接删除仍被规则引用的主机被拒。规则能力限制在桌面入口。