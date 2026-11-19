# GitHub Issues 来源验证

- 从本地 `main` 的 `9f870c0` 创建并切换到 `feature/issue-fix`。
- `gh issue list --repo NAMEWTA/huhu --state all --limit 3` 返回该仓库的 Issue。
- 两次读取同一 Issue 都返回相同的 GitHub 对象 ID。核对了正文、作者和一条评论。 [Issue #2](https://github.com/NAMEWTA/huhu/issues/2)
- 交接方式为当前会话按需读取。未创建后台任务。
