# #9 P10.1 · 保险箱个人管理与独立敏感读取

共享根 D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation
terminal_address t17c
task task21.md
report t17c/report21.md

Windows only。以 04bd14e41e04449975a656f91010cac7b0e62a2b 在 agent-lifecycle 独立分支 impl/huhu-issues-3-10-safe-tools 实施。读 #9 source、spec、design、P10.1 与 #6 对应工具政策。原型均确认，无需询问。可写 plugins/safe 与 #9 evidence，新业务测试可放插件 test 走真实本机 Engine。公共 Engine 静态装配、Kernel Dispatcher/授权、CLI 根配置及锁由 Lead 唯一写。若需这些变更，请在报告写精确的最小契约和所在文件，继续其余独立实现。

用同一 schema 与账户版本、解锁代和会话校验，分别登记个人条目、账号、标签、生命周期/设置、显式账号密码读取。外部默认关闭，明文读取需单独工具开放，读写撤销、锁定、交换 Vault 和同 key 重交都要先复查实时授权与解锁，输出不能经过共享持久回执或旧缓存。CLI 秘密输入用当前 --input-file -，不在命令参数和证据中留值。现有 Gateway/API/HTTP/stdio MCP 及 CLI 正常入口验证同一合成条目、单项授权、拒绝、撤销与重放。不要给旧 items 或主密码增加 reveal。生产已无模块读取 secretUse 的消费者，核对 #9 D01；安全去掉生产 service 和可从工作台新增的旧权限路径前保留旧数据和准确 fixture，若冲突分步返工。不要修改用户实际保险箱、账号、系统凭据或浏览器。客户端 TS 调整先走 MWG。分步提交早报阻断项，报告实际测试、未覆盖点与 Lead 装配。
