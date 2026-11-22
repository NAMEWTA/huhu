# #7 H8.1/H8.2 真实 SSH 转发规则与运行
共享根 D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation
terminal_address t18v
task task09.md
report t18v/report09.md

基线 4f301953，工作树 D:/Document/code/huhu/temp/issue-worktrees/task-cutover，分支 impl/huhu-issues-3-10-ssh-forwarding。改动仅 plugins/ssh、所属证据，公共 Engine/Renderer 入口需要 Lead 装配请在报告注明。按已确认原型读取 #7 spec/design 及 tasks/H8.1-forward-config.md、H8.2-forward-runtime.md。所有原型已确认，无需追问。先查已有 ssh2/会话/路由、临时 Motty R67 源码 portforward。按 AGENTS 对客户端先做 zh-modern-web-guidance search+retrieve。

先保存、按版本更新四种配置并限制参数组合，然后实现明确的、本机回环测试过的显式启动与停止，沿用绑定主机、可信路由和模块凭据，保留活动连接持有者。默认回环，测试仅当前 Windows 临时 Vault、本机回环 SSH/服务和合成字节，不配置真实/远端主机。端口冲突、借用与复用关系、断线恢复、发布边界、活动统计及清理以真实网络请求核对。区分不可用能力，停止后核对端口释放和重复开始。按垂直切片提交，不改锁、外部仓库、根工作树。报告给出提交、命令、真实监听/停止观测、限制，以及公共装配的精确入口。若本次资源允许，开始独立 H9 的复用考察但 H8 优先。
