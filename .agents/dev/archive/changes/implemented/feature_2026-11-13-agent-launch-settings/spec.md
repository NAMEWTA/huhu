# 规格：插件设置页规范化与智能体启动设置

> 状态：已定稿（2026-11-13 经顾问两轮复核）。需求与事实见 [brief.md](brief.md)，切片见 [plan.md](plan.md)。
> 项目约束：0→1，不做兼容层；旧数据格式与旧能力名直接替换。只有简体中文（D-28）。设置按 Vault 存（D-26）。

## 1. 术语

| 术语 | 含义 |
| --- | --- |
| 系统设置页 | workbench 内核自带、不随插件启停的设置页：外观、Vault、编辑器、日期时间、快捷键、数据、关于 |
| 插件设置页 | 由某个插件贡献的设置页。插件启用时出现，停用时消失 |
| 智能体目录（catalog） | `plugins/agent-cli/src/shared/` 中的一个纯数据数组。每一项完整描述一个智能体 CLI，界面与引擎都直接 import 它 |
| 智能体设置 | 用户对每个智能体的覆盖：启用、默认、命令、模型、Effort、速度、参数、环境 |
| 启动选项 | 一次启动时在新建菜单子菜单里临时选择的模型、Effort、速度、附加提示词，只影响这一次 |
| `resolveAgentLaunch` | 把“目录 + 智能体设置 + 检测结果 + 启动选项 + 模式”合成为一条启动命令的唯一函数 |

## 2. 设置框架

### 2.1 贡献点

在 `packages/workbench` 的 `ContributionRegistry` 增加一类贡献 `settingsPages`，复用现有的 `visible()` 插件过滤（`contributions.ts:90-92`，由 `PluginFilter` 驱动）：

```ts
interface SettingsPageContribution {
  id: string;            // 全局唯一，如 "agent-cli"、"agent-access"、"appearance"
  plugin: string;        // 贡献者插件 id；系统页为 "kernel"
  title: string;         // 中文标题，导航与页头共用这一处
  icon?: IconName;       // 省略时取该插件第一个模块的图标（ModuleIconsContext）
  order?: number;        // 同组内排序，默认 100
  component: ComponentType<SettingsPageProps>;
}
```

- 系统设置页也以 `plugin: "kernel"` 注册到同一个注册表。`SettingsModule.tsx:52-68` 的 `switch` 删除，改为按 id 查表渲染；`main.tsx:159-183` 中设置模块的静态 `sections` 删除。
- 插件页由插件的 UI 入口注册，和该插件的模块、首页小组件在同一处注册。
- 没有模块的插件（如 agent-guide）必须显式给 `icon`；缺图标时注册报错（开发期断言 + 单元测试）。
- 标题只在贡献里写一次，删除 `SettingsModule.tsx:14` 的 `TITLE` 表，消除它与 `main.tsx` 标签的不一致（例如“关于工作台”与“关于与来源”）。

### 2.2 导航

导航由 `AppShell` 渲染（现在读模块的静态 `active.sections`，`AppShell.tsx:73-76,147-152`，testid 也在这里生成）。改为：

- 设置模块激活时，`AppShell` 从注册表取 `visible()` 的设置页，分两组渲染：**系统**（固定顺序）与**插件**（按插件在插件中心的顺序，再按 `order`）。组标题为小号文字；插件组为空时整组不显示。
- 每一项显示图标与标题。宽度不足时（沿用 `packages/ui` `system.css:1724` 的 520 px 断点）只显示图标，悬停显示标题。
- **回退规则（通用）**：当前 `section` 不在可见列表里时，取列表第一项（修改 `AppShell.tsx:74`）。插件被停用、切换 Vault 后页不存在，都走这条。
- 导航项 testid 保持 `settings-nav-<id>`，现有 e2e 不需要改 id。

### 2.3 跳转

插件界面只拿得到 `ModuleProps.onNavigate(moduleId)`（`contributions.ts:9-15`、`AppShell.tsx:238`），拿不到 ui-store。因此：

- `ModuleProps.onNavigate` 增加可选第二个参数：`onNavigate(moduleId, section?)`。
- `AppShell` 实现跳转：设置 `activeModule` 与 `section`，**不走** `openModule` 的“目标已是当前模块就切换侧栏折叠”逻辑（`state/ui-store.ts:46`）。
- 目标 section 不在可见列表时：打开设置第一项，并 toast 一次“该插件未启用”。判断和 toast 都在 `AppShell` 内完成。
- 下文的 `openSettings(id)` 即 `onNavigate("settings", id)` 的简写。

