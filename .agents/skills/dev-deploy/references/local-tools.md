# 本地 PR 观察与工作树审计

本包提供完整的 PR 观察器和只读工作树审计脚本。前者读取真实 GitHub 状态，后者整理本地工作树证据。两者都不提交、推送、合并或删除，不代替用户授权与交付裁决。

`SKILL_DIR` 表示本技能 `SKILL.md` 所在目录，本文件的上一级目录。下面的目标仓库、PR 编号和目录需要换成当前任务的真实值。

## 运行条件

| 工具 | 必需条件 | 未满足时 |
|---|---|---|
| PR 观察器 | Node.js 22.14 或更高版本；真实查询需要已认证的 `gh` 和对应仓库读取权限。 | 没有 `gh` 或读取权限时明确报告查询失败。 |
| 工作树审计 | Node.js 22.14 或更高版本；Git 必须支持 `worktree list --porcelain -z`。 | 缺少基础条件时停止，不能把无结果解释为安全。 |
| 可选 PR 查询 | 审计显式传 `--with-pr`，另需已认证的 Origin 或 `gh`。 | 查询失败时报告限制，保留本地证据。 |
| 可选聊天关联 | 审计显式传 `--transcripts <目录>`，或由用户设置 `SKILLS_HUB_TRANSCRIPTS_DIR`。 | 默认不读任何聊天记录，不推断宿主目录。新变量未设置时兼容旧 `SKILLS_WTA_TRANSCRIPTS_DIR`；新变量为空则禁用环境变量来源。 |

运行时要求记录在[工具包声明](../scripts/local-tools/package.json)中。脚本仅使用 Node 标准库，无需 `npm install` 或编译；文件统计、JSON 解析与文本检索也在 Node 内完成。工具不会自行创建循环任务、安装运行时、登录账户或读取其他项目上下文。

## PR 观察器

[启动器](../scripts/local-tools/watch-pr/watch-pr.mjs)使用[命令行入口](../scripts/local-tools/watch-pr/cli.mjs)、[GitHub 读取器](../scripts/local-tools/watch-pr/github.mjs)、[判定与队列逻辑](../scripts/local-tools/watch-pr/policy.mjs)、[输出格式](../scripts/local-tools/watch-pr/render.mjs)和[值校验辅助](../scripts/local-tools/watch-pr/types.mjs)。全部功能在本包内。

先看帮助，或只读取一次状态：

```bash
node "$SKILL_DIR/scripts/local-tools/watch-pr/watch-pr.mjs" --help
node "$SKILL_DIR/scripts/local-tools/watch-pr/watch-pr.mjs" --owner OWNER --repo REPO --pr 123 --status-only --pretty
```

PR 观察器只支持 GitHub。Origin 的 PR 状态应使用其实际 CLI 直接读取，不把这个 GitHub 观察器的结论套到其他托管平台。

### 三种观察方式

| 参数 | 范围与停止含义 |
|---|---|
| `--pr 123` | 观察单个 PR，遇到阻塞、就绪、查询错误预算耗尽或超时后退出。 |
| `--pr 123 --stack` | 根据同仓库的基础分支关系发现相连的打开堆叠，按问题层级检查整个堆叠。 |
| `--queued-stack --stack-prs 123,124,125` | 使用固定的自底向上列表，保持队列快照；不会自行合并。全部已合并时才返回 `COMPLETE`。 |

队列例子：

```bash
node "$SKILL_DIR/scripts/local-tools/watch-pr/watch-pr.mjs" --owner OWNER --repo REPO --queued-stack --stack-prs 123,124,125 --interval 60 --sweep-interval 300 --timeout 1800
```

`--interval` 默认 60 秒，`--sweep-interval` 默认 300 秒，`--timeout` 默认 0，表示没有截止时间。`--max-query-errors` 默认 5，连续错误的重试间隔从至少 60 秒开始，指数退避，上限 300 秒，且不越过设定的截止时间。查询恢复后连续错误计数归零。

`--status-only` 只输出一次状态，并以 0 退出，包括队列模式；这表示查询完成，**不表示 PR 可合并**。`--allow-draft` 只是使观察器不把草稿视为阻塞，不会把 PR 标记为就绪，也不授权这样做。

### 证据与协议

检查首先读取 `gh pr checks`。结果为空或无法使用时，分页读取 GraphQL 汇总。审查讨论也逐页读取；无法读取必要证据时返回查询问题，不用空列表宣称通过。派生仓库中的同名分支不参与当前仓库父项匹配。

