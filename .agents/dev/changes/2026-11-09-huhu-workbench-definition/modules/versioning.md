# 版本历史与同步

插件：`versioning`。原型依据：`version-workbench.jsx`、`version-workbench-model.js`（已含 OK 时间线/差异纯函数）。复用：R-46–R-51。决定：D-15、D-16。

## 1. 三个概念

| 概念 | 存储 | 用户含义 |
| --- | --- | --- |
| 文件历史 | `.huhu/history/git` shadow 仓库（不影响用户自己的 Git） | 每个文件过去的版本；HUHU 每次保存记录一个版本，用户也可“保存版本”打上命名检查点 |
| Git | Vault 根目录下用户的真实 Git 仓库（若存在） | 工作区/暂存区/提交历史 |
| 同步 | Vault 的 Git 远端（origin） | 手动 / 仅接收 / 双向（off / follow / full） |

三者范围不同，界面不得用同一个“已备份”提示概括。

## 2. 用户故事

| ID | 故事 |
| --- | --- |
| US-VS-01 | 我选择一个文件，按时间看到它的历史版本（含改名前的版本），选中一个版本与其前一版或当前内容比较正文与属性差异。 |
| US-VS-02 | 我把文件恢复到某个历史版本；恢复前当前内容（含未保存修改）被保存为一个版本，恢复后的内容作为新的当前版本。 |
| US-VS-03 | 我为当前文件保存一个命名版本。 |
| US-VS-04 | Vault 是 Git 仓库时，我查看工作区与暂存区变更、暂存/取消暂存、写提交说明并提交、查看提交历史与每次提交的差异。 |
| US-VS-05 | 我配置 Git 远端与同步模式，先预览将拉入、将推送、跳过的文件，再执行拉取、推送或同步。 |
| US-VS-06 | 同步出现冲突时，我逐块选择保留本地、采用远端或手工编辑，应用后继续同步。 |
| US-VS-07 | 恢复一个任务文件不会让自动化重复执行已经做过的事情。 |

## 3. 界面

- **模块侧栏**：标题“版本与同步”；三项：文件历史、Git、同步（同步项显示状态点：空闲/同步中/冲突/离线/认证失败）。
- **文件历史**：左列：当前文件选择器（Combobox，默认上次在知识库打开的文件）、“保存当前版本”、版本列表（R-47 TimelinePanel：时间、来源（编辑/恢复/命名版本/同步拉入）、命名版本标题）。右侧：头部文件路径、`+n −m` 统计、“编辑当前文件”（跳到知识库）、“恢复此版本”；对比基准分段（与前一版/与当前内容）；DiffView（属性差异分区在正文差异之上）。底部提示“查看差异不会改写内容”。
- **Git**：Vault 不是 Git 仓库时 EmptyState“此 Vault 不是 Git 仓库”+“初始化 Git 仓库”（`git init`，确认对话框列出将创建的 `.gitignore` 默认内容：`.huhu/runtime/`、`.huhu/cache/`、`.huhu/ui/`、`.huhu/history/`）。是仓库时：分段 工作区/暂存区/提交历史；文件列表（状态 已修改/未跟踪/已删除，复选框批量暂存）、DiffView、提交说明输入 + “提交”；分支名与上游显示在头部。
- **同步**：远端设置卡片（远端 URL、分支、凭据：保险箱条目引用（HTTPS token）或系统 Git 凭据助手/SSH agent）；模式分段：手动 / 自动·仅拉取 / 自动·拉取与推送（选择后两者时先显示将纳入范围的确认）；高级：拉取间隔（默认 30 秒）、推送间隔（默认 60 秒），区间 30–3600 秒（R-49 `resolveAutoSyncIntervals`）。操作区：“预览”“拉取”“推送”“同步”；状态行：最近成功时间、ahead/behind、失败原因与重试。预览结果三组：将拉入、将推送、跳过（含跳过原因：被排除规则、秘密/运行目录）。冲突存在时顶部 Banner“需要处理冲突 n”→ 冲突页。
- **冲突页**（R-50）：文件列表；ConflictView：base/本地/远端三栏或逐块视图，每块“保留本地/采用远端/两者”，可直接编辑合并结果，未解决计数，“应用”“取消”。