### 2.4 清单与 UI 对齐

- 插件清单 `contributes.settingsPages` 保持字符串数组，内容必须等于该插件在 UI 中注册的设置页 id 集合。
- 新增单元测试遍历所有内置插件：清单声明而 UI 未注册、或 UI 注册而清单未声明，都判失败。
- 外部插件：本期不支持贡献设置页组件（非目标）。外部插件声明了 `settingsPages` 时，插件中心照常显示，设置导航中不出现。

### 2.5 现有页面与入口的调整

| 现在 | 调整后 |
| --- | --- |
| `agent-access`：workbench 写死，不随 agent-guide 启停 | 移为 agent-guide 插件的设置页。agent-guide 目前没有 UI 包（`src/ui/index.ts` 只有 `export {}`，`package.json` 不依赖 react / `@huhu/ui` / `@huhu/workbench`，desktop 也不依赖它），需补齐依赖、新建 `src/ui/index.tsx`、在 `main.tsx` 注册。`AgentAccessPage.tsx:70-77` 中处理 `PLUGIN_DISABLED` 的分支随之删除 |
| agent-cli 的设置对话框 `AgentSettings.tsx` | 删除，改为 agent-cli 插件的设置页（§7），其中的“重启 Herdr Core”一并迁入 |
| safe 模块内的“锁定设置”（`SafeModule.tsx:454-474`） | 移为 safe 插件的设置页；模块内原位置改为“设置”按钮 → `openSettings("safe")` |
| versioning 同步页的配置表单 | 远端、分支、凭据、同步模式、间隔、排除规则移为 versioning 插件的设置页；同步状态、预览、执行、冲突处理留在同步页。`sync-reconfigure` 按钮（`SyncPage.tsx:141,165`，现在聚焦 remote 输入框）改为 `openSettings("versioning")` |
| 状态栏的“快捷键”图标（`ShellBars.tsx:65`，现在 `open("settings")` 落到上次的分区） | 改为 `openSettings("shortcuts")` |
| 网关模块跳 agent-access（`GatewayModule.tsx:217-218`） | 改为 `openSettings("agent-access")`；agent-guide 停用时走 §2.3 的回退与提示 |
| 健康模块打开设置（`HealthModule.tsx:42-44`） | 改为 `openSettings("data")` |
| 插件中心“插件设置”按钮（`PluginCenterModule.tsx:279-281`，只能到设置首页） | 改为 `openSettings(<该插件第一个设置页>)`；插件没有设置页时不显示按钮 |
| 其他系统页 | 只换注册方式，内容不变 |

