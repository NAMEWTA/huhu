# 派发回执

- 共享根 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory
- terminal_address — t1tw
- task — task09.md
- 任务文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/t1tw/task09.md
- 回执文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/t1tw/report09.md
- 业务验收报告 — [040-s2.md](../../../../../.agents/dev/changes/2026-11-24-issue-inventory/evidences/040-s2.md)、[041-s3.md](../../../../../.agents/dev/changes/2026-11-24-issue-inventory/evidences/041-s3.md)
- 执行结果 — done，交回 S2 返修和 S3 已完成部分，业务验收与余项见下

## 成果与运行指针

工作目录 `/home/wta/projects/huhu/.agents/dev/worktree/inv-w2`，分支 `inv/w2`。业务基线 `c6bdb0b7`，快进到派发提交 `67ab81cd` 后实施。候选 `ad51040a2621064dced7487309d3ed6234e5590c`，工作树干净，`git diff 67ab81cd..HEAD --check` 通过。本次创建的验证终端已回收。

### S2 · 40a5b9c661579b3e76f09371c39fe44a1b488009

- 改动文件 — `plugins/ssh/src/ui/{HostDirectory,HostEditorDialog,RoutePanel}.tsx`、`plugins/ssh/src/ui/ssh.css`、`tests/e2e/ssh/{host-records,remaining,shortcuts}.spec.ts`、`tests/e2e/ssh/workbench.ts`。
- 草稿测试使用工作台客户端已有的执行幂等键，保留原 AbortSignal。Lead 原日志和 trace 显示请求在 Dispatcher 因缺键被拒；既有回环单测覆盖认证结果、未知指纹、凭据拒绝和中断释放。测试连接仍使用未保存表单。
- 两条 A01 夹具新建主机显式传空预期版本。四处工作区夹具只传严格的分栏输入 `{ hostId }`，避免把保存响应中的 `revision`、`authKind`、`configured` 和 `authState` 带入。用原生产 schema 的 `safeParse` 对旧、新输入做了临时定向检查，[schema.log](../../../../../temp/dev/2026-11-24-issue-inventory/runs/t1tw/task09/schema.log) 保存字段级结果。原 trace 只有夹具抛出的错误码。本次夹具将保留错误信息及校验问题的代码、路径和未知键，省略原始输入值。
- 批量跳板下拉有明确的无障碍名称，夹具按精确名称和组合框角色定位。搜索和候选项变化时定位保持唯一。上述改动覆盖 [Lead 的七处失败](../../../../../temp/dev/2026-11-24-issue-inventory/runs/lead/e2e-ssh-s2.log)，修复后的 E2E 结果待 Lead 复跑。
- A01 主机目录在列表和网格复用同一操作入口。右键选中的主机使用原选区，右键其他主机只作用当前目标，保留已有勾选。多选禁用编辑、复制等单条操作。菜单也可从每行可见的「更多操作」打开。置顶、名称升降序及手动排序走现有版本化目录写入。手动模式支持同组同置顶状态拖放和上移、下移，筛选时收起手动排序操作。
- 桌面批量删除确认保留主机版本和目标清单，逐台使用现有删除能力。引用或版本冲突留下对应主机并显示逐项错误，已删除项从选区移除。提交顺序按目录次序，同批包含互相引用的主机时可能出现可继续处理的部分成功。

### S3 · ad51040a2621064dced7487309d3ed6234e5590c

- 改动文件 — `plugins/ssh/src/shared/workspace.ts`、`plugins/ssh/src/ui/{WorkspaceCanvas,WorkspaceLibrary}.tsx`、`plugins/ssh/src/ui/ssh.css`、`plugins/ssh/test/draft-and-keys.test.ts`、`tests/e2e/ssh/remaining.spec.ts`、`tests/e2e/workflows/ssh-workspaces.spec.ts`。
- A04 临时工作区与固定模板共用主机查找，支持跨子组过滤与地址/用户/标签搜索，保留已加入主机及顺序。模板列表加入主机数与布局摘要。新增主机时拆分最后一个叶子，移除时折叠相应分割，保留其他比例和方向。单测验证 12 栏通过结构 schema，移除新增分栏后复原原树。
- A04/A05 模拟绑定写入失败，断言没有已保存运行，三个回环端点均未接到连接。恢复正常写入后启动，在同次运行中核对交换、关闭及过时版本拒绝，保留其他 Shell，再核对重连代次和持久分栏身份。
- A06 内部标签提供具名 Tab 和 Panel、活动标签单一 Tab 停靠点、横向左右键、纵向上下键及 Home/End。焦点切换沿用原 Pane ID 与已挂载运行视图。桌面回归比对 SSH socket、终端 WebSocket 数和布局版本。独立 Web 场景从真实邀请加入后逐栏比对桌面原 Pane/Shell ID，并检查回环端点各只有一个 SSH 连接。

