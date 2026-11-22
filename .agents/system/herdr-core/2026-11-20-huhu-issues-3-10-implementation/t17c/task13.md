# #9 P4/P10 从 Git 同步移除对保险箱的读取

- terminal_address `t17c`
- 工作树 `D:/Document/code/huhu/temp/issue-worktrees/agent-lifecycle`
- 新分支 `impl/huhu-issues-3-10-versioning-owned-auth`，从 `0c96c27b844a580178a4d6f24f1d6bb987eba4e7` 起
- 报告 `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t17c/report13.md`

按 #9 P4.1/P4.2/P10.2 和原型，Git HTTPS 同步使用已有 Versioning 自有认证，并清除产品的 Safe selector、secretUse fallback、兼容配置写入口与 safe.unlocked 处理。旧同步配置有引用时，保留 remote / branch / mode，给出当前模块补配状态，禁止使用旧引用或发送旧值。保留精确远端版本和已定一次修复恢复、普通本机文件远端及当前 Git 安全边界。优先复用现有 GitRemoteCredentials、GitAuthPanel 和真实回环测试；替换仍要求旧 fallback 的测试语义，用现行路径验证实际认证。记录停用 Safe、授权、补配和错误回退证据。

只能写 plugins/versioning、对应集成测试和 #9 证据；不得修改根锁文件、公共 Engine 装配或他模块。前端变动前 search/retrieve。Windows 本机临时 Vault 和 Git 回环假目标；无真正远端变更。工作树已有忽略构建产物 native/，本轮不要写或清理它。按文件协议提交精确 Git SHA、实测结果与尚未覆盖的项。

