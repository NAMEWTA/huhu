# Mail Graph 候选协议修复
共享根为本文件上两级。Lead t3p，worker t10q，task01，工作目录 /home/wta/projects/huhu/temp/issue-worktrees/agent-linux，基线4ae7e7e4。先读AGENTS、dev-build与同主题t10d/task01/report01、t10n/report01以及批次决定。

目标：修复独审确认的三项P1及三项P2，使此前已批准Graph授权可用，同时保留Exchange完整默认路径。仅你可写 plugins/mail/**（含新的Graph文件与测试）；不得写其他文件或覆盖其他worker变动，不提交暂存，不改冻结integration。不派子代理，不运行任何验证（含Vitest/tsc/build/e2e/install），当前Lead的单次全量E2E仍在跑。

沿现有实现最小修复：
1 Graph access token视为opaque，不依赖解码aud/scp；可信资源及授权scope来自token交换和既有请求绑定，IDtoken身份验证保持，实际Graph探测确认。不跨资源送token。
2 接受同源同Inbox的slash及OData括号next/delta链接，保持服务端原始不透明链接，仍拒跨源或换folder。
3 不用全局Graph配置替换默认Exchange issuer。保留原添加/修复入口与凭据，按账号已批准授权上下文静默取得Graph，成功探测后切代；不可用保留旧账号与Exchange，不能靠测试修改issuer模拟fallback。不得扩展新Graph consent UX；如无现有上下文可完成，明确回报实现边界，不虚造授权。
4 MIME总预算内无法读完的合法邮件不能随着新游标永久丢失；使用有界可续待取机制或现有窗口设计，使初扫/410恢复能收敛，保持缓存与cursor一致。
5 缓存实际发布用beforeCommit复查账号代/取消/移除，证明旧同步不能越过账号切代落盘。
6 权限变化成功提交后发mail-account事件；403只在可信授权证据下归为Mail.Send缺失，其他拒绝保留真实含义。UI改动先执行modern-guidance search/retrieve。

补针对上述触发的低成本定向测试（只写不跑），包括opaque首次/refresh、合法括号页/终态、生产装配两账号fallback、预算跨轮补齐、修复并发写前屏障、发送撤权事件与MIME附件Bcc。优先复用现有fixture，不新建无关基础设施。来源文档由Lead负责。
报告写工作树 temp/final-audit/t10q-report01.md，列具体改变/未解决边界/未运行验证，若写权限阻塞直接终端输出报告，不重试提权。完成用hc send t3p回报路径。
