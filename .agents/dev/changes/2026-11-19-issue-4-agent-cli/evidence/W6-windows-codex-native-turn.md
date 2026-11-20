# Windows Codex 原生提问与结果

Windows x64 上的 Codex CLI 0.171.0，原生二进制 SHA-256 `cefea4ffee1fff04983a99c0dda99944d8b380e891e740a28b32f4b815a6e0b7`。用该版本生成 JSON Schema，再通过 App Server 的 stdio 创建只读的临时线程。试验禁用 shell 工具、清空 MCP 服务配置并显式启用本机默认关闭的 `default_mode_request_user_input`。只用合成的圆形和方形选择，不读取真实项目、已有线程或回复内容。

1. `turn/started` 和 `turn/start` 响应报告相同原生 turn ID，状态为 `inProgress`。
2. 真实 `item/tool/requestUserInput` 给出两个选项，回复用原 JSON-RPC 请求 ID 和问题 ID。服务返回同一请求的 `serverRequest/resolved`。
3. 同一 turn 的 `item/completed` 给出预期的合成答案，`turn/completed` 状态为 `completed`。进程正常退出，清理临时目录。

问答确认由请求归属、正常结果和同一轮完成状态共同证明。官方文档也列出中断或清理触发 `serverRequest/resolved` 的情形。临时线程实测支持协议接入选型。跨重启的持久结果、回复后断线、原生去重、Huhu Core 工作区定位与生产默认开关继续按 W6.3/W8.2 验收。 [Codex App Server 协议](https://developers.openai.com/codex/app-server)

证据在原工作区 `temp/issue-baseline/core-finished/t13b.log` 和 `temp/issue-baseline/provider-probe/`，含探针与该版本生成的 schema。
