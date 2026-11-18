# 验证方案

> 规格：[spec.md](spec.md) §5、§7。计划：[plan.md](plan.md)。本文只定义**怎么证明**，不记录结果；结果与证据在各切片的 `evidence/sN/` 与 [progress.md](progress.md)。
> 原则：行为用真实入口证明（Electron）；静态检查只证明静态结构；**拟新增的测试 / 脚本是创建工作，不冒充已可运行**；缺少环境的项写“未验证”。

## 1. 验证层与适用范围

| 层 | 工具 / 命令 | 证明什么 | 不能证明什么 |
| --- | --- | --- | --- |
| 单元 | `pnpm test`（vitest） | 解析 / 序列化、会话状态机、`hostFetch` 路由与错误映射、隐藏规则、路径、锚点适配、`LocalDocProvider` 契约、`DocTab` reducer、扩展名 / 图标映射 | 真实选区 / IME / 滚动 / 焦点 |
| 上游测试 | `pnpm test:vendor`（独立 vitest 项目，jsdom；OP-D16） | OK 编辑器 / core / 评论 / 文件树 / 属性面板在适配后仍满足上游断言 | Huhu 宿主集成；jsdom 无法覆盖的真实渲染 |
| 集成 | vitest + 真实 Vault 临时目录（Engine 能力） | `vault.list` / `vault.readRange` / `notes.*` / `comments.*` / `archives.*` 在真实文件系统上的行为、失效与事件 | UI |
| 真实 Electron E2E | `pnpm e2e`（Playwright Electron，`tests/e2e/knowledge/*` 新增 + 既有） | 选区、键盘、菜单、滚动、标签、焦点、PDF / HTML、保存重开、贯穿路径 | 真实输入法、Windows / macOS 差异（本环境） |
| 打包后 E2E | `pnpm e2e:packaged` | 打包产物里编辑器 chunk / worker / 协议 / 资源路径正确 | 同上 |
| 视觉 | `pnpm visual:baseline rc4`（S0）/ `pnpm visual:compare rc4` | 非知识库屏幕无回归；知识库屏幕的预期变化被登记；四主题 × 明暗 × 宽度 | 行为 |
| 性能 / 泄漏 | `pnpm bench` + 专项脚本 | F09 / F10 / G07 / H05 / H06 的数字 | 主观流畅度 |
| 安全用例集 | Playwright + 恶意夹具（HTML 页、符号链接、`../` 路径） | F05：隔离与路径守卫 | 零日漏洞 |
| 脚本守护 | `pnpm lint`（含 `check-ok-class-collisions`）、`ok-patches` 重放、`ok-closure` | G02、H02 | — |
| 对照 OK 基线 | 本地运行 `temp/sources/open-knowledge`（S0 记录运行方式）+ 同一样本 / 同一操作序列录屏 | “复刻”的逐项等价或登记的差异 | 官方未来版本 |

## 2. 验收 → 验证归属

