# 任务报告

- 共享根：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout
- pane_id：w4:pB
- task：task08.md
- 任务文件：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pB/task08.md
- 报告文件：/home/wta/projects/huhu/.agents/system/herdr/2026-11-18-issue2-closeout/w4:pB/report08.md
- 执行结果：done

## 结论

树菜单现在按当前目录、逐级祖先、Vault 根收集模板，同名模板使用最近的一份。当前目录标记为 `local`，祖先和根标记为 `inherited`。Electron 实测中，从乙的树菜单能看到根模板，甲的模板未列出。从甲的子目录能选中甲的模板、看到「甲」来源徽标，并以模板原文创建文件。主「新建笔记」对话框仍使用全 Vault 清单，现场验证其中仍列出甲的模板。

`notes.create` 仅允许桌面调用方传入 `templatePath`。只有创建权限的 CLI 请求使用本地模板时，服务在读取模板及创建文件前返回 `PERMISSION_DENIED`。同一令牌仍可用内置 `meeting` 模板创建笔记，桌面仍可用 Vault 模板并保留原始字节。CLI、MCP 及其他非桌面身份共用同一调用方限制，专项权限用例实测 CLI 和桌面。

## 产物与改动

- 工作目录 `/home/wta/projects/huhu-wt-layout`、分支 `closeout/issue2-layout`。开工执行 `git merge --ff-only closeout/issue2-integration`，快进到 `ca28e78306b553a10844a45744cc704d716b9484`。任务提交 `e6c1e2546c7b216375f4d71f516183bc157ccbe6`，提交后工作树干净。
- 修改宿主 `packages/editor/src/host/routes/files.ts`、能力入口 `plugins/notes/src/engine/index.ts` 和三个对应测试文件。树菜单继续传完整 Vault 相对路径作为模板选择值。宿主路由和引擎是本轮全部产品改动，因此没有触发前端 UI 实现的 Modern Web Guidance 流程。

## 验证

日志目录 `/tmp/huhu-task08.ouAM92`。

| 验收要求 | 实际检查与结果 | 证据位置 |
| --- | --- | --- |
| 基线回归 | 修复前 `/api/folder-config` 测试观测到外分支模板及同名重复。校正旧网关的 `CAPABILITY_NOT_EXPOSED` 前置断言后，CLI 回归测试确认本地模板请求错误地成功。 | `regression-before.log`、`engine-before.log` |
| 模板相关单测 | 对宿主路由、NotesService、真实引擎 HTTP 调用执行 `pnpm exec vitest run` 的模板相关筛选，5/5。扩大到三个文件时 80 通过、1 失败。失败是旧单个文件移动用例未创建 `归档` 目录，触发基线 A07 的 `NOT_FOUND`；该测试和 `service.ts` 相对 `ca28e78` 字节未变。 | `template-tests.log`、`affected-tests.log` |
| 静态检查与构建 | `pnpm typecheck`、`pnpm lint`、`pnpm knip`、`pnpm build` 均退出 0。Knip 仍有两条既有依赖配置提示。`pnpm exec oxfmt --check` 检查五个改动文件通过。 | `typecheck.log`、`lint.log`、`knip.log`、`build.log`、`format.log` |
| 指定 Electron E2E | `xvfb-run -a pnpm exec playwright test tests/e2e/knowledge/editor-parity-assets-template.spec.ts --retries=0`。首轮 2 通过、1 失败，新增用例按文件夹显示文本定位超时。改为真实完整树路径后复跑，3/3，17.0 秒。没有运行全量 E2E。 | `e2e.log`、`e2e-retry.log`、两轮 Playwright 输出目录 |
| E2E 前后负载 | 首轮前 `16.00 / 14.68 / 11.42`，后 `9.32 / 13.13 / 11.04`。复跑前 `5.36 / 11.72 / 10.64`，后 `4.45 / 11.21 / 10.49`。以上为 `uptime` 的 1/5/15 分钟负载均值。 | `e2e-before.txt`、`e2e-after.txt`、`e2e-retry-before.txt`、`e2e-retry-after.txt` |

## 阻碍与接续

两项指定修复已完成并通过专项验收。额外运行的旧移动夹具仍需建立目标目录才能通过原断言，记录留在 `affected-tests.log`。

## Lead 验收


Lead（2026-11-19）：接受。核对 e6c1e25：`templatesForFolder` 只收当前目录、祖先与根，同名就近；`notes.create` 的 `templatePath` 仅 `caller === "desktop"`，引擎测试覆盖 CLI 拒绝与桌面成功。报告中 `service.test.ts:279` 的失败系 4f5d524（A07）连带，已派 pC task09 修夹具（保留严格行为，Lead 决定）。已 `--no-ff` 合入集成分支。
