# 派发回执

- 共享根 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory
- terminal_address — t1ht
- task — task08.md
- 任务文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/t1ht/task08.md
- 回执文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/t1ht/report08.md
- 业务验收报告 — /home/wta/projects/huhu/.agents/dev/changes/2026-11-24-issue-inventory/evidences/{068-p1,087-p2}.md
- 执行结果 — done

## 成果与运行指针

工作目录 `/home/wta/projects/huhu/.agents/dev/worktree/inv-w2`，分支 `inv/w2`，基线 `d93fefb2`。两个提交依票据顺序落地，工作树干净，整批 `git diff --check` 通过。

### 068-p1 · 本地 stdio 来源与唯一 HTTP MCP 入口

- 提交 `a57b3964b39a4f676399684608e1e23ad6e7a73a`。
- `packages/kernel/src/mcp-sources/{index,store,runtime,catalog}.ts` 实现独立的 `mcp` 内置管理插件、静态描述符、manifest、Vault 配置和本机许可。复用 SDK 1.32.2 与 Magpie 上游映射里的来源作用域，沿用 Huhu 的 Dispatcher 和 VaultFiles。为遵守依赖锁文件约束，插件作为 `@huhu/kernel` 内的公开入口注册，未创建额外 workspace 包。
- `apps/engine/src/boot.ts` 装配插件，`packages/kernel/src/{mcp,server/mcp-http,server/http-app,capabilities/system,index}.ts` 接入现有唯一 `/mcp`。外部工具使用真实 HTTP 会话主体、发送前权限和配置代次复核，原生结果与内置 Dispatcher 信封各自保留。
- 新来源默认停用。stdio 本机许可绑定配置指纹、当前 Vault 实例与机器，临时检查会释放子进程。仅关闭 HTTP 对外服务时仍可管理来源和显式检查。关闭整个插件时释放 handler 和运行对象，重新启用管理插件后 HTTP 服务仍关闭。
- 管理沿用 Gateway 的「测试台」。在「能力网关 → MCP → 测试台」依次调用 `mcp.sources.create`、`mcp.executionApproval.preview/confirm`、`mcp.sources.check`、`mcp.catalog.list`、`mcp.policy.update`、`mcp.sources.setEnabled` 可复查完整路径。正式管理页面等待用户确认已有原型。
- `flock /home/wta/projects/huhu/temp/dev/verify.lock volta run --node 24.22.1 pnpm exec vitest run packages/kernel/test/mcp-sources.test.ts` 在该提交前通过 2 项，日志 `p1-sources.log`。
- 需 Lead 运行 `tests/e2e/workflows/mcp-aggregation.spec.ts` 的「P1 Gateway 添加本地 stdio、检查并开放 echo，重开 Vault 后公开名稳定」。本票定向单测使用 `tests/fixtures/mcp-stdio.cjs`。

### 087-p2 · 多传输、导入、目录与即时撤权

- 提交 `ff2ce91434c2e92eee0273f7bfd63a6e85a97c44`。
- `packages/kernel/src/mcp-sources/{transport,import,index,store,runtime,catalog}.ts` 加入 SDK Streamable HTTP 与旧 HTTP+SSE，保留显式传输与独立诊断、URL 目标约束和环境引用。JSON 导入先给脱敏预览，再按来源集/条目修订提交。新增来源或导入覆盖后的配置处于停用状态，提交失败后可以重试；含明文凭据的条目被阻止提交。脱敏导出保留可再导入的环境引用或需重新绑定的认证标记。
- 精确路由按来源 ID、稳定命名空间与上游原始工具身份建立。发布后的公开名保留占用，支持同名、含双下划线、非 ASCII 和超长名称；重排和改名无需重启连接。目录分页设有条目、页数和体积上限，并检测重复游标；逐来源发布完整快照。更新完整工具定义或策略时，现有 HTTP SSE 流可收到 `notifications/tools/list_changed`，客户端用旧缓存名调用仍会被复核。
- `packages/kernel/src/{mcp,server/mcp-http}.ts` 保留内置工具和回执语义，新增外部原生结果、目录变化与冲突键阻断。`apps/engine/src/boot.ts` 提供当前唯一入口用于防止直接回接。`apps/engine/test/capability-catalog.test.ts` 补真实 Engine 的停用/重启管理控制面检查。
- 需 Lead 运行 `tests/e2e/workflows/mcp-aggregation.spec.ts` 的「P2 导入三个本地来源、聚合同名工具、刷新分页目录并即时撤权」。Playwright 与单测共用 stdio 夹具和只绑定 `127.0.0.1` 的 SDK HTTP/SSE 夹具 `packages/kernel/test/fixtures/mcp-upstream.ts`。

### P2 定向验证

每条命令单独持锁，启动前可用内存约 21.8–21.9 GiB。检查了各级 cgroup 及相关卷，磁盘可用约 141 GiB，磁盘与 inode 使用率为 50% 和 15%。日志位于 `/home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/runs/t1ht/task08/`。

| 命令 | 结果 | 日志 |
| --- | --- | --- |
| `flock /home/wta/projects/huhu/temp/dev/verify.lock volta run --node 24.22.1 pnpm exec vitest run packages/kernel/test/mcp-sources.test.ts` | 5 项通过。覆盖三种本地传输、原生多媒体结果、写入失败重试、过期预览、Vault 隔离、只读、重复游标、改名、目录通知和即时撤权。 | `p2-sources.log` |
| `flock /home/wta/projects/huhu/temp/dev/verify.lock volta run --node 24.22.1 pnpm exec vitest run packages/kernel/test/mcp-routing.test.ts` | 14 项通过。 | `p2-routing-regression.log` |
| `flock /home/wta/projects/huhu/temp/dev/verify.lock volta run --node 24.22.1 pnpm exec vitest run packages/kernel/test/mcp-recovery.test.ts` | 3 项通过。 | `p2-recovery-regression.log` |
| `flock /home/wta/projects/huhu/temp/dev/verify.lock volta run --node 24.22.1 pnpm exec vitest run apps/engine/test/capability-catalog.test.ts` | 4 项通过。本批新增用例核对显式停用关闭入口、静态目录保留以及重新启用管理。 | `p2-engine-catalog.log` |

## 阻碍与接续

- 无派发交付阻碍。待 Lead 串行检查 `@huhu/kernel` 和 `@huhu/engine` 类型并执行上面两条 Playwright 用例。worker 未运行项目 E2E、类型检查、构建、打包、全仓 lint、knip 或截图。
- 未验证独立 Web 工作台的来源管理、真实外网 MCP 服务或 Provider、OAuth、生产 CI 和多级子进程回收。验收中的本地 HTTP/SSE 均使用回环夹具。四类目录的真实聚合、静态秘密存储和 OAuth 仍属于 P3/P4，完整重连和回收证据归 P5。
- 现有 Gateway 测试台用于本批管理流程。正式来源页面继续沿用 task07 待确认的原型范围。

## Lead 验收

- Lead 2026-11-25：P1/P2 通过（类型修复 e9bc46fb 已合入）。清单转 task09。
