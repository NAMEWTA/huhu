# Mail 同地址子集恢复

- 任务 `t4x/task12.md`，Core `wta-ubuntu`，执行 `t4x`，Lead `t3p`。
- 工作树 `agent-linux`，分支 `impl/huhu-issues-3-10-desktop-web-verify`，基线 `fa472010902b7335f4357b79683a17367aeb7e7e`。五个 Mail 文件已修改，未暂存或提交。

## 修改

- 恢复预检显示备份账号和命中的当前账号。可恢复的同地址行默认未勾选，用户可勾选「保留为独立账号」后提交。能力请求用可选 `keepSeparateAccountIds` 明确表达选择，提交时复核预检、冲突类型及当时显示的当前账号。草稿、投递标识、附件校验和损坏包仍受冲突检查。 [恢复能力](../../../../../temp/issue-worktrees/agent-linux/plugins/mail/src/engine/subset-data.ts) · [预检界面](../../../../../temp/issue-worktrees/agent-linux/plugins/mail/src/ui/MailSubsetSettings.tsx)
- 复用按地址串行写入、Mail 快照锁和恢复 journal，为独立账号分配新 ID。旧配置、本机密钥和 revision 保留，新账号需单独配置本机认证。草稿及投递记录中的账号改用新 ID，原草稿及投递标识、附件摘要、邮件线程和投递结果保留。恢复只写本地数据。 [账号写入](../../../../../temp/issue-worktrees/agent-linux/plugins/mail/src/engine/accounts.ts) · [恢复事务](../../../../../temp/issue-worktrees/agent-linux/plugins/mail/src/engine/subset-data.ts)
- 已确认 journal 记录目标 ID，账号定义存来源指纹。重新预检同一包时能找到已恢复的账号。提交失败可回滚，成功后回执写入失败可在重开时补齐。返回结果继续用 `accountId` 表示包内来源 ID，`existing.accountId` 在 `restored` 时表示目标 ID。
- 导出时从可用缓存提取被草稿或已读标记引用的 IMAP UID/UIDVALIDITY 或 Gmail 原生定位。导入时校验定位与来源引用，按新账号 ID 派生相同消息的目标 ID。仓库的 `forms` 指南用于将勾选项与现有账号、默认跳过及标记提示通过 `aria-describedby` 关联。 [消息定位](../../../../../temp/issue-worktrees/agent-linux/plugins/mail/src/engine/message-cache.ts)

## 验证

- Node `v26.11.1`。只运行 `plugins/mail/test/outbox-engine.test.ts`。先尝试既有「Mail ZIP」用例，沙箱拒绝监听 `127.0.0.1`，返回 `EPERM`，未到业务断言。随后在同文件增加无监听端口的用例，使用真实 Vault、账号存储和 journal。改前版本拒绝新增定位的备份。完成后定向用例 **1 项通过，11 项由筛选跳过**。 [测试文件](../../../../../temp/issue-worktrees/agent-linux/plugins/mail/test/outbox-engine.test.ts)

```sh
pnpm --config.verifyDepsBeforeRun=false exec vitest run plugins/mail/test/outbox-engine.test.ts -t 'Mail 子集同地址' --maxWorkers=1
```

- 定向用例覆盖原账号 ID 已占用、拒绝未勾选提交、取消、旧认证与 revision、草稿及回复引用、未知投递事实、附件字节、可定位与仅有旧哈希的已读标记、损坏定位、写入中断回滚、回执失败后重开和稳定重试。还检查了重新导出定位与恢复过程无账号发现调用。回环用例增加了同地址不同 ID 的恢复并保留 SMTP DATA 计数断言，该路径仍待在允许监听的环境执行。
- `git diff --check` 通过。未运行 E2E、全仓类型检查、lint、构建或打包。真实 UI、Gmail 场景和回环 SMTP 零重发计数未运行验证。未动 SSH、共享 contracts 或能力注册。现有注册直接引用 Mail 的共享 descriptor，无需 Lead 补注册。

## 兼容影响

- 仍可读旧版 v1 子集。带消息定位的子集写 v2，旧构建无法读取 v2。仅有旧哈希且目标账号 ID 变化时会逐项汇总无法恢复的已读标记，界面在预检和结果均显示数量。仓库原有的包内重复地址冲突规则继续生效。
- Reply/forward 的同账号引用随新归属重映射。缺少消息定位时保留历史消息哈希，原文定位仍需对应消息可用。其他来源账号的历史引用按原值保留。

## 文件 SHA-256

```text
4ba06644a9ce5033476fc54d6d4552697ad0c5e90161e9480ee86e8089efaa3b  plugins/mail/src/engine/accounts.ts
1ad9bec6e89cdd9222b1940763185121c1b78fe564c058e8c900b894c22eb532  plugins/mail/src/engine/message-cache.ts
910919ca4e95e3676c9d4ee048ed51be74f56ff44dfc41446efdc50dfc2ff7c0  plugins/mail/src/engine/subset-data.ts
bc7744f11ff76d87857fe5a51a54c152964351711df0a33b7f499eb87def96f6  plugins/mail/src/ui/MailSubsetSettings.tsx
2d2db991eea950e6faf3e7cf5aa6a3a0e4ddfcaeee933d581cb98324b438b14d  plugins/mail/test/outbox-engine.test.ts
```

## Core 回告

`hc get t4x` 因 Core 锁只读失败。已通过本机终端环境、任务清单和 Git 状态核对任务归属。

发布后向 `t3p` 执行 `hc send`，同样因 Core 锁只读失败，退出码 5。回告未送达，共享报告已写入。