| 验收 | 主要验证层 | 具体入口（拟新增 = 创建工作） |
| --- | --- | --- |
| A01 全文件可见 | 集成 + E2E | `plugins/notes/test/resources.test.ts`（拟）、`tests/e2e/knowledge/explorer.spec.ts`（拟） |
| A02 / A03 / A04 隐藏与 `@` | 单元 + E2E | `hiddenPaths.test.ts`（拟）、explorer.spec（重启持久化、10 万文件夹具下 `@`） |
| A05 空目录与失效 | 集成 + E2E | resources.test（自写 / 外部 / 空目录）、explorer.spec |
| A06 / A07 / A08 菜单与操作 | E2E | explorer.spec（右键各目标、键盘一致性、边缘翻转、冲突 / 自身后代 / 越界、脏文档 flush） |
| A09 计数 | 单元 + E2E | `counts.test.ts`（拟）、explorer.spec |
| A10 受保护 | 集成 + E2E | resources.test（`protected`、MCP / CLI 不泄露内容）、explorer.spec |
| B01 复刻矩阵 | 文档审查 + `test:vendor` | `evidence/parity-matrix.md` 的每行有测试 / 对照记录；审查人逐项勾 |
| B02 / B10 渲染与保真 | 单元 + `test:vendor` + E2E | 黄金样本往返（H01）、编辑 / 阅读 / 重开语义一致 e2e、无编辑不写盘（mtime 断言） |
| B03 / B04 / B05 `/` 与输入法与撤销 | `test:vendor` + E2E | 对照 OK 基线；模拟组合事件回归；一次撤销断言；**真机 IME 未验证** |
| B06 / B07 选区 / 上下行 / 列表 / 表格 / 剪贴板 | **真实 Electron E2E** | `tests/e2e/knowledge/selection.spec.ts`、`blocks.spec.ts`（拟）；S0 复现脚本作为回归用例 |
| B08 不重建 / 不抢焦点 | E2E | 编辑器实例标识 + 焦点元素断言（自动保存 / 评论刷新 / 属性变更期间） |
| B09 模式切换与迟到结果 | E2E + 单元 | 切视图保留内容与位置；`epoch` 丢弃迟到结果的单元测试 |
| C01–C05 属性 | 单元 + E2E | frontmatter 黄金样本（C02 全清单）、双向编辑顺序用例、坏 YAML 用例 |
| C06 保存与冲突 | 单元 + E2E | `DocumentSession` 状态机（回执只清对应 `dirtyRevision`）、冲突 / 只读 / 磁盘失败 / 外部修改 / 切 Vault flush 的 e2e |
| D01–D06 评论 | 单元 + E2E + `test:vendor` | `comment-field-map` 适配单测、锚点黄金用例（重复段落 / 前插 / 表格 / 链接 / 歧义 / 删除）、e2e（选区发起 / 定位 / 回复 / 解决 / 删除确认 / 只读 / 重命名后仍绑定） |
| E01–E05 档案 | E2E + 单元 | `docTabs` reducer、tabs e2e（点击 50 次无抖动）、同一会话编辑一致 |
| F01 / F02 JSON / TXT | 单元 + E2E | 编辑写回重开一致、无效 JSON 不清空、BOM / CRLF / 非 UTF-8 / 大文件 |
| F03 PDF | E2E + 样本 | 样本集：小 / 大于 10 MiB / 加密 / 损坏 / 外部修改；查找 / 缩放 / 选择 |
| F04 / F05 HTML | E2E + 安全用例集 | 代表页面（head / style / body / 相对资源 / 含脚本）；恶意页（`fetch`、XHR、`import()`、`postMessage`、`top` 导航、`file://`、`../`、符号链接逃逸） |
| F06 图标 | 单元 + E2E | 扩展名表（大小写 / 无扩展名 / 未知 / 目录）；网络断言（无在线请求） |
| F07 / F08 布局与主题 | E2E 截图 + 视觉 | 宽度 × 缩放 × 内容组合；四主题 × 明暗 × compact × reduced-motion |
| F09 性能 | bench + 专项 | 冷开 / 热切换 / 输入延迟 / 保存耗时 / 内存，p50 / p95，记录机器与样本 |
| F10 / H06 泄漏 | 专项脚本 | 开关 200 次后编辑器 / Y.Doc / observer / worker / Object URL / iframe 计数 |
| G01–G07 | 脚本 + CI | `ok-closure`、`ok-patches` 重放零差异、`pnpm notices`、`test:vendor` 结果表、`git grep` / knip、全门禁、体积与启动数据 |
| SP-6 运行时闸门（S0） | 真实 Electron | 脚本化：挂载 → 两文件来回切（park / evict）→ 切源码 → 撤销 → 无编辑不写盘 |
| H01 往返 | 单元 | 22 个 OK 样本 + Huhu 样本，字节相等；无编辑不写盘 |
| H02 样式作用域 | 脚本 + 视觉 | 层序检查、碰撞脚本、`visual:compare rc4` |
| H03 `zh-Hans` | 脚本 + E2E | 未翻译 msgid 扫描、切换语言即时生效 |
| H04 宿主适配 | 单元 | 路由表覆盖断言（vendor 中每个调用点 ↔ handler 或不适用登记） |
| H07 局部编辑只产生局部字节差异 | 单元 + E2E（git Vault） | 长文样本改一个字 → `git diff` 只含该处；首次编辑同样 |
| H05 紧凑变体 | E2E + bench | 任务描述 / 收件箱想法的输入、保存、`@`、撤销、输入法；每实例成本 |
| 贯穿路径（spec §1） | E2E | `tests/e2e/knowledge/journey.spec.ts`（S8） |

