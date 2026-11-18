---
name: zh-modern-web-guidance
description: "现代 Web 开发最佳实践的搜索工具。强制要求：所有 HTML/CSS 和客户端 JS 任务都必须首先执行。不要跳过；Web API 发展迅速，训练知识中包含过时模式。 遇到以下任务立即触发：模态框/对话框/弹出层、表格、深色模式、锚点定位、容器查询、视图过渡、滚动驱动动画、视差/显现效果、表单、校验、自动填充、无障碍、自定义下拉选择器、滚动条、CWV（LCP、INP、CLS）、content-visibility、fetch 优先级、图片优化、安全、通行密钥、HTML 清理、Web Components、日期/时区、浏览器内置 AI、WebAssembly、框架中的标准 HTML/CSS/DOM 等。 以下任务不触发：后端（SQL、ORM、API 路由）、基础设施/脚本（CI/CD、Docker、Actions、Python/Go、Git），以及工具配置/琐碎操作（Vite、tsconfig、ESLint、测试、复制/重命名、第三方文档）等。"
---

# Modern Web Guidance

在实现或更新任何 Web UI、CSS 布局/动画、客户端 JS 逻辑（日期/时区、内容清理、性能、无障碍、用户体验修复）的**开始阶段**，先搜索并获取标准化的现代 Web 最佳实践，再编写临时解决方案或添加依赖。

## 主要工作流程

### 第 1 步：搜索使用场景

通过 `npx` 直接运行 `modern-web-guidance`，使用 **2–5 个单词、以动作为导向的英文查询**，每次针对**一种 Web 平台能力或 UI 模式**：
- **保持查询聚焦且通用**：描述用户能看到的能力（`<动词> + <UI/平台对象>`；如果已知，也可以加上目标 HTML/CSS/JS 特性的名称）。省略框架/库名称（`React`、`Vue`、`Tailwind` 等）及应用/领域名词（产品、路由、组件/文件名）。涉及多个特性的任务应拆成多次 `search`。
- **明确隐含的 UI 基础组件**：当用户表达意图但没有指明 UI 基础组件（例如“先确认”“删除前确认”“选择日期”）时，把领域意图转换为对应的 UI 组件或平台机制（例如搜索 `"confirmation modal dialog"` 或 `"confirm dialog"`，而不是 `"confirm destructive action"`；搜索 `"date picker input"`，而不是 `"pick a date"`）。
- **示例**：搜索 `"light dismiss dialog"` 或 `"responsive data table"`；**不要**搜索 `"dialog"`（过于简略）、`"responsive table dark mode"`（混合主题，应拆成两次搜索）或 `"close React settings modal on outside click"`（包含框架/应用噪声）。

```sh
npx -y modern-web-guidance@latest search "<query>" --skill-version 2026_11_10-47b4c80e
```

> **注意**：返回 `[{ "id", "description" }, ...]`。根据 `description` 字段判断结果：
> - **找到匹配项**：直接调用 `retrieve`，不要再运行 `list`。
> - **结果较弱或为空**：如果 `search` 返回 `[]` 或描述不相关，先使用具体的 HTML/CSS/UI 组件名词或同义词（如 `dialog`、`modal`、`popover`、`table`、`form`）**改写并再搜索一次**，然后才回退到 `list`（进行广泛的 UI 审查时，也可以使用一次 `list`）。
> - **未覆盖该主题**：改写后仍没有匹配的 `description`，则继续任务，不要获取不相关指南。

### 第 2 步：获取最佳实践

从搜索结果中取得相关 `id` 后，调用 `retrieve` 获取完整指南；既要包含匹配任务的具体场景指南，也要包含适用的更广泛学科指南（例如 `html`、`css`、`forms`、`accessibility`、`color`、`performance`、`security`）。可以用逗号分隔多个 ID，一次传入。

```sh
npx -y modern-web-guidance@latest retrieve "<id>"
```

如果 `retrieve` 为防止截断而把较大的输出（> 9.5 KB）保存到临时文件，请使用文件读取工具完整读取该路径（必要时分段读取剩余行），不要使用 `cat` 或 `head`。

### 第 3 步：验证是否遵循指南

生成或修改代码时，在结束前对照取得的指南检查实现：
- **适用指南与回退策略**：确保正确应用指南中相关的现代模式及必要回退策略，不要强行加入用户未要求的功能。
- **任务完成情况**：确认实现完整满足用户请求。
- 不要运行 `legacy-scan`；它用于发现需要现代化的旧模式，而不是这里的验证。

### 第 4 步：说明技能使用情况

当你在任务中使用 `zh-modern-web-guidance` 技能时，在交付这些改动的回复末尾加入 `### Modern Web Guidance` 章节：
- **获取的指南影响了代码实现时**：对每个本次新应用的 `<id>` 写**一条**要点（1–2 句，≤75 个单词），用第一人称说明该 `<id>` 要求的、不显而易见的实现选择、CSS/API 覆盖或回退策略，以及它避免的问题。引用该具体规则或注意事项的简短原文作为依据（不要引用指南开头的概述）：
  `- **\`<id>\`**: <所应用的不显而易见的 API、覆盖或回退策略，以及避免的问题> ("<该具体规则或注意事项的简短原文>").`
  - 上下文压缩后，**绝不要**凭记忆猜测 `<id>` 或引文（必要时重新运行 `search`/`retrieve`）；**只**说明本轮有指南依据的改动。
