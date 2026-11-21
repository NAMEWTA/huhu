# #4 W6.2 与 #8 S1b.1 独立审查

- 共享根 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation`
- terminal_address — `t161`
- task — `task01.md`
- 任务文件 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t161/task01.md`
- 报告文件 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t161/report01.md`
- 执行结果 — **done**

## 结论

两个冻结候选的后端范围通过本次独立核验，定向复跑共 3 个测试文件、4 项通过。未发现需要阻挡这两份候选交回 Lead 的新增缺陷。Agent 的生产授权与 Tasks 接线、两项的界面验收仍属后续范围。

| 对象 | 冻结候选 | 直接父提交 | 原验收 |
| --- | --- | --- | --- |
| Agent W6.2 | `da653169aa2f71aabe08085989e951aa885bc1bb` | `162fa0dc3af5ccf03b20d701a30b2bf02612fa14` | 10 个文件，88 项通过、6 项跳过，验证退出 0。 [原任务](../t135/task06.md) · [报告](../t135/report06.md) · [专项日志](../t135/evidence-task06/live.log) · [回归日志](../t135/evidence-task06/regressions.log) |
| Mail S1b.1 | `37bcc525c913afc1fa6d5180c2bff6b771fc8ae4` | `8dc4a5f29f0923abb54d2e3ca7a8728f96329acb` | 4 个文件，26 项通过，测试退出 0。 [原任务](../t12p/task07.md) · [报告](../t12p/report07.md) · [测试日志](../t12p/evidence-task07/mail-tests-final.log) |

## Agent W6.2

- **规格。** 从 `dispatch.ts:147` 追到 `sessions.ts:749`、`codex-dispatch.ts:171` 与 `codex-dispatch-helper.cjs:256`。原派发、输入摘要、Core／进程代次和输入所有权参与核对。原 stopId 在首次提交前持久认领。认领后的重复调用读原记录。只有 stopId、签名提交记录和同一原 thread／turn 的 `interrupted` 终态都吻合时才返回 `stopped`。RPC 成功或异轮通知只留下 `unknown`。原轮自然完成或失败返回 `completed`。`not_sent` 需要原绑定的认证 helper 明确答复且没有持久意图或终态；已有意图而缺证据时保持 `unknown`。旧回执缺终态状态时仍能用于原派发对账。
- **项目规范。** 两个私有入口继续限制为 `plugin:tasks`，沿用原签名控制通道及派发对账。复跑在夹具里给 `agent.task-input` 加入两个入口，覆盖 Agent handler。冻结候选的生产权限表及 Tasks 取消入口由 Lead 接续。
- **入口与实测。** 通过真实 Windows Engine HTTP 建立任务，再经 Dispatcher 调用私有停止入口。最初 inspect 为 `not_sent`。认证后失去输入权时返回 `stale`，意图及中断均为零。并发请求只给原 thread／turn 发出一次中断。RPC 回包和异 thread／turn 通知后仍为 `unknown`，Engine 重开保留输入占用。原轮迟到的 `interrupted` 到达后为 `stopped`，占用释放，中断总数仍为一。已自然完成或失败的原轮发送零次中断，发送后先收到原轮自然终态也为 `completed`。同地址换成新 shell 后，旧的无终态请求保持 `unknown`，新停止为 `stale`，替代 shell 共收到零次中断。1 项通过，Vitest 退出 0。 [独立 Agent 日志](evidence-task01/agent.log)

## Mail S1b.1

- **规格。** `plugins/mail/src/engine/drafts.ts:119` 从原 Vault 的 `.huhu/mail/drafts.json` 读取草稿和文件版本。`drafts.ts:129` 在串行队列中检查业务修订，向 `VaultFiles.write` 传入读取时的文件版本。`packages/vault/src/write.ts:52` 按路径将版本核对与原子替换排队。首次写要求文件不存在或匹配已读快照，丢弃留下修订和身份、清除正文；旧修订或迟到创建无法恢复该 ID。切换账号核对 `smtpEnabled`，保留原账号的编辑可在认证待重配时继续。只读从原 Vault 读取，写入经可写性检查。 [原 Mail 报告](../t12p/report07.md)
- **入口与实测。** 经桌面 HTTP 与 Web 工作台 Dispatcher 保存并重开，两个合成发件账号、To／Cc／Bcc 去重、主题、富文本及链接均符合断言。仅收件账号与不存在的账号被拒。只读可读回原稿，保存和丢弃均返回 `READ_ONLY_VAULT`，字节保持一致。模拟一次原子替换失败后原字节与修订保全。并发同修订仅一方提交，另一方获当前草稿修订；不同草稿均保留。丢弃后旧更新、迟到创建和 Engine 重开均未恢复正文。这里的 Mail 并发夹具验证业务修订，文件层条件写另以源码核对。 [独立 Mail 日志](evidence-task01/mail.log)
- **新 ZIP 与账号回归。** 夹具直接调用生产共用的 `exportPackage`／`importPackage`。静态核对桌面能力以 `vault.root` 调用同一导出器。实际 `huhu-package` v1 清单包含源库草稿文件，两封草稿及账号引用恢复后可读，原库草稿保持原修订。恢复账号需重配，直接读取凭据返回 `unbound`，清单和解包断言排除合成密码、本机保护数据和运行目录。草稿夹具的邮件传输回环连接为零，独立的账号夹具验证 Safe 锁定时仍可使用 Mail 账号以及 ZIP 恢复后的认证状态。3 项通过，Vitest 退出 0。 [独立 Mail 日志](evidence-task01/mail.log)
- **项目规范。** 复用工作台授权、原 Vault 条件写与整 Vault ZIP 库。原报告中 Mail 类型检查的 `TS2379` 同样见于父版本日志，且两提交的 `packages/contracts/src/kinds/task.ts` Git blob 相同。本轮未复跑类型检查。ZIP 夹具取已提交快照，保存和导出并发、桌面 ZIP 能力的传输层以及编辑界面均未在本轮运行。 [候选类型日志](../t12p/evidence-task07/mail-types-final.log) · [父版本类型日志](../t12p/evidence-task07/baseline-types.log)

## 复跑、调度与清理

1. 核对两候选的 Git 对象、直接父提交及原验收日志，两组 `git diff --check` 退出 0。Windows x64 和 Node v24.21.0 下从 Git 对象分别归档至一次性系统临时目录。复用本机集成检出 `3290af19c012c320bb4c7d89c2ab66baf36357ae` 的已安装依赖，三个提交的锁文件 blob 相同。工作区依赖指向各自快照，测试文件和 Agent 合成 App Server 文件的 blob 与冻结提交相同。固定 Core 0.1.19 的 SHA-256 为 `8c5c088eda5c441502fa58714277a250e38103c66180376ef00d63d6cab03f8d`。 [复跑脚本](verify-frozen.ps1)
2. 等待磁盘队列归零后，在 `t163` 以低于正常进程优先级串行执行 Agent、Mail，两轮均限制为单 worker。调度快照记录了同期打包 `t15x` 与全量测试 `t160` 的状态。复跑使用隔离 Core、合成 App Server、合成数据和本机回环。 [调度快照](evidence-task01/scheduling.log) · [窗格启动](evidence-task01/pane-start.log)
3. 两轮 Vitest 均退出 0，夹具临时目录为零，隔离 Core 已停止。首次包装脚本因 Windows 临时路径末尾的反斜杠导致清理校验退出 1。修正路径比较后独立完成清理，先解除依赖目录联接，再将一次性源码快照移入回收站，原路径已验证不存在。验证窗格 `t163` 已移除。业务源码和锁文件以只读方式核对，复跑使用非注册临时快照。 [清理日志](evidence-task01/cleanup.log)

Lead 可回收执行窗格 `t161`。
