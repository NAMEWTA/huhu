# #7 H2.4 SSH 导入确认交付报告

## 交付

`t179` 在 `impl/huhu-issues-3-10-ssh-confirmed-ui` 上完成实现和验收。基线为 `d036effb58a55d2fe99901c5fe3381ec1a4e9f34`，改动留在当前工作树供 Lead 整合。根锁文件的 Git blob 已核对为基线的 `ce368ced5888cc3775d8e0265113737839e989d5`。

- 桌面「远程连接 → 导入主机」接受八种格式的单个本机文件。复用 `@huhu/ui` 的 `Dialog`、`Button`、`Badge`、表单和表格样式，以及 `ssh.hosts.import.preview` 和 `ssh.hosts.import.confirm` 的现有类型与入口。按行呈现来源、目标、分组、冲突和警告。用户可取消、取消勾选或显式更名。
- 过期时保留原结果给用户查看，撤下确认按钮，并要求重新预览。分组待补齐时提示主机已保存，保留原文件字节、预览标识和选择，用新的传输幂等键重新执行同一批确认。成功结果通过主机列表与目录查询刷新，主机概览展示分组路径。Web 入口可查看主机和分组，导入入口由桌面宿主提供。
- 实现文件为 `plugins/ssh/src/ui/{HostImportDialog.tsx,SshModule.tsx,ssh.css}`，新回归为 `tests/e2e/ssh/import.spec.ts`。已更新 `.agents/dev/changes/2026-11-19-issue-7-ssh-module/tasks/H2.4-import-preview.md` 的 Windows 客户端证据。
- 六个原型资源重新计算的 SHA-256 与用户确认的 `0a890ec3a9f26bbedc304f7b61e9cb41975d8b48df4ca2a96a33ee05fb473d2b` 一致。比对了本机 `temp/sources/motty` 的 `internal/workbench/session_import.go` 和 `internal/sessionimport/sessionimport.go`，版本 `2daa9db582e16edf60a60b7ada26f47f808f973c`，Apache-2.0。参照范围是显式选文件、取消、来源诊断和导入结果，界面由 Huhu 原型与组件实现。现有解析器的来源见 `docs/upstream/ledger.md` 的 R-54。

## 实跑证据

Windows x64，Node 24.21.0，使用本机缓存的 `corepack pnpm@12.10.1 --config.verify-deps-before-run=false`。Electron 44.9.1、Chromium 152.0.7977.167，回环 Web 测试复用本机浏览器。每个客户端测试使用独立测试 Vault。远端地址均为 `.invalid` 夹具。

| 检查 | 命令及实际结果 |
| --- | --- |
| 原型 | `exec node .agents/skills/dev-prototype/scripts/fingerprint.mjs .agents/dev/changes/2026-11-19-issue-7-ssh-module/prototype --expect 0a890ec3a9f26bbedc304f7b61e9cb41975d8b48df4ca2a96a33ee05fb473d2b` 匹配六文件指纹。 |
| 类型与构建 | `--filter @huhu/plugin-ssh run typecheck` 通过。`--filter @huhu/desktop exec electron-vite build` 成功生成主进程、preload、渲染进程。构建报告 `packages/contracts/src/ids.ts` 的 Node `crypto` 浏览器外置提示，实测 Web 入口仍可使用。 |
| SSH Engine 回归 | `exec vitest run --maxWorkers=1 --minWorkers=1 plugins/ssh/test/host-import.test.ts plugins/ssh/test/directory.test.ts`，2 文件、14 项通过。 |
| SSH 端到端 | `exec playwright test tests/e2e/ssh/import.spec.ts --timeout=120000 --trace=off`，最终 3 项通过（13.7 秒）。八格式均通过真实文件选择器输入并落盘，重新打开后对比映射和稳定 ID。 |
| 冲突与恢复 | Esc 取消后列表与目录内容相同。并发新增主机使预览过期。重新预览后验证更名、同端点跳过、坏记录、字段警告与手动跳过。目录文件故意损坏后验证已保存两个主机，重新打开弹窗并在修复测试目录后重试，主机 ID 与重试前一致且存在两层分组。960 × 600 窗口断言确认按钮在视口。 |
| Web | 通过只监听回环的共享服务打开真实浏览器页面，读取桌面写入的主机及分组，核对导入按钮只在桌面显示。 |
| 格式与 lint | 目标文件 `oxfmt --check`、`oxlint -c oxlint.json`、SSH CSS `stylelint` 均通过。`check-ui-colors`、`check-css-layers`、`check-css-classes`、`check-css-ownership`、`check-css-duplicates` 与 `git diff --check` 通过。 |

截图为最终构建的浅色实际渲染。 SecureCRT 预览，1440 × 1000（本机原件 `temp/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t179/task01/legacy-7984bff4/evidence-task01/ssh-preview.png`） · 冲突与更名，960 × 600（本机原件 `temp/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t179/task01/legacy-7984bff4/evidence-task01/ssh-conflict.png`） · 分组待补齐（本机原件 `temp/system/herdr-core/2026-11-20-huhu-issues-3-10-implementation/t179/task01/legacy-7984bff4/evidence-task01/ssh-groups-pending.png`）

## 边界与未测

- 本切片的验收路径无实施阻塞。原身份重试状态保留在当前 SSH 界面实例。关闭并重开弹窗可继续。跨页面刷新、模块卸载或应用重启的恢复未实现。重试遇到主机目录再次变化时受现有版本校验约束，界面保留已导入主机并提示补齐失败。
- 验证范围为 Windows、Electron 及单个本机 Chromium 浏览器。未运行其他操作系统、其他浏览器、打包安装或真实 SSH 连接。
- Electron 与本机 Web 测试实例已退出，测试代码清理了临时 Vault 和合成文件。自动执行审查以策略限制为由拒绝了对五个本轮临时 Electron `userData` 目录的递归删除。这些测试配置仍留在系统临时目录。

## Modern Web Guidance

从本机缓存执行 `search` 和 `retrieve`。搜索覆盖确认弹窗、文件选择、可访问数据表及状态播报。依照 `dialog` 使用 Huhu 原生模态组件和浏览器的 Esc、焦点处理及遮罩滚动隔离。依照 `responsive-table` 使用有标注的键盘可达滚动区与吸顶列头。依照 `forms` 和 `accessibility` 使用本机文件控件、显式提交、状态播报与错误提示。按 Windows 实际捆绑的 Chromium 核对渲染。


## Lead 验收

核对工作树、实际改动、类型/构建和三项 Playwright 结果。原提交缺失已补齐，候选为 `3b837a7dcbe4cbee24284069f29f03fd0575fb61`。待合入集成和后续组合验证。跨应用重启的分组恢复仍列为未覆盖。
