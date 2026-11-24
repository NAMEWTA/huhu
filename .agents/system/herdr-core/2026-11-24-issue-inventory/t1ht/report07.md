# 派发回执

- 共享根 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory
- terminal_address — t1ht
- task — task07.md
- 任务文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/t1ht/task07.md
- 回执文件 — /home/wta/projects/huhu/.agents/system/herdr-core/2026-11-24-issue-inventory/t1ht/report07.md
- 业务验收报告 — /home/wta/projects/huhu/.agents/dev/changes/2026-11-24-issue-inventory/evidences/{020-l0a,021-l0b,019-p0}.md
- 执行结果 — done

## 成果与运行指针

工作目录 `/home/wta/projects/huhu/.agents/dev/worktree/inv-w2`，分支 `inv/w2`，基线 `825b0c0327954680c1133a4307730db5e94b33ca`。三个提交按票据顺序落地。工作树干净，整批 `git diff --check` 通过。原型及审阅记录位于工作树内的 `.agents/dev/changes/2026-11-24-issue-inventory/`。

### 020-l0a · 账本领域与来源（#11）

- 提交 `037147b893a15f8ff118bf2ce5b6817c32b96970`。
- HomiBook v1.2.4 固定为 `5d3d71713de805c95245378408b73f101f69659a`，在 `temp/sources/homibook` 固定至 `refs/huhu-research/issue11`。根 LICENSE 为 MIT（saaangxy）。`docs/upstream/ledger.md` 逐文件记录数据、余额、平账、备份和定时规则的上游行为及 Huhu 适配。
- `packages/contracts/src/{ledger,index}.ts` 共用币种精度、最小单位字符串及 BigInt 运算，冻结账户、余额基准、流水、平账、失效引用与确认输入。区分账本业务日、来源日期、来源时区和夏令时歧义。共享合同先放在已接入的 `@huhu/contracts`，由 L1 的账本插件消费。精度表冻结 44 种币种，未知币种按待决处理。
- `flock /home/wta/projects/huhu/temp/dev/verify.lock volta run --node 24.22.1 pnpm exec vitest run packages/contracts/test/ledger.test.ts` 通过 13 项。日志 `ledger-contract.log`。
- 本票无新增项目 E2E。待 Lead 类型检查 `@huhu/contracts`；真实写入、迁移、报表与恢复属于后续账本切片。

### 021-l0b · 账本核心旅程（#11）

- 提交 `dcce110b6e91608a2651d7cc3d0ec656ab6e9102`。
- 可打开入口 `prototype/ledger/index.html`，固定版本与交互记录 `prototype-review-ledger.md`。资源共 12 文件，SHA-256 `3cb524336845bb8f6d2e4fea306b6bd00c39d0ca7ff16988edcdd91603efb940`。
- 走查覆盖建账、币种精度与保存重试、CSV 映射/待决/重复和过期预览、跨日来源、精确平账及撤销、按币种下钻、固定收支及贷款先预览后确认、恢复依赖及失败重试、保留原账本、只读限制。CSV 使用本地 d3-dsv 3.0.2（附 ISC 许可）；支付渠道、贷款拆分与备份为模拟样本。
- 离线浏览器 5 组通过。日志与结果为 `ledger-browser.log`、`ledger-browser.json`。本票无新增定向单测或项目 E2E。

### 019-p0 · MCP 来源与路由（#12）

- 提交 `15b9b6b8c22dca551e8a2466ddc566215ce508d8`。
- Magpie v0.1.4676 固定为 `700f4127e8044ac6dfbb0e0cc937e91c59a601ac`，在 `temp/sources/magpie` 固定至 `refs/huhu-research/issue12`，根 LICENSE 为 MIT（yetone）。来源台账记录 Magpie 实际源文件与测试、已有 SDK 1.32.2 和其他上游拟迁移点。不引入 Go 源码或额外运行依赖。
- `packages/contracts/src/{mcp-routing,index}.ts` 定义 source/config、认证绑定、导入确认、route/policy、目录代次、本机许可及管理 scope/risk/错误表；`packages/kernel/src/mcp-routing.ts` 消费合同，按精确键查找并在网络发送前复核。样例的 `vault_info` 由真实 Dispatcher 核验，`repo__search` 由隔离夹具返回 SDK 原生结果。授权撤销对载入缓存及等待准备的调用生效，恢复会话禁止外部工具发送。当前出口接线和真实来源 Runtime 属于 P1。
- `flock /home/wta/projects/huhu/temp/dev/verify.lock volta run --node 24.22.1 pnpm exec vitest run packages/kernel/test/mcp-routing.test.ts` 通过 14 项。日志 `mcp-routing.log`。
- 原型入口 `prototype/mcp/index.html`，协议矩阵、管理表、数据所有者、交互与 P1–P7 验收分工在 `prototype-review-mcp.md`。资源共 10 文件，SHA-256 `35b160139f464a78f2473e07b49bd1c029e0a111f7cfe876d854871a40f954fe`。
- 离线浏览器 5 组通过，覆盖来源添加和执行许可、JSON 冲突/敏感字段/提交重试/脱敏导出、OAuth 过期与注销、四类目录、即时撤权、失效、离线、只读和无权限，及仅关闭对外服务时保留管理。日志与结果为 `mcp-browser.log`、`mcp-browser.json`。
- 本票无新增项目 E2E。待 Lead 类型检查 `@huhu/contracts`、`@huhu/kernel`。后续聚合 E2E 拟用 `tests/e2e/workflows/mcp-aggregation.spec.ts`，场景与归属见 P1–P7；本票未创建该 spec。

### 验证原件

- 定向单测逐文件持共享锁执行。启动前可用内存达 12 GiB 门槛，资源卷可用约 141 GiB，磁盘／inode 使用 50%／15%。
- 浏览器沿用 task06 的本地文件走查，Playwright 1.65.0 / Chromium 158.0.8127.18 单进程依次打开 1440×1000 浅色、390×844 深色视口。10 组通过，非本地请求、页面异常、资源加载失败和横向溢出均为零。运行命令 `HUHU_WALK_REPORT=ledger-browser.json volta run --node 24.22.1 node <原件目录>/walkthrough.cjs ledger`，MCP 同一命令使用 `mcp-browser.json` 和 `mcp`。两份资源指纹经 `fingerprint.mjs --expect` 复核匹配。
- 证据目录 — /home/wta/projects/huhu/temp/dev/2026-11-24-issue-inventory/runs/t1ht/task07/

## 阻碍与接续

- 无交付阻碍。两份审阅记录的「用户确认」已留空，由 Lead 转交对应指纹版本。
- 未运行项目 E2E、包级或全仓类型检查、构建、打包、全仓 lint、knip 或截图。Electron/Web 产品入口、真实账单源及恢复写入、外部 MCP 进程/网络、OAuth、生产 Agent provider 与 CI 尚未验证。离线浏览器结果用于原型交互确认。

## Lead 验收

- Lead 2026-11-25：L0a/P0 合同通过，L0b/P0 原型指纹复核一致，待用户确认。清单转 task08。
