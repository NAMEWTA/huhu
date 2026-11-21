# #9 P3.1、P3.3 多账号工作区与锁定

- 共享根 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation`
- 终端地址 — `t17j`
- 工作目录 — `D:/Document/code/huhu/temp/issue-worktrees/safe-accounts`
- 分支 — `impl/huhu-issues-3-10-safe-confirmed-ui`
- 基线 — `6da1b2ec`
- 任务文件 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t17j/task01.md`
- 报告文件 — `D:/Document/code/huhu/.agents/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t17j/report01.md`

按要求使用 dev-build 和 dev-verify。完整 #9 原型指纹 d3b206857caed6e0e1d2c0d6ee505a0387c8f44fdedc249efd578de4f4d13f83 已确认。实现 P3.1 与 P3.3，复用 SafeModule 的状态、桌面权限、现成 Dialog/Field 以及 safe.entries.create/update/list/get、safe.accounts.update/reveal 的现有契约。列表显示账号数量，能编辑已保存条目的公共字段和单一账号，隐藏默认密码，显式显示所选账号，换账号、锁定或离开立即清除受保护界面。做好丢失回执、保存冲突和迟到响应的可见状态。优先打通完整的多账号创建、切换、编辑和锁定路径。其他任务仍需明确列出未验证项。

仅可写 plugins/safe/src/ui、对应 #9 任务验收证据、定向 Safe 测试。根锁、其它工区、公共契约、插件静态注册与宿主装配由 Lead 持有。无需使用真实秘密，只在当前 Windows 用固定 pnpm 12.10.1 测试隔离 Vault 和无价值夹具。Chrome 和 Electron 只启动项目自动化。不得连接远端或操作用户的真实资料。先执行 zh-modern-web-guidance search 和 retrieve。

工作区的 node_modules 已用核对锁图的目录连接准备好。调用固定 pnpm 时优先用 exec，关闭依赖自动验证，避免重新安装影响共享依赖目录。下面是已确认的本机路径及变量，可直接复制到 PowerShell。

```powershell
$lockedPnpm = 'D:/.pnpm-store/v11/links/@pnpm/exe.win32-x64/12.10.1/970127aafa9ec9f356ff26bd7887dbdb8a2494cef0a96bf91bbdea1323026672/node_modules/@pnpm/exe.win32-x64/pnpm.exe'; $env:Path = "$(Split-Path $lockedPnpm);$env:Path"; $env:npm_config_verify_deps_before_run='false';
```

按文件协议发布完整报告。外部 Lead 主动读取，不启动子 agent 或其它 worktree。
