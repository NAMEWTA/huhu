# Task05 独立审查缺口复核

起点是 task04 的 `16581be`。按任务要求合入 `closeout/issue2-integration` 的 `03dc93b`，合并提交 `ba82498`。按集成布局保留详情栏与会话，补回 task04 的源码定位回调（`8116633`）。

| 审查问题 | 改法 | 证据 |
| --- | --- | --- |
| B06 格式后立刻点击另一段，旧段被替换 | ProseMirror 的 `selectionchange` 走异步 DOMObserver，原 Huhu 捕获仅处理修饰键。原生 ProseMirror 的普通 keydown 只强制触发已有的延迟 flush。浏览器选区快照不同时，在编辑区捕获阶段的 `keydown` 和 `beforeinput` 主动让同一个 observer 读当前选区，绕开 IME，已同步时跳过额外 flush。 | `editor-parity-selection.spec.ts` 在真实 Electron 中不等待地执行格式、点击、End、Enter 和 `/embed`。基线发生格式段落消失，修后验证输入行实际选区、相邻段、格式、嵌入节点及磁盘。见 `b06-red-*.log`、`runs.md`。 |
| B01 233，文件树菜单和正文目标不是同一入口 | 复用 OK 的资产目标识别，正文增加有视口碰撞处理和键盘导航的目标菜单。指令用现有 DocTab、系统剪贴板、文件树选择镜像。资源树分级列表允许 CoreRoute 让位给 FilesRoute，解决在活动笔记中展开时列表被引用候选抢占的问题。 | Electron 用例 `B01：在正文就地操作附件、图片和双链，支持键盘菜单` 验证 .txt 路径复制、图片的文件树位置、当前笔记标签保持、双链 Shift+F10、Escape 焦点及打开目标。上游分类和菜单 DOM 用例随迁入。 |
| Q2 要保留模板导入 | 接通现有树菜单和 `POST /api/template/import`，以可见的、可继续编辑的 Vault 内 Markdown 副本承载最小本地等价。 | [接口映射](endpoint-matrix.md)与 `editor-parity-assets-template.spec.ts` 的导入、保存、关闭与重开。 |
| 同名 DOM 用例缺少逐文件适用性 | 枚举固定上游完整 DOM 清单，迁入可用的树、属性、批注、图片、源码与键盘行为测试。在 SourceEditor 中只移除 Ask AI 和 Problems 两组外壳断言。属性折叠 Storage 用隔离 JS DOM 替身。 | [dom-tests-applicability.md](../../../../../../../../docs/upstream/ok-parity/dom-tests-applicability.md) ，测试门禁计数与失败重跑见 [runs.md](runs.md)。 |
| G01/G02 来源与重放 | `vendor-replay.json` 逐文件记录上游路径、Git blob、目标路径、copy/patch/local、最终 SHA-256 与适配说明。压缩补丁保留字节差异。 `--replay` 直接投影固定提交的 Git 对象，把补丁应用到空临时目录，再核对整个 vendor 目录文件集合和字节。 | `OK_SRC=/home/wta/projects/huhu/temp/sources/open-knowledge node scripts/ok-patches.mjs --replay`。补丁可读形式为 `gzip -dc vendor-replay.patch.gz`。 |
| 三个已有 parity 用例与合入兼容性 | 集成后原英文的 Embed、下划线和高亮定位失败，改为中文命令、标签和气泡辅助名称，Embed 占位通过组件结构定位，保留英文筛选 alias。task04 的目标标签关闭与重开方案在集成基线照常通过。 | `integrated-baseline.log` 的原始 2 失败、2 通过。首次修复的 `domain-pilot2.log` 中三项均通过，完整门禁另见 [runs.md](runs.md)。 |

## Modern Web Guidance

- `menu` 和 `viewport-aware-dropdowns` 的上下文菜单使用零尺寸定位点、具名菜单和视口碰撞处理。本实现沿用仓库 Radix 菜单提供的方向键行为，关闭时将焦点还给调用者或交给目标导航。
- `ime-safe-enter-submit` 要求尊重组合状态。输入前选区同步先看 DOM 和 ProseMirror 的组合标记，组合中交给编辑器本身。

## Task08 复审发现 3、4

| 复审问题 | 改法 | 证据 |
| --- | --- | --- |
| 设置中的 Ctrl/Mod+F 打开了隐藏笔记的查找栏 | 编辑与组合状态检查之后，先匹配实际查找快捷键。编辑器无布局框或位于 inert 子树时跳过。外部浮层优先级继续在窗口快捷键接管前判定。普通输入沿用 task06 的提前返回。 | Electron 在设置的语言选择框聚焦时实测，基线隐藏查找栏计数 1，修后 0。返回后活动笔记仍能用 Ctrl/Mod+F 打开并用 Escape 关闭。独立 Chromium 同样验证隐藏及重显。 |
| 导入文件无法用于新建，且两步写入可能残留空模板 | 引擎以一次 Vault 原子写入完整原字节，检查读取边界与同名路径，更新本地模板清单。新建笔记对话框与文件树模板入口共用清单。文件树确认最终名称后新建，避免临时笔记的改名流程。 | 基线导入字节已落盘时，真实新建对话框找不到模板选项。修后两个入口创建内容正确，编辑、保存、关闭及重开后模板字节未变。服务测试验证首笔写入中断、重试及并行同名。见 [接口矩阵](endpoint-matrix.md)。 |

Modern Web Guidance 的 `forms` 与 `accessibility` 指导沿用带标签的原生选择框和现有键盘操作。快捷键继续先判断编辑与组合态，隐藏编辑器在识别实际快捷键后让出事件。浏览器探针验证 Chromium 158.0.8127.18 的这一路径。