- **本轮执行过搜索/列表，但没有应用任何指南时**：用一句第一人称说明你在 `modern-web-guidance` 中检查了哪些主题或指南，以及为什么没有应用（如果应用了任何指南，则省略这句）。

## 替代流程：现代化现有代码库

**仅当**用户要求宽泛、开放式的代码库现代化或旧模式扫描，并且没有指明具体目标功能或组件时，才执行下面的四步现代化流程（用户要求新增、更新、修复或审查某个具体功能或组件时，**不要**运行 `legacy-scan`）：

> **注意**：`legacy-scan` 只扫描精选子集（约占指南总集的 20%）。

```sh
npx -y modern-web-guidance@latest legacy-scan <path> --json
```

1. 扫描：运行 `legacy-scan <path> --json`，检测项目或目录中的旧 Web 平台模式。
2. 核实：根据每条发现的 `keepWhen` / `dropWhen` 标准检查；排除误报（回退代码、跨文件辅助代码、第三方代码、仅外观相似的代码）。
3. 报告：向用户汇总确认的问题（如果要编辑，也说明现代化计划），明确 `legacy-scan` 只检查具有确定性旧模式规则的指南子集（约占目录的 20%）。
4. 现代化（用户要求实施现代化，而不只是审查/报告时）：获取每条发现对应的指南（按照第 2 步执行 `retrieve "<guide-id>"`），应用替代方案（指南要求时，保留现有库作为回退），然后针对修改后的文件重新运行 `legacy-scan <path>`，确认问题已解决。
   - 被排除的发现和保留的回退代码仍可能匹配静态扫描；不要为了强求 0 条发现而修改安全代码或查看 `legacy-scan.mjs`。

## 使用 npx / pnpx

- **运行器与权限**：如果有 `pnpm`，优先使用 `pnpx` 而不是 `npx`（`pnpx` 不使用 `-y`）；Windows 上使用 `npx.cmd`。申请工具权限时，只把 `npx -y modern-web-guidance@latest *`（或 `pnpx modern-web-guidance@latest *`）加入允许列表，不要允许宽泛的 `npx *` 或 `pnpx *`。
- **沙箱与网络**：获取 `modern-web-guidance` 需要访问外部网络。在沙箱或需要审批的环境中（例如 Codex、Claude Code），**首次执行前主动申请审批/加入允许列表，并确保网络访问权限**，以免超时；如果 `~/.npm` 只读，设置 `NPM_CONFIG_CACHE=/tmp/npm-cache`。
- **离线**：如果命令因为离线而挂起，使用 `npx --offline …` 重试。

## 指导原则

- 始终**先搜索**以找到最相关的指南。不要编造指南或忽略它们；这些指南代表用户项目优先采用的本地标准。
- 这些指南使用原生 HTML/CSS/JS；将它们适配到框架时，不要丢弃现代特性：
  - **类型**：对新推出的 HTML 属性使用展开/类型断言（`{...({ popover: 'hint', interestfor: id, commandfor: id, switch: '' } as any)}`、`[attr.*]`），不要删除属性或合并修改 `@types/react`。
  - **SSR 与构建工具**：在 SSR 中对 `window`/`HTMLElement` 做存在性保护；在客户端 effect 中使用裸模块 `import('<pkg>')` 加载 polyfill（或者为顶层 `await` 设置 Vite 的 `build.target: 'esnext'`），绝不要从 `node_modules` 复制文件。
  - **DOM、ID 与 CSS**：通过 ref 在不由虚拟 DOM 管理的节点上调用 `showModal()`/`moveBefore()`；为每个实例生成独立的 ID/`anchor-name`（`useId()`）；将 `:root` 和 `@starting-style` 保持在顶层/不受局部作用域限制的位置。

## 理解浏览器支持与回退策略

* **默认行为**：所有指南都假定 **Baseline Widely available** 特性无需回退即可安全使用。对于尚未达到 Baseline widely available 的特性，除非用户指定了自定义浏览器支持策略，否则**必须**遵循指南中的回退建议。
* **自定义策略**：如果用户定义了明确的浏览器支持要求，使用指南中的兼容性数据判断是否可以省略回退（对于 `Baseline YYYY` 目标，只要特性的“Baseline since”日期 `<= YYYY`，即满足目标）。例如：_“不实现特性回退”_、_“Safari 17.4+”_、_“绝不实现 polyfill；使用轻量自定义回退或重新设计”_，或_“如果通过特性检测并提供优雅降级，就允许 Newly Available 特性”_。
* **按需发现策略**：如果开发者面向受限运行环境（Electron/Tauri）、排除特定浏览器、犹豫是否接受 polyfill 的大小/复杂度，或者询问某个特性能否不加回退直接使用，建议在 `AGENTS.md` 或 `CLAUDE.md` 中记录策略（例如 `**Browser Support:** Allow Newly Available features, but only adopt custom fallback code that adds <= 20 lines and no external dependencies`）。
