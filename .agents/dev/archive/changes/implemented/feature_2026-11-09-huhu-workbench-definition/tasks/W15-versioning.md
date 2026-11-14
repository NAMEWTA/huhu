# W15 版本历史与同步

## W15.1 文件历史记录与时间线

- 目标：每次写入记录到 shadow 仓库；文件历史页显示含改名谱系的时间线与差异；保存命名版本。
- 依据：[versioning](../modules/versioning.md) §3–4；ACC-VS-01。
- 前置：W06.4（DiffView）、W04.4。
- 位置：`plugins/versioning/{huhu-plugin.json,src/engine/history/{shadow-repo,timeline,recorder}.ts,src/ui/history/}`。
- 复用：R-46、R-47。
- 实现要点：`.huhu/history/git` 初始化；订阅文件事件 2 秒去抖 `commitWip`；命名检查点；时间线查询（改名谱系）；vs-parent / vs-current 差异，vs-current 读取知识库打开文档的当前内容（通过 `notes` 提供的 `openDocumentSource(path)` 服务，未打开时读磁盘）；属性差异分区（`frontmatter-diff`）。
- 异常：shadow 仓库损坏 → 健康问题，提供“重建历史仓库（丢失旧历史）”需确认。
- 测试：ACC-VS-01；记录去抖与排除规则测试。
- 完成：ACC-VS-01 通过。

## W15.2 恢复

- 目标：恢复到历史版本，先保护当前内容；任务与规则的特殊规则。
- 依据：versioning §4 恢复；ACC-VS-02、03、04；ACC-AU-12（端到端部分）。
- 前置：W15.1、W13.2（holds 服务）、W06.3。
- 位置：`plugins/versioning/src/engine/restore.ts`。
- 复用：R-48。
- 实现要点：未保存修改先处理；`expectedCurrentVersion`；`safetyCheckpoint`；语义校验；操作日志写入；Task 只恢复内容字段并调用 `holdRestoredInput`；规则恢复强制 `enabled: false`；恢复后通知打开中的编辑器重载。
- 异常：预览后文件又被修改 → `VERSION_CONFLICT` 要求重新预览。
- 测试：ACC-VS-02、03、04；ACC-AU-12 端到端。
- 完成：四个 ACC 通过。

## W15.3 Git 工作区与提交

- 目标：Git 页：初始化仓库、工作区/暂存区/提交历史、暂存与取消、提交、提交差异。
- 依据：versioning §3 Git；ACC-VS-07。
- 前置：W15.1。
- 位置：`plugins/versioning/src/engine/git/{status,commit,queue}.ts`、`plugins/versioning/src/ui/git/`。
- 复用：R-49（`git-worktree-status.ts`、`git-repository.ts`、`git-pathspec.ts`）。
- 实现要点：串行 Git 队列、120 秒超时；默认 `.gitignore`；`index.lock` 检测；系统未安装 git 时，文件历史、Git、同步三页都显示“需要安装 Git”与各平台安装说明（shadow 仓库同样依赖系统 git），健康中心报告该项。
- 异常：无 git、非仓库、锁冲突。
- 测试：临时仓库集成测试；ACC-VS-07。
- 完成：ACC-VS-07 通过。

## W15.4 远端同步

- 目标：远端配置、三种模式、预览、拉取/推送/同步、状态与错误、自动定时。
- 依据：versioning §3 同步、§4 同步；ACC-VS-06、08。
- 前置：W15.3、W11.3（HTTPS 令牌）。
- 位置：`plugins/versioning/src/engine/sync/`、`plugins/versioning/src/ui/sync/`。
- 复用：R-49、R-51。
- 实现要点：纳入/排除范围（versioning §4）用临时 index 推送；预览三组；拉/推独立定时与退避（`auto-sync-mode.ts`）；推送丢响应 unknown 与下次 fetch 判定；凭据通过 SecretUse 传给 Git（`GIT_ASKPASS` 指向 Engine 写入的一次性脚本，脚本从环境变量读取令牌，进程结束删除）。
- 异常：离线、认证失败、受保护分支拒绝、`index.lock`。
- 测试：本地 bare 仓库集成测试；ACC-VS-06、08。
- 完成：两个 ACC 通过。

## W15.5 冲突处理

- 目标：同步冲突列表与逐块解决、应用后继续。
- 依据：versioning §3 冲突页；ACC-VS-05。
- 前置：W15.4。
- 位置：`plugins/versioning/src/engine/conflicts/`、`plugins/versioning/src/ui/conflicts/`。
- 复用：R-50。
- 实现要点：冲突权威对象唯一；base/本地/远端读取；逐块选择与手工编辑；应用前重验冲突身份与文件版本；语义文件解决后做 kind 校验。
- 异常：冲突在预览后过期 → 重新读取。
- 测试：ACC-VS-05。
- 完成：ACC-VS-05 通过。
