# 进度：智能体启动与设置

## 已完成并验证

- 数据驱动的智能体目录（Claude Code / Codex / Pi），`resolveAgentLaunch`（交互与 headless 共用），`agents.json` 条件写，检测缓存与安装目录回退，fast 参数。
- 设置页（命令行预览、环境变量遮罩）、新建菜单（终端 + 智能体 + 设置）、插件设置页注册框架（系统 / 插件分组导航，按 Vault 保存，停用插件页面消失）。
- 证据：`plugins/agent-cli/test/{agent,sessions,waiting}.test.ts`、e2e acceptance“Agent CLI 新建菜单”“智能体设置页”“ACC-AG-11”。

## 未验证

- codex 的 `service_tier=priority` 没有在真实 codex 上验证。
- Herdr 环境变量叠加只做了命令预览与单元测试，没有在真实 CLI 上逐项实测。
- ACC-AG-11 的 e2e 需要空 HOME：检测会回退到 `~/.local/bin` 等安装目录（本机装了 claude）。
