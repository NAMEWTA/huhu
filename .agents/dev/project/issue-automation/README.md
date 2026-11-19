# 获取 Huhu 项目的 Issue

收到读取 Issue 的请求时，从 [项目配置](configuration.yaml) 的 `source.scope` 取得 GitHub Issues 地址，将其中的 `OWNER/REPO` 作为 GitHub CLI 的 `--repo` 参数。

将 `OWNER/REPO` 和 `NUMBER` 替换为来源仓库和 Issue 编号。列出 Issue 时，按请求设置 `--state` 和 `--limit`。下面的列表命令默认最多返回 30 条开放 Issue。

```sh
gh issue list --repo OWNER/REPO --state open --json number,title,state,url
gh issue view NUMBER --repo OWNER/REPO --json number,id,title,state,labels,url,author,body,comments
```

读取单条 Issue 时，核对返回的 URL 是否属于配置的仓库，并使用仓库与 Issue 编号或 GitHub 对象 ID 标识原报告。按任务需要读取正文、评论和相关附件。GitHub CLI 不可用时，可打开配置中的 GitHub Issues 页面读取同一来源。

这是手动读取流程，结果交付到当前会话。后续分诊、复现或修复按具体请求启动。