## 3. 样本与夹具（创建工作，S0 / 各切片落地）

- **黄金样本**：OK `core/src/markdown/fixtures`（22 文件、7.5 MB）；Huhu 的 `Tasks/`、档案 `index.md`、评论文件、含 frontmatter 全清单（C02）、BOM / CRLF、MDX / HTML / 引用定义 / 脚注 / 注释 / 表格细节。
- **大 Vault**：≥ 10 万文件夹具（脚本生成，不入库）用于 A04 / F09；含空目录、点目录、符号链接（循环 / 越界）、Unicode / 空格 / 大小写冲突路径。
- **查看器样本**：PDF 小 / 大（> 10 MiB）/ 加密 / 损坏；HTML 代表页与恶意页；JSON 合法 / 非法 / 巨大；TXT 多编码。
- **S0 复现脚本**：把用户的“选区 / 上下行”问题固化成 Playwright 步骤，既用于 rc.4 复现，也作为新编辑器回归用例。

## 4. 对照 OK 基线的方法

1. S0 记录本地运行 `temp/sources/open-knowledge` 的方式与版本（SHA `44a2e0a`；运行时依赖不可用则在 `evidence/` 说明并改用其浏览器 dev 构建，未核实）。
2. 同一份样本文档、同一操作序列（`parity-matrix.md` 的每个功能一条脚本化步骤），在 OK 与 Huhu 各执行，输出：截图 / 录屏、最终 Markdown 文本、关键 DOM 状态；差异登记 `evidence/parity/<feature>.md`，分类“等价 / 已登记差异（原因）/ 未对齐（待修）”。
3. “已登记差异”必须逐项写：原因、源文件、目标文件、验证证据（issue 评论 §3 的要求），不得以“本地化 / 架构简化”笼统带过。

## 5. 数据与环境记录

每次验证记录：提交哈希、命令、退出码、通过 / 失败 / 跳过数、机器（OS / CPU / 内存）、Electron / Node 版本、样本版本。性能记录 p50 / p95 与样本规模。**以下无法在本环境完成，必须标“未验证”并说明补充办法**：真实输入法（微软拼音 / macOS 拼音 / 注音 / 日文）；Windows / macOS 的选择与快捷键差异；高 DPI 多显示器；OK 官方未来版本的行为。补充办法 = CI 三平台 e2e 子集（沿用现有 release 流程）+ 用户在真机上的验收清单（`evidence/manual-checklist.md`，S8 产出）。

## 6. 每个切片的门禁

每个切片结束前：`pnpm format:check`、`pnpm lint`、`pnpm typecheck`、`pnpm test` 通过；S2a 起加 `pnpm test:vendor`；涉及样式的切片加 `pnpm visual:compare rc4`；S2b、S8 加 `pnpm build` 与 `pnpm e2e`；S8 加 `pnpm e2e:packaged`、`pnpm knip`、`pnpm notices`、`pnpm bench`。按 `CLAUDE.md`，测试 / 类型检查 / lint 交由 `audit` 子代理在**隔离快照**上运行（`git add` 新文件 → `git stash create` → 把 SHA 写进 audit 提示）；宣布切片完成前咨询顾问。

## 7. 已知验证风险

- 上游 jsdom 测试（约 310 个 editor + core + 78 评论 + 34 树 + 21 属性）有一部分依赖 server / Hocuspocus，适配率未知（S2a 首版得出）；适配率过低时与用户商定缩减并登记，不静默跳过。
- Playwright 对 Electron 内 iframe（`huhu-preview`）与自定义协议的支持需要在 S7 早期验证；若有限制，安全用例改用 Electron 主进程侧断言 + 渲染进程侧网络监听。
- 对 OK 基线的并排对照需要它能在本机运行（依赖 Rust 工具链？`rust-toolchain.toml` 存在，是否影响浏览器 dev 构建：未核实）。