### 已运行的定向检查

验证命令串行持有 `/home/wta/projects/huhu/temp/dev/verify.lock`，使用 `volta run --node 24.22.1`。日志见 [task09 运行目录](../../../../../temp/dev/2026-11-24-issue-inventory/runs/t1tw/task09)。本次复用既有 vendor 类型产物。

| 命令后半段 | 结果 |
| --- | --- |
| `pnpm --filter @huhu/plugin-ssh run typecheck` | S2、S3 各退出 0 |
| `pnpm exec vitest run plugins/ssh/test/directory.test.ts` | 3/3 |
| `pnpm exec vitest run plugins/ssh/test/draft-and-keys.test.ts` | S2 8/8，S3 9/9 |
| `pnpm exec vitest run plugins/ssh/test/workspace-device-layout.test.ts` | 4/4 |
| `pnpm exec vitest run plugins/ssh/test/terminal-runtime.test.ts` | 6/6 |
| `pnpm exec vitest run plugins/ssh/test/task09-input-contract.tmp.test.ts` | 1/1，临时复现文件已回收，日志保留 |
| Playwright `--list`，按以下用例筛选 | 枚举 4 个文件的 13 项 |

### Lead 运行的 Playwright 场景

- `tests/e2e/ssh/host-records.spec.ts` — 「A01 SSH 主机目录在桌面和 Web 按账号标签筛选，网格保留选区并移动所选」「A01 SSH 目录右键保留选区，手动排序与部分删除可回读」。
- `tests/e2e/ssh/remaining.spec.ts` — 「SSH 密钥库生成公开摘要，草稿测试可达后由字段修改清除」「交换、最大化和关闭 SSH 分栏时，其他分栏保留原会话」「H5.3 回放已停止的录制，可暂停并按时间定位，切换 Shell 保持隔离」「H3.2 路由页批量关联、覆盖与启停，旧 Shell 保留原连接路径」「H5.2 终端工具栏移动与设备偏好不重连，纵向按同目标分组」「A06 独立 Web 通过键盘切换 SSH 标签，保留桌面原分栏会话」。
- `tests/e2e/ssh/shortcuts.spec.ts` — 「快捷文本排序持久化，预览仅向显式选定的可输入分栏交付」。
- `tests/e2e/workflows/ssh-workspaces.spec.ts` — 「H4.1 工作区模板保存顺序与自定义布局，跨应用重开并删除」「H4.2 临时运行独立信任和认证，重挂与重连保留分栏归属」「H4.2 绑定写入失败零拨号，已删除和身份变更有各自分栏」「H6.1 附属文件跟随活动分栏，独立双栏保持原连接和单独目录」。

## 阻碍与接续

- S2 余项 — A01 对未保存 SSH 目标的快速连接仍缺可回收的临时连接和交互入口。A03 的 ProxyCommand/ViaShell 仍待实现。暂停快照只有本机执行器样本，当前的代理配置与路由模型没有持久批准和远端中继传输接线。先确认两者各自的批准、绑定、取消和关闭边界，再按首跳和跳板后的单独回环路径取证。A01 的完整身份格式和高级认证字段继续按 S1 差距表核对。
- S3 余项 — 运行中按指定分隔线拖动比例、扩充分栏和完整标签菜单仍待接线。跨窗口交接依赖当前宿主的视图移交、单控制权与关闭回滚；先沿已有工作区运行和终端控制 API 接续 `f80be2f2`、`858564a5` 的可复用部分。实时滚屏文本搜索和链接、真实全屏与中文 IME、独立 Web 输入/广播及本机终端在 Agent CLI 停用时的实际行为仍需各自取证。
- 未运行项 — Linux Electron、独立 Web 的实际 Playwright E2E，真实远端 SSH 主机和外部代理服务，构建、打包、全仓检查与截图。术语「回环」指本机受控夹具。Windows/macOS 依本批约定沿用历史结论。

## Lead 验收
- Lead 2026-11-25：合入 main 30406c46；SSH 27/29，派 task10。
