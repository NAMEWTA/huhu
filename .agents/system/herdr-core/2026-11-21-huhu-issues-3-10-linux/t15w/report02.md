# 候选桌面 Engine 身份与清理复核

**结论：本次差异保留了同包、同 profile、同 Vault 的身份核对，也保留了原有清理条件和失败处理。未发现阻断项。** 审查对应 `t15w/task02.md`，基线提交 `05a748b6`，目标为 integration 工作树中 `tests/e2e/helpers/candidate-desktop.ts` 的 Git blob `492947fce584e46549c530f49a371145f42543f7`。

## 身份核对

| 核对项 | 代码证据 |
|---|---|
| 候选包 | 第 124–125 行继续核对描述中 PID 的实际可执行文件，要求它来自本次候选包的解包目录。第 312–318 行在返回夹具前仍执行 confirmCandidate，核对包及资源哈希、运行中的 Main 和 renderer 报告的提交。 |
| 当前 profile 的 Engine | 第 127–148 行在 Playwright 启动的 Main 中读取实际 userData 和 XDG_RUNTIME_DIR，对照夹具私有目录，并交叉核对 Main PID。描述中的 PID 必须区别于 Main，且在这个 Main 的进程指标中唯一命中 type 为 Utility、name 为 huhu-engine 的进程。其他 profile 中运行同一份二进制无法仅凭 exe 路径通过。 |
| 当前 Vault 与运行实例 | 第 117–125 行核对本机 Vault 描述和 rootBinding，第 302–312 行让该窗口报告就绪端点，严格匹配描述中的回环地址和 Vault ID。首次记录和复验都包括 startedAt 的摘要和有限正数 creationTime，完整对象比较可发现 PID 相同但创建时间变化。 |

现场证据在 `temp/final-audit/candidate-profile-probe-05a.log:110–124`。Main PID 为 752962，两个私有目录均匹配。描述 PID 753046 命中 Utility，显示名为 huhu-engine，serviceName 为 node.mojom.NodeService，creationTime 为 1795376478350。旧 proc 环境项两项均未匹配。新代码使用现场实际承载显示名的 name 字段；这份探针取自旧断言仍在的运行。

## 异步与清理

- 初次取证、业务中复验和关闭前复验均等待 readEngine 完成，缓存保存已解析的身份对象。复验不匹配会抛错；关闭前已有身份时会与原记录比较。三个调用点在第 297、303、185 行。
- 第 127 行为 Main 查询设置 5 秒上限。超时后的在途查询只读取指标，不更新缓存或控制进程。第 29–56 行逐项等待清理并记录失败，因此关闭前复验失败后仍会尝试关闭 Electron、观察进程退出和写清理附件。启动主体的原始错误优先返回。
- 清理仍按已知 PID 观察 Main 和 Engine 退出、核对描述已移除；Core 停止受私有 runtime socket、所属用户、候选二进制及已记录实例约束，随后检查 Core、holder 和 socket 残留。第 277 行只在前一轮清理成功后删除本次夹具目录。若首次身份从未取得，后续仍会尝试复核；若仍失败，清理会报告该阶段失败，保留目录。已有身份且 Main 已退出或描述已移除时，沿用第 184 行的跳过条件，后续退出检查仍执行。
- Web 分享用例在同一 Vault 重开桌面时会建立新的夹具身份，要求 Vault ID 相同、启动摘要不同。已有调用者继续等待 confirmEngine；返回对象新增 creationTime 与这些比较兼容。见 `tests/e2e/workflows/web-share.spec.ts:318–327`。

## 规范与验证范围

本次 diff 限于 E2E helper。新增的 Main 查询只返回目标 PID 的四个指标字段、Main PID 和两个路径，不获取 Engine 完整环境，也不扩展生产 preload 接口。`git diff --check HEAD -- tests/e2e/helpers/candidate-desktop.ts` 通过。按任务要求未运行测试；修改后候选包的完整启动、业务操作与退出结果仍待 Lead 的实包运行核验。