清单中其他不一致（`homeWidgets`、`commands`）不属于设置页，本期不处理，记入 [plan.md 的遗留项](plan.md#遗留项)。

### 2.6 存储

- 系统页继续写 `<vault>/.huhu/settings.json`。
- 插件页写各自插件的目录 `<vault>/.huhu/<plugin>/`，经该插件自己的引擎能力读写。本期不引入通用设置 store。
- 切换 Vault 后，所有设置页显示新 Vault 的值。

## 3. 智能体目录

### 3.1 形状

目录是**纯数据**（不含函数，可序列化），放在 `plugins/agent-cli/src/shared/catalog.ts`，界面与引擎都直接 import。新增智能体只需在数组里加一项；参数映射用带占位符的模板表达，由 `resolveAgentLaunch` 统一解释。

```ts
type ArgTemplate = string[];          // 占位符：{v} 选项值，{id} 会话 id，{uuid} 新会话 id
interface ModelOption {               // 沿用现有 providers/index.ts:7-12 的按模型建模
  id: string; label: string;
  efforts: string[];                  // 空数组表示该模型不支持 effort
  fast: boolean;                      // 该模型是否支持 fast
}
interface ConflictFlag {              // 用户参数中出现即视为与该启动选项冲突，见 §5.3
  match: "flag" | "flag=" | "config";  // flag：整项相等，如 "--model"
                                       // flag=：前缀，如 "--model=" 匹配 "--model=opus"
                                       // config：两元素写法，"-c"/"--config" 后一项以 key= 开头（也匹配 "--config=key=…"）
  value: string;                       // flag / flag= 时为标志；config 时为 key，如 "model_reasoning_effort"
}
interface OptionArgs { argv: ArgTemplate; conflicts: ConflictFlag[] }
interface AgentCatalogEntry {
  id: "claude" | "codex" | "pi";      // 以后扩展时加字面量
  displayName: string;
  homepage: string;                   // 设置页的“文档”链接
  detect: { command: string; versionArgs: string[] };
  launch: { command: string };        // 默认启动命令（单个可执行文件名）
  fullAccessArgs: string[];           // 默认参数，即“完全访问”
  options: {                          // 没有的项省略，界面相应隐藏
    models?: ModelOption[];
    model?: OptionArgs;               // 如 {argv: ["--model","{v}"], conflicts: [...]}
    effort?: OptionArgs;              // 如 {argv: ["--effort","{v}"], conflicts: [...]}
    fast?: OptionArgs;                // 打开时追加 argv；关闭时不加
  };
  interactive: {
    prompt: "positional" | "none";    // 附加提示词的传法
    resume?: { position: "prefix" | "option"; argv: ArgTemplate };
  };
  headless?: {                        // 省略表示不支持 headless
    prefix: string[];                 // 紧跟命令，如 codex ["exec"]
    argv: string[];                   // 跟在用户参数之后
    newSession?: ArgTemplate;         // 新会话指定 id，如 claude ["--session-id","{uuid}"]
    resume: { prefix?: string[]; position: "option" | "positional"; argv: ArgTemplate };  // 恢复会话
    prompt: "stdin" | "stdin-dash";   // stdin-dash：末尾追加位置参数 "-"
    trailing?: string[];              // 必须放在最后的可变参数选项
  };
  env?: Record<string, string>;       // 条目自带环境（现有 Provider env 迁入）
}
```

**安装目录**：不按条目放。照搬 orca `shared/node-cli-command-resolution.ts:~100-152` 的一份共用安装目录表（volta、mise、`~/.local/bin`、pnpm、bun、nvm 等），所有条目共用，放在 agent-cli 引擎内。

**图标**：在界面侧按 id 映射。复制 orca 的图标组件（`AgentIcon.tsx:29-40`；`ClaudeIcon`、`OpenAIIcon` 来自 `status-bar/icons`，`PiIcon` 来自 `agent-icon-glyphs.tsx`）；没有映射的 id 用首字母圆形图标兜底。

### 3.2 三个条目

数值来源与核对规则：现有 HUHU 行为（`providers/index.ts`、`automations/.../worker.ts:54-66`）与 orca 一致处直接沿用；不一致处以**本机 CLI `--help`** 为准（claude 2.1.323、codex 0.167.2），差异记入 ledger。全部字段写成目录快照测试（AG-01）。

| 字段 | Claude Code | Codex | Pi |
| --- | --- | --- | --- |
| orca 来源 | `tui-agent-config.ts:17-29`、`agent-catalog-entries-primary.ts:14` | `:62-70`、`:34` | `:124-131`、`:115` |
| displayName | 以 `tui-agent-display-names.ts` 为准 | 同左 | 同左 |
| detect / launch 命令 | `claude` | `codex` | `pi` |
| fullAccessArgs | `--dangerously-skip-permissions` | `--dangerously-bypass-approvals-and-sandbox` | `[]` |
| models | 以 orca `agent-session-option-catalog-claude-codex.ts:104-129` 为准；按模型给出 efforts 与 fast（如 haiku 无 effort，只有 opus 支持 fast） | 同一文件；effort 上限按模型 | 无 |
| model 模板 | `--model {v}` | `-m {v}` | — |
| effort 模板 | `--effort {v}`（本机 `--help` 已确认 low / medium / high / xhigh / max） | `-c model_reasoning_effort={v}`（改用 orca 的不带引号写法，现有 `providers/index.ts:64` 的带引号写法与单测一并更新） | — |
| fast 模板 | `--settings {"fastMode":true}` | `-c service_tier=priority`（orca 中 service_tier 为运行时发现的下拉框，本期只做开关；实施时在本机 0.167.2 上核对有效，无效则停下报告） | — |
| interactive.prompt | positional | positional | 以 orca / 现有行为为准 |
| interactive.resume | option `--resume {id}`（`providers/index.ts:36`） | prefix `resume {id}`（`providers/index.ts:62`） | 无 |
| headless.prefix | `[]` | `["exec"]` | 不支持 |
| headless.argv | `-p --output-format stream-json --verbose` | `--json` | — |
| headless.newSession | `--session-id {uuid}` | 无 | — |
| headless.resume | option `--resume {id}` | prefix `exec resume`，positional `{id}`（本机已确认 `codex exec resume [OPTIONS] [SESSION_ID] [PROMPT]` 接受 `--dangerously-bypass-approvals-and-sandbox`、`-c`、`-m`、`--json`） | — |
| headless.prompt | 以 `worker.ts` 现状为准 | stdin-dash | — |
| headless.trailing | `--disallowedTools EnterWorktree,ExitWorktree` | 无 | — |

### 3.3 删除 Claude Agent Teams

删除 `claude-agent-teams` Provider 及其全部引用：引擎、UI、测试、e2e、中文文案、清单。实施时由 `grep` 子代理列出全部出现处；完成后用 `git grep -nE 'claude-agent-teams|Agent Teams' -- ':!.agents/dev/'` 确认为 0（排除 `.agents/dev/` 下的规格与归档，`git grep` 天然不含构建产物）。

## 4. 智能体设置与检测

### 4.1 存储

文件 `<vault>/.huhu/agent-cli/agents.json`，取代 `providers.json`。旧文件不读取、不迁移；删除对它的读写代码。

```ts
interface AgentSettingsFile {
  schema: 1;
  defaultAgent: AgentId | null;       // null 表示按目录顺序取第一个已启用且已检测到的
  agents: Partial<Record<AgentId, AgentSettingsEntry>>;
}
interface AgentSettingsEntry {
    enabled?: boolean;                // 缺省 true
    command?: string;                 // 覆盖启动命令：单个可执行文件（绝对路径或 PATH 中的名字），不按空格拆分；空串视为未设置
    model?: string;                   // 缺省表示“智能体默认”，不传参数
    effort?: string;
    fast?: boolean;
    args?: string[];                  // 缺省等于 fullAccessArgs；显式空数组表示不加任何参数
    env?: Record<string, string>;
}
```

- 文件不存在或解析失败：按全部缺省处理；下次保存时整体重写。解析失败时设置页顶部显示警告。
- **明文与同步**：`env` 是明文。
  - 自动同步不会上传它：versioning 的 `HUHU_INCLUDE`（`sync.ts:56`）不含该文件。
  - 用户在 Git 页面“暂存全部”时可能提交它：把 `.huhu/agent-cli/agents.json` 加进 versioning 的 `DEFAULT_GITIGNORE`（`repo.ts:23`），并为 `classify` 补测试。
  - 设置页在环境区下方提示“明文保存在本机 Vault，不参与同步；密钥请放在保险箱”。
- 能力：`agent.settings.get`、`agent.settings.update`（整文件条件写，按版本号防覆盖），属于 agent-cli 插件，`exposable: false`。

### 4.2 检测

- 能力 `agent.catalog.detect({refresh?: boolean})` 取代 `agent.providers.detect`（0→1 直接改名）。返回每个条目：

  ```ts
  { id, installed: boolean, skipped?: true,           // skipped：已停用，未探测
    path?: string, version?: string,
    via?: "path" | "installDir" | "override",
    headless: boolean,                                // 来自目录，便于调用方筛选
    detectedAt: string }
  ```

  模型列表不在检测结果里，调用方直接读共享目录。
- 跳过已停用的智能体。
- 设置了 `command` 覆盖：绝对路径直接检查，否则查 PATH；能找到即已安装，`via: "override"`。
- 没有覆盖：先查 PATH，再查 §3.1 的共用安装目录（orca `agent-command-detection.ts:13-47` 的顺序）。
- 缓存沿用现有 10 分钟。`refresh: true` 忽略缓存；`agent.settings.update` 修改了任一条目的 `command` 或 `enabled` 时清空缓存。
- 引擎内的进程内服务 `detector.detect()`（被 `apps/engine/src/boot.ts:295-305` 用来生成自动化的 `exeFor`）改为同一结果类型，并去掉那里的宽松类型断言，让字段变化能被 typecheck 发现。
- PATH 补全：是否需要照搬 orca 的 shell PATH 补全，实施时在 macOS 打包产物上核对；需要时复制并登记。

## 5. 启动合成 `resolveAgentLaunch`

### 5.1 契约

```ts
resolveAgentLaunch(input: {
  agentId: AgentId;
  mode: "interactive" | "headless";
  model?: string; effort?: string; fast?: boolean;   // 启动选项，覆盖设置
  prompt?: string;                                    // interactive：附加提示词；headless：任务提示词
  sessionId?: string;                                 // headless 新会话：指定会话 id（条目有 newSession 时使用）
  resume?: string;                                    // 恢复会话 id
  draft?: AgentSettingsEntry;                         // 仅预览：用未保存的设置代替已存设置
  preview?: boolean;                                  // 仅预览：command 用可读命令名，env 值打码，不要求已检测到
}): {
  command: string;
  argv: string[];
  env: Record<string, string>;        // 只含覆盖层：目录条目 env + 用户 env；不含进程环境
  stdin?: string;                     // headless 且 prompt 走 stdin 时的输入内容
  warnings: string[];                 // 例如启动选项与用户参数冲突
}
```

- 是 agent-cli 引擎内的纯函数，另读当前 Vault 的智能体设置与检测结果；单元测试直接测它。
- **基础环境由启动方合并**：交互会话交给 Herdr `terminal.run` 的 env 参数，在继承环境上叠加（用户 2026-11-13 确认）；headless 由 automations worker 自己合并。这样不会把 Engine 的整个 `process.env` 经能力返回给渲染层或其他插件。
- 对外以能力 `agent.launch.resolve` 提供，`exposable: false`，归入任务 change 的仅内置权限组 `agent.run`（[任务 spec §8](../../../../changes/2026-11-13-task-issue-automation/spec.md)）。
- 输入校验沿用 `sessions.ts:145-152`：`model`、`effort`、`prompt`、`resume`、`sessionId` 不得以 `-` 开头。
- 错误：智能体已停用 → `AGENT_DISABLED`；`mode: "headless"` 而条目不支持 → `HEADLESS_UNSUPPORTED`；未检测到且无覆盖 → `AGENT_NOT_FOUND`。不回退到别的智能体。
- **预览模式**（`preview: true`）：
  - 不报 `AGENT_DISABLED` 与 `AGENT_NOT_FOUND`，因为停用或未检测到的条目也要能在设置页中预览。
  - 条目不支持 headless 时，不抛错，而是返回 `{unsupported: "headless"}`，供 §7 显示“不支持”。
  - `draft` 只能与 `preview: true` 一起使用，否则返回参数错误，避免用未保存的设置真实启动。
  - 设置页对预览调用做 150 ms 防抖。

### 5.2 合成顺序

在 orca `tui-agent-launch-command.ts:93-206` 的顺序上补齐 HUHU 已有的 headless 与恢复会话：

1. **命令**：用户 `command` 覆盖 → 检测到的绝对路径 → 目录 `launch.command`。用绝对路径是为了 Engine PATH 不完整时，经安装目录检测到的 CLI 仍能启动。
2. **前缀子命令**：headless 恢复会话用 `headless.resume.prefix`，否则 headless 用 `headless.prefix`；interactive 恢复会话且 `resume.position === "prefix"` 时用它的 argv。
3. **启动选项**：模型、Effort、速度。取值优先级：本次启动选项 > 智能体设置 > 不传。所选模型不支持该 effort 或 fast 时不传，并记 warning。
4. **用户参数**：设置中的 `args`，缺省为 `fullAccessArgs`。
5. **模式参数**：headless 的 `headless.argv`。
6. **会话参数**：`newSession`（给了 `sessionId` 时），或 `position: "option"` 的恢复参数（interactive / headless 同理）。
7. **位置参数**：`position: "positional"` 的恢复会话 id（codex `exec resume`）；interactive 的附加提示词（**interactive 恢复会话时不追加附加提示词**，沿用 `providers/index.ts:65`）；`prompt: "stdin-dash"` 时的 `-`。
8. **末尾可变参数**：`headless.trailing`（claude 的 `--disallowedTools …`）。它之后不能再有任何参数。

### 5.3 冲突

- 冲突按选项分别判断：用户参数命中某选项的 `conflicts` 时，只跳过**该**启动选项，以用户参数为准，并返回 warning；其他选项照常生效。
- 冲突表以 orca `agentChoiceCliApply` 的 `names` 列表为来源，按选项拆开并补齐：
  - claude：model `flag --model`、`flag= --model=`；effort `flag --effort`、`flag= --effort=`；fast `flag --settings`、`flag= --settings=`。
  - codex：model `flag -m`、`flag --model`、`flag= --model=`、`config model`；effort `config model_reasoning_effort`、`flag --reasoning-effort`；fast `config service_tier`。
  - 不把 `--config` 整体当作冲突，只按 key 判断。

### 5.4 消费者

| 消费者 | 归属 | 说明 |
| --- | --- | --- |
| `agent.sessions.launch`（`sessions.ts:133-197`） | 本 change AL-S1 | 改为调用 `resolveAgentLaunch(mode: "interactive")`，入参增加启动选项与附加提示词 |
| `apps/engine/src/boot.ts:295-305` 的 `exeFor` | 本 change AL-S1 | 改用新检测结果类型 |
| `plugins/tasks/src/ui/TaskEditor.tsx:29,38`、`plugins/automations/src/ui/RuleEditor.tsx:49,68` | 本 change AL-S1 | 改调 `agent.catalog.detect`，用 `installed && headless` 筛选，模型列表读共享目录 |
| 设置页“有效命令行”预览 | 本 change AL-S3 | 调用 `agent.launch.resolve` |
| automations headless worker（`worker.ts:54-66`） | 任务 change T05 | 改为调用本函数，删除写死的 argv；自行合并基础环境并写入 `stdin` |

**修复 Fast 不生效**：目前 `claudeArgv`、`codexArgv` 忽略 `fast`。改用本函数后按 §3.2 的模板生效。

## 6. 新建菜单

替换 `AgentCliModule.tsx:235-266` 的“+ 新终端”菜单，复刻 orca `TabBarCreateEntry` + `QuickLaunchButton` + `AgentLaunchSetupPanel`：

```text
┌───────────────────────────────┐
│ 🔍 搜索智能体或模型…           │
├───────────────────────────────┤
│ ▸ 新终端                Ctrl+T │
├───────────────────────────────┤
│ ◆ Claude Code   默认         › │  → 子菜单：模型 / Effort / 速度 / 附加提示词 / [启动]
│ ◆ Codex                      › │
│ ◇ Pi            未检测到        │  （置灰，不可启动）
├───────────────────────────────┤
│ ⚙ 智能体设置…                  │
└───────────────────────────────┘
```

- 菜单项文案“新终端”取代现在的“新终端（shell）”，相关 e2e 一并更新（见 plan）。
- 智能体行只列**已启用**的条目，默认智能体排第一，其余按目录顺序。未检测到的置灰，显示“未检测到”，悬停提示去设置页。
- 搜索：匹配显示名、id 与模型 label，复用 `@huhu/workbench` 已导出的 `scoreText`。命中模型时，该智能体行高亮并在子菜单中预选该模型。
- 点击智能体行：按设置直接启动。悬停或按 → 打开子菜单；子菜单里的选择只影响这一次，不写回设置；底部注明“权限与参数在智能体设置中修改”。
- 附加提示词：`LaunchPanel.tsx:85` 的“附加提示词”迁入子菜单，作为可选多行文本框。`LaunchPanel.tsx` 的其余控件也迁入后删除该组件。
- 键盘：↑↓ 移动，→ 打开子菜单，← 关闭子菜单，Enter 启动，Esc 关闭。打开菜单时焦点在搜索框。
- **Ctrl+T（macOS ⌘T）**：新终端。只在 agent-cli 模块激活时生效；终端获得焦点时不拦截（Claude Code 在 TUI 中自用 Ctrl+T）。登记到 `shortcuts.ts` 的 `SHORTCUTS`（`shortcuts.ts:8-14` 目前未占用）。
- **没有 Space 时**：沿用现有依赖（`AgentCliModule.tsx:252-255`）——菜单仍可打开，新终端与智能体项置灰，顶部提示“先选择或创建 Space”；Ctrl+T 只给出同样的 toast。
- 删除模块头部原来的“设置”按钮（`AgentCliModule.tsx:162-164`），入口统一到菜单底部“智能体设置…”与设置导航。

## 7. 智能体设置页（agent-cli 插件设置页）

复刻 orca `AgentDetectionCatalog` + `AgentCatalogRow` + `AgentLaunchDefaultsEditor`：

- **Herdr Core 区**（页首）：Core 状态与“重启 Core”按钮，迁自 `AgentSettings.tsx:119-132`，testid 保持 `agent-core-restart`。
- **检测区头**：“已安装 · N 个已检测 · 检测于 HH:MM”与“刷新”按钮（`detect({refresh: true})`）。
- **默认智能体**：一个下拉框，候选为已启用的条目。
- **每个条目一行**：图标、显示名、检测状态（版本号或“未检测到”）、“默认”标记、启用开关、“文档”链接、展开按钮。停用的条目整行变淡，仍可展开编辑。
- **整行命令预览**（照 orca 截图：图标 + 显示名，下面一行等宽小字）：显示名下方始终显示当前设置合成的完整交互命令，如 `claude --dangerously-skip-permissions`。命令部分显示用户可读的命令名（覆盖值或目录命令），不显示检测到的绝对路径；参数、模型、Effort、速度、环境任一项修改后立即刷新（不等保存）。环境变量以 `KEY=… ` 前缀显示在命令前，值打码。
- **展开区**：
  - 命令：文本框，占位符为目录的启动命令；提示“单个可执行文件，不含参数”。
  - 模型、Effort、速度：首项“智能体默认”。Effort 与速度的候选随所选模型变化；条目没有该选项时不显示控件。
  - 权限：只读文字“完全访问”。`args` 不等于 `fullAccessArgs` 时显示“自定义（参数已修改）”。
  - 参数：chip 列表，可增删；“恢复默认”删除 `args` 字段。
  - 环境：KEY=VALUE 列表，可增删，附 §4.1 的提示。
  - 有效命令行：只读等宽文本，显示交互与 headless 两行完整命令（不支持 headless 的显示“不支持”），以及 warnings；与整行预览同源，均来自 `agent.launch.resolve`（预览调用传 `preview: true`，返回可读命令名并对 env 值打码）。
- 保存：失焦或切换开关即保存（条件写）；版本冲突时重新读取并提示“设置已在别处更新”。

## 8. 复制与许可

- 从 orca 复制的代码（安装目录表、检测、合成顺序、冲突标志、界面组件结构、图标组件）在文件头保留 orca 的版权与 MIT 许可声明，并在 `docs/upstream/ledger.md` 登记：来源仓库、提交、文件、改动摘要。
- 图标属于“标识该工具”的用法，同样登记，并出现在 `pnpm notices` 生成的第三方声明里。
- `temp/sources/` 只读。

## 9. 验收

### 设置框架（SF，AL-S2 用 safe 举例；agent-cli 页的同类验收在 AL-S3）

| 编号 | 动作 → 可观察结果 |
| --- | --- |
| SF-01 | 打开设置 → 左侧分“系统”“插件”两组；系统组 7 项顺序固定；插件组列出 agent-guide、safe、versioning（AL-S3 后加 agent-cli）的页，各带图标 |
| SF-02 | 在插件中心停用 safe → 设置导航中 safe 项消失；停留在该页时自动回到第一项；重新启用后再次出现 |
| SF-03 | 停用 agent-guide → `agent-access` 页消失（当前不会消失，属回归点）；网关模块中跳 agent-access 的入口给出“该插件未启用”提示 |
| SF-04 | 插件中心中 safe 的“插件设置”按钮 → 直接打开 safe 设置页；没有设置页的插件不显示该按钮 |
| SF-05 | `onNavigate("settings", "不存在的id")` → 打开设置第一项并 toast“该插件未启用”；侧栏折叠状态不变 |
| SF-06 | 单元测试：内置插件清单的 `settingsPages` 与 UI 注册集合不一致时失败；人为删除一条注册后测试变红 |
| SF-07 | safe 模块的“设置”按钮、同步页的 `sync-reconfigure` → 跳到各自设置页；原有设置项全部可用，保存后重开仍在；同步页的状态、预览、执行仍在原处 |
| SF-08 | 切换到另一个 Vault → 所有设置页显示新 Vault 的值 |
| SF-09 | 520 px 宽 → 导航只显示图标，悬停显示标题；现有 `settings-nav-<id>` e2e 全部通过 |
| SF-10 | 状态栏“快捷键”图标 → 打开快捷键页；健康模块入口 → 打开数据页 |

### 智能体目录、设置与检测（AG）

| 编号 | 动作 → 可观察结果 |
| --- | --- |
| AG-01 | 目录快照测试：三个条目所有字段与 §3.2 一致 |
| AG-02 | 单元测试向目录追加一个虚构条目 → `resolveAgentLaunch`、检测、设置页行渲染、新建菜单行渲染都能处理它，不改其他代码（AL-S1 测引擎部分，AL-S3 / AL-S4 测界面部分） |
| AG-03 | `git grep -nE 'claude-agent-teams|Agent Teams' -- ':!.agents/dev/'` → 0 处 |
| AG-04 | 本机装有 claude、codex，未装 pi → 设置页显示“已安装 · 2 个已检测”，pi 行“未检测到”；点“刷新”后检测时间更新 |
| AG-05 | 给 pi 设置命令覆盖为一个存在的可执行文件 → 无需手动刷新，下一次检测即显示已检测（来源：覆盖） |
| AG-06 | 停用 codex → 新建菜单、默认智能体下拉、任务编辑器与自动化规则编辑器的 CLI 选择中都不再出现 codex |
| AG-07 | 修改 claude 的模型、Effort、参数、环境 → 重开应用后值仍在；`.huhu/agent-cli/agents.json` 内容与界面一致 |
| AG-08 | 删除 claude 参数中的 `--dangerously-skip-permissions` → 权限行显示“自定义（参数已修改）”；“恢复默认”后恢复 |
| AG-09 | 把 `agents.json` 改成非法 JSON → 设置页显示警告并按缺省展示；保存一次后文件恢复合法 |
| AG-10 | versioning 单测：`classify` 不把 `.huhu/agent-cli/agents.json` 归入同步内容（`HUHU_INCLUDE`）；`DEFAULT_GITIGNORE` 包含这一行 |
| AG-11 | 自动化：任务 change 之前的现有自动化在 AL-S1 合入后仍能找到 claude / codex（`exeFor` 不全部变成 cli-missing）；现有 `engine.test.ts`、`acceptance.spec.ts` 中相关用例更新后通过 |
| AG-12 | 设置页“重启 Core”可用（`agent-core-restart` e2e 通过） |

### 启动合成（LA）

| 编号 | 动作 → 可观察结果 |
| --- | --- |
| LA-01 | 缺省设置 interactive：claude → `<path>/claude --dangerously-skip-permissions`；codex → `<path>/codex --dangerously-bypass-approvals-and-sandbox`；pi → `<path>/pi` |
| LA-02 | claude headless 新会话 → 依次为启动选项、用户参数、`-p --output-format stream-json --verbose`、`--session-id <uuid>`、`--disallowedTools EnterWorktree,ExitWorktree`，且 `--disallowedTools …` 是最后两项 |
| LA-03 | codex headless 新会话 → `codex exec <选项> <用户参数> --json -`，`stdin` 为提示词；恢复 → `codex exec resume <选项> <用户参数> --json <id> -` |
| LA-04 | interactive 恢复：claude 含 `--resume <id>`；codex 以 `resume <id>` 紧跟命令；恢复时即使给了附加提示词也不追加 |
| LA-05 | pi headless → `HEADLESS_UNSUPPORTED`；停用的智能体 → `AGENT_DISABLED`；未检测到且无覆盖 → `AGENT_NOT_FOUND`；`model: "-x"` → 校验错误 |
| LA-06 | claude（opus）打开 fast → 含 `--settings` 与 `fastMode`（修复回归点）；haiku 打开 fast → 不传并给 warning；codex 打开 fast → 含 `-c service_tier=priority` |
| LA-07 | 用户参数含 `--model opus`、启动选项选了 sonnet → 只出现 `--model opus`，返回 warning，effort 照常生效；codex 用户参数含 `-c model_reasoning_effort=low`、启动选项选 high → 只出现 low，`-m` 照常生效；用户参数含 `-c foo=bar` 不触发任何冲突 |
| LA-08 | 返回的 `env` 只含条目 env 与用户 env，不含任何未设置的进程环境变量；真实会话中，用户 env `FOO=1` 覆盖同名继承变量，`PATH` 仍被继承 |
| LA-10 | 设置页中给 claude 加参数 `--verbose` → 不保存时整行预览即显示 `claude --dangerously-skip-permissions --verbose`；加 env `TOKEN=abc` → 预览显示 `TOKEN=… claude …`，不出现 `abc` |
| LA-09 | 真实启动：从新建菜单启动 claude，在终端里用 `ps` 看到的 argv 与 LA-01 一致 |

### 新建菜单（LM）

| 编号 | 动作 → 可观察结果 |
| --- | --- |
| LM-01 | 点“+” → 菜单依次为搜索框、新终端、已启用智能体（默认在首）、智能体设置… |
| LM-02 | 输入“son” → 只剩 Claude Code 一行并高亮；打开子菜单时模型预选为 sonnet 类 |
| LM-03 | 键盘 ↓ 到 Codex → → 打开子菜单 → 选 Effort high → Enter → 新会话 argv 含 `-c model_reasoning_effort=high`；设置页中 Codex 的 Effort 未被改写 |
| LM-04 | agent-cli 模块中、焦点不在终端时按 Ctrl+T → 新建普通终端；焦点在终端时按 Ctrl+T → 按键传给终端程序 |
| LM-05 | 未检测到的智能体行置灰，点击不启动 |
| LM-06 | 点“智能体设置…” → 打开 agent-cli 插件设置页 |
| LM-07 | 没有 Space 时打开菜单 → 新终端与智能体项置灰并提示“先选择或创建 Space” |
| LM-08 | 子菜单填写附加提示词后启动 → 会话收到该提示词 |