## 4. 行为

- 记录历史：notes/tasks/archives 等写入语义或笔记文件后，versioning 订阅 `vault.fileChanged`（来源为 HUHU 写入），在 2 秒去抖后 `commitWip`（R-46）记录该文件；外部修改在监听到后同样记录。仅记录文本文件（≤ 10 MiB）；不记录 `.huhu/` 下除语义目录外的文件。
- 恢复（`history.restore({path, entryId, expectedCurrentVersion})`，R-48 顺序）：若该文件在知识库中有未保存修改，先要求保存或丢弃 → 校验 `expectedCurrentVersion` → `safetyCheckpoint` 保存当前内容 → 解析改名历史得到准确 blob → 语义文件先按 kind 校验 → 经操作日志写入 → 发布事件。Task 文件恢复只恢复内容字段（标题、正文、截止日、项目、执行方式、资源、提醒），保留当前的 `completed` 与 `completedAt`（原型 `version-workbench-model.js` 同样处理），然后调用 `holdRestoredInput`（[automations](automations.md) §5），任务详情提示“已恢复到历史版本，自动处理已暂停”。automation-rule 文件恢复后强制 `enabled: false`。task-run 文件恢复只改变显示内容，不改变 claim。
- Git 操作在 versioning 的串行队列中执行（同一时刻只有一个 Git 命令），超时 120 秒；`index.lock` 存在时报告“另一个 Git 操作正在进行”。
- 同步（R-49）：推送使用临时 index，只包含纳入范围的文件；默认纳入：Vault 内所有 Markdown 与附件、`.huhu/` 下 `vault.json`、`settings.json`、`plugins.json`、`notes/`、`home/`、`agent-cli/spaces/`、`ssh/hosts/`、`ssh/known_hosts`、`automations/scripts.json`、`safe/`（只有密文与元数据）、`sync/config.json`；排除 `runtime/`、`cache/`、`ui/`、`history/`、`drafts/`、`operations/`、`automations/claims/`。用户可在同步设置中追加排除规则（gitignore 语法）。拉取引入变更后经文件监听进入各模块；打开中的文档按 [knowledge](knowledge.md) §5“外部修改”处理。推送响应丢失 → 状态 unknown，下次操作先 `fetch` 比较远端 HEAD 判断是否已推送。
- 自动模式由 versioning 自己的定时器驱动（不使用 automations 的规则），插件停用时停止。

## 5. 验收

| ID | Given | When | Then |
| --- | --- | --- | --- |
| ACC-VS-01 | 笔记 N 修改 3 次后被重命名为 M | 打开 M 的文件历史 | 显示改名前后的全部版本 |
| ACC-VS-02 | 笔记有未保存修改 | 恢复一个旧版本 | 先要求保存/丢弃；完成后历史中有“恢复前”版本，当前内容等于所选旧版本 |
| ACC-VS-03 | 一个已勾选完成、曾被自动化处理过的 Agent 任务 | 恢复其未完成时期的旧版本，然后等待下一次扫描 | 正文回到旧版本，`completed` 仍为 true；该任务被跳过（恢复后暂停），没有新进程；原 task-run 文件不变 |
| ACC-VS-04 | 恢复一个规则文件的旧版本（旧版本 enabled: true） | — | 恢复后规则为已暂停 |
| ACC-VS-05 | 本地 bare 仓库作为远端，两个 Vault 副本修改同一笔记同一行 | 第二个副本同步 | 进入冲突；在 ConflictView 选择后应用，同步完成，两份内容按选择合并 |
| ACC-VS-06 | 同步预览 | 打开预览 | `.huhu/runtime/`、`.huhu/cache/`、`drafts/` 出现在“跳过”而不是“将推送” |
| ACC-VS-07 | Vault 不是 Git 仓库 | 打开 Git 页 | 显示初始化入口；文件历史仍可用 |
| ACC-VS-08 | 远端认证失败 | 同步 | 状态为“认证失败”并显示具体原因与“重新配置”；本地文件不变 |