默认输出 JSON，轮询中逐行输出 NDJSON。`schemaVersion`、`sequence`、`observedAt`、`kind`、`terminal`、`exitCode` 等字段与判定名称保留英文，便于机器读取；`--pretty` 提供中文说明。GitHub 地址在代码中仅用于验证仓库与 PR 地址，以及构造结果中的真实 PR 链接，不是文档依赖。

| 输出或退出码 | 含义 |
|---|---|
| `QUEUE`、`STATUS` | 记录队列，或报告观察到的快照。 |
| `WAITING` | 检查仍在运行，或没有当前阻塞的前沿正在等待合并队列；队列等待不是可自动合并的许可。 |
| `ADVANCE` | 已观察到前沿合并，继续下一项。 |
| `RETRY` | 查询暂时失败，按预算重试。 |
| 0，`READY` | 观察器自身规则下没有冲突、未解决讨论、失败或待完成检查。它不代表所有平台审批均已满足，也不代表实际行为已被独立验证。 |
| 0，`COMPLETE` | 固定队列中的 PR 均已被观察为合并；不等于已部署。 |
| 2 | 合并冲突。 |
| 3 | 未解决的审查讨论。 |
| 4 | 检查失败，或 GitHub 汇总明确拒绝。 |
| 5 | 超时。 |
| 6 | 草稿、要求修改或关闭未合并等门槛。 |
| 7 | 查询证据不可用，或错误预算耗尽。 |
| 64 | 命令用法错误。 |

名为 `Code Review Gate` 的检查会单独归类，不作为普通失败或待完成检查等待人处理。依照[PR 跟进](babysit.md)区分需要人批准的事项，并在实际合并前按[交付方法](verified-landing.md)检查平台当前门槛、当前补丁证据和授权。`READY` 不能越过这些要求。

## 工作树审计

[审计脚本](../scripts/local-tools/worktree-audit.mjs)默认只读取本地已有 Git 引用，不执行 `fetch`。只有明确加 `--with-pr` 才查询托管平台，只有明确给对话目录才搜索该目录：

```bash
node "$SKILL_DIR/scripts/local-tools/worktree-audit.mjs" --base main "/path/to/project"
node "$SKILL_DIR/scripts/local-tools/worktree-audit.mjs" --base origin/main --with-pr "/path/to/project"
node "$SKILL_DIR/scripts/local-tools/worktree-audit.mjs" --base main --transcripts "/path/to/chosen-transcripts" "/path/to/project"
```

输出按工作树大小降序排列，跳过主工作树。列的含义是：`SIZE` 大小，`AGE` 距离头提交的天数，`MERGED` 是否为基础引用的祖先，`DIRTY` 是否存在已跟踪修改或未跟踪文件，`REMOTE` 与本地远程引用的关系，`PR` 关联状态，`LAST_CHAT` 明确搜索范围内的最近记录，`BUCKET` 建议分组，`WORKTREE` 真实目录。路径中的制表符和换行在表格中转义，空格保留。

目录大小不跟随符号链接，并对同一工作树中的硬链接去重；文件系统提供分配块数时使用分配大小，否则使用逻辑字节数。聊天关联只遍历显式目录中的普通文本文件，跳过隐藏路径、符号链接和二进制文件；按内容中的工作树绝对路径查找关联，不读取其他目录，也不依赖 Git 忽略规则。

| 分组 | 后续判断 |
|---|---|
| `hold-wip` | 有已跟踪修改，或无法可靠读取状态；先保存和核对，不能清理。 |
| `hold-open-pr` | 仍有关联的打开 PR；确认工作去向。 |
| `verify-recent-chat` | 在明确指定的记录目录发现 4 天内相关工作；先核对交接。 |
| `safe` | 本地祖先关系或实际 `merged` PR 提供了可进一步评估回收的证据；仍需检查未跟踪文件、独有提交和用户授权。 |
| `review` | 证据不足，逐项审查。关闭但未合并的 PR 归在这里。 |

`MERGED` 只反映本地引用；未抓取时可能过期。Squash 合并不能只用祖先关系识别。PR 查询只读取当前账户的最近最多 1000 条 PR，无匹配不等于没有 PR。`REMOTE` 的 `aheadN` 是相对本地远程引用的可达提交数，不单独证明两侧没有分叉。`scratch:N` 只说明有 N 个未跟踪条目，不能据此断言它们可丢弃。

脚本不会执行任何删除；需要清理时先阅读[工作树清理方法](worktree-cleanup.md)，按照本次明确目标处理候选。审计结果过期或目录仍在使用时，先更新事实。
