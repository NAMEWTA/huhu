# Huhu 工作台（总体）

核对：2026-11-13，main（8283c5c，领先 origin 2 个提交），对照目录结构、`packages/kernel`、`packages/workbench`、`scripts/`、`.github/workflows/`。

## 这部分负责什么

Huhu 是以本地 Vault（Markdown 为唯一事实来源）为根的桌面工作台：笔记、任务、档案、收件箱、保险箱、SSH、Agent CLI、自动化、版本与同步，外加 CLI 和 MCP 入口。0.0.1 的完整规格、决定和实施记录归档在
[`feature_2026-11-09-huhu-workbench-definition`](../../archive/changes/implemented/feature_2026-11-09-huhu-workbench-definition/README.md)；
其中 `decisions.md` 是 D-01…D-43 的完整台账（理由与否决做法），下面只列仍会约束后续开发、且容易踩错的部分。

## 从哪里读代码

| 问题 | 入口 | 需要知道的约束 |
| --- | --- | --- |
| 业务调用怎么进来 | `packages/kernel/src/dispatcher.ts`、`capabilities/*` | 渲染进程、CLI、MCP、外部插件都走 Engine 回环 HTTP/WS 的同一 Dispatcher（鉴权→插件启用→校验→幂等→执行→审计）；Main↔Renderer IPC 只做系统对话框、窗口、外链 |
| 插件怎么贡献界面/命令/首页卡片 | `packages/workbench/src/contributions.ts`，各 `plugins/*/src/ui/index.tsx` | `homeWidgets` 卡片 id 形如 `widget:<插件>:<卡片>`，布局存 `.huhu/home/widgets.json`；内置卡片仍由首页渲染（D-37） |
| 列表为何不刷新 | `packages/workbench/src/engine-client/query.ts` 的 `ENTITY_CAPS` | 引擎发 `entity.changed`（kind）→ 失效哪些查询前缀由这里映射；新增实体种类必须同时发事件并登记，否则 5 秒 staleTime 内是旧数据 |
| 版本号 | 根 `package.json` + `scripts/sync-version.mjs --check` | 单一来源；release 工作流要求标签等于该版本，rc 后缀可用（D-32/D-35） |
| UI 样式与组件 | `packages/ui/src/styles/proto/`、`components.css`、`packages/ui/src/components` | 原型 CSS 原样复制，`components.css` 只补缺失类；Radix + 薄封装，不用 Tailwind（D-31）；数据表一律 `DataTable`（D-39/D-43） |
| 全文索引 | `packages/vault/src/index/vault-index.ts` | `node:sqlite` FTS5 内存库（D-34）；“清除搜索索引”只清 FTS（D-41） |
| 状态目录 | `Vault.stateDir` | 通常 `<vault>/.huhu`；只读且不可写时在系统临时目录。插件状态路径一律用 `vault.stateDir`，不要手拼 `<root>/.huhu` |

## 后续修改必须知道的事实

- **被取代的决定**：D-07“不用 SQLite”被 D-34 取代（内存常驻要求 ≤ 600 MiB，Orama 做不到）；D-17 里的 Tailwind/shadcn 被 D-31 取代；D-06 里的 `health` 插件被 D-40 取消（健康检查在 kernel `capabilities/health.ts`，界面在外壳 `packages/workbench/src/health`）；“首版 1.0.0”被 D-32 取代为 0.0.1。读 `decisions.md` 时先看这些后继。
- **有意不做**：多窗口/“在新窗口打开 Vault”（D-36，单实例锁 + 一 Vault 一 Engine）；应用级数据库与跨会话最近 Vault 列表（D-26）；签名/公证/自动更新（D-25）；多语言（D-28）。
- **写入**：单 Vault 单写者锁；单文件原子写；多文件操作走 `.huhu/operations/` 日志，数据页“未完成操作”读 `vault.pendingOperations`，关闭/切换 Vault 前有未完成操作必须先备份。
- **测试位置**：单元测试在各包 `test/`；e2e 在 `tests/e2e`（`acceptance.spec.ts` 对应规格 ACC-*）；CI 为 `.github/workflows/ci.yml`（windows-2022 / macos-15 / ubuntu-22.04），发布为 `release.yml`（草稿预发布）。

## 仍然未知（0.0.1-rc.2 归档时）

- 三平台真机验证（Windows/macOS 实机，仅 CI 与 Linux 本机跑过）；8 小时 soak；KN-03 / SF-07 / AG-06 手动记录；VS-05 / VS-08 真实远端。
- 编辑输入延迟 p95 ≤ 16 ms：非空闲机器上 13.0–16.4 ms，负载下 43.9 ms；需在空闲机器上正式测一次。
- rc.2 草稿 Release 未发布；之后的两个提交（清除搜索索引等）未推送，不在 rc.2 中。
