# task02.md #6 G3.4 扩展命令逐项映射与 caller 传递

## 定位

- 共享根、topic、manifest 同 task01。terminal_address — `t1k`（执行终端 `t1y`）。
- 任务文件 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t1k/task02.md`
- 报告文件 — `/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t1k/report02.md`
- 工作目录 — `/home/wta/projects/huhu/temp/issue-worktrees/agent-linux`，**新分支** `impl/huhu-issues-3-10-g6-extensions`，HEAD `499427be`（集成最新：已含你的 task01 `438f4281`、P8.3、审查返工）。
- 接续依据 — task01 已由 Lead 验收合入（`1aa5f3b9`）。

## 目标与输入

实现 t19 报告「扩展命令的逐项映射与 caller 传递（G3.4）」全段（`t19/report01.md`，含“已核对的行为”、三条示例映射表与第 1–5 点）。要点：

1. 扩展 manifest 声明每条命令的 owner、commandId、title、description、输入/输出 schema、scope、risk、重试语义及依赖；规范名 `extensions.<pluginId>.<commandId>` 与派生 MCP 名同时查重，冲突或超长拒绝整份声明；`CapabilityRegistry.declareDescriptors` 让插件停用时仍保留描述；新命令默认关（`defaultExposed: false`）。
2. 直接调用与 `plugins.commands.run` 解析到同一 command descriptor；一次授权不能解锁整个插件。
3. 每次命令调用建立短时调用委托（原 actor/subject — 复用 task01 的会话身份、插件 ID/激活代、Vault 实例、命令 ID、parentOperationId、截止时间、signal）；IPC 只给不可猜的一次调用句柄；子调用权限 = 原主体对具体命令与最终目标的当前授权 ∩ 扩展已获权限；命令执行环境移除无上下文的进程级 `api.call` 回落路径（插件生命周期操作另行区分）。
4. 复合写在首次副作用前落父意图，子步骤用稳定派生意图；并发调用的上下文分别绑定。
5. 更新 `examples/plugins/{daily-review,portable-export,quick-clip}` 的 manifest 与 `main.mjs` 到新声明。

插件安装/停用生命周期里注册/清除描述与 handler 的 `apps/engine/src/boot.ts`（约 459 行扩展注册）接线由 Lead 做；同 task01，必要的最少行可放在候选里并在报告单列。需改插件中心工作台 UI 时先停下报告，由 Lead 指定写入者。

## 读写范围与产物

- 可写业务范围 — `packages/kernel/src/capabilities/external-plugins.ts`、`packages/kernel/src/plugins/**`、扩展 manifest 专有 schema（`packages/contracts` 中仅限扩展 manifest 与命令委托所需的类型）、`examples/plugins/**`、对应测试；task01 的会话/dispatcher 文件仅限为命令委托验权必须的最小接口扩展。#6 证据 `evidence/G3.4-extension-commands-linux.md`。
- 禁止改动 — 其他插件业务、Vault 包收集器、根锁文件、工作台 UI。不 push，不启动子 agent，不碰真实 Vault/凭据。
- 预期产物 — 候选提交（临时索引方式，父 `499427be`）、证据、报告。

## 验收与验证

- t19 G3.4 第 5 点：同一测试扩展直接与经代理各调两条命令、只开一条；分别撤具体命令、撤下游工具、撤插件 grant、停插件、换库、改 schema 并重连，旧名字与未完成的下一步均须复权；记录 handler 收到的 actor/subject/Vault 与实际写入计数；停用时仍可预配，更新后新增命令默认关。CLI 与 HTTP MCP 两个入口各跑。
- `pnpm typecheck`、`pnpm lint`、`pnpm format:check`、`pnpm knip`、相关 vitest（`--maxWorkers=1`）通过；全量一律 `flock /tmp/huhu-fulltest.lock pnpm test -- --maxWorkers=2`（另有一名实现者共用这把锁）。
- 报告格式与发布方式同 task01；发布后打印报告绝对路径并停下。
