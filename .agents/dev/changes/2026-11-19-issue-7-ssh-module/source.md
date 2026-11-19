# GitHub Issue #7 [SSH 模块完整复刻] 以 Motty 为基线移植主机、工作区、终端/SFTP、监控、端口转发、跳板路由与统一 MCP

- 原报告 — https://github.com/NAMEWTA/huhu/issues/7
- GitHub 对象 ID — I_kwDOVmq61M8AAAABflwhAA
- 状态 — OPEN
- 作者 — NAMEWTA
- 创建时间 — 2026-11-16T05:35:28Z
- 更新时间 — 2026-11-17T06:36:44Z
- 标签 — 

## 正文

# 目标

以 **Motty v0.4.12 的实际源码、界面结构和操作流程**为基线，把主机、SSH 工作区、终端、SFTP/文件、监控、端口转发、跳板路由，以及相关设置与 MCP 能力，完整移植为 HUHU 的 SSH 模块。

执行原则是：**先复制成熟实现及其行为，再做 HUHU 宿主必须的适配。** 不能只参考截图重新设计一个简化版本，不能以新增几个菜单、表单或空工具名代替完整业务闭环。允许重构现有 SSH 实现，保持一个执行层、一份持久配置和一套公共能力；清理被替代的旧实现，不长期维护两套 SSH 模块。

本次先提交完整实施 Issue；本文中的目标接口、文件落点和验收项是待实施要求，不代表已经完成开发。

**2026-11-17 凭据边界调整（#9）：SSH 像 Motty 一样，在自己新增/编辑连接与密钥管理流程中维护账号、密码、私钥及口令。Safe 仅管理网站/APP 的个人账号资料，SSH 不依赖 Safe 初始化、解锁、条目或 `secretUse`。保留本 Issue 原有功能范围，采用轻量的模块私有凭据保存，不建立跨模块密码平台。**

## 1. 分析基线、证据与关联工作

| 项目 | 固定基线 |
| --- | --- |
| 上游 | [t8y2/motty — 102228261703d8f22c5eb98b1c500e2a24889dee](https://github.com/t8y2/motty/commit/102228261703d8f22c5eb98b1c500e2a24889dee)，提交 `chore(release): 0.4.12`，2026-11-16 |
| 目标 | [NAMEWTA/huhu — 913264045cee1818497a37a57715c664aa85a1ae](https://github.com/NAMEWTA/huhu/commit/913264045cee1818497a37a57715c664aa85a1ae)，`0.0.1-rc.4` |
| 分析方式 | 阅读两仓库源码、上游文档、实际界面截图与相关测试；没有把静态分析描述为已运行真实 SSH/SFTP/MCP 的端到端验证 |
| 产品要求 | 全量保留本 Issue 所列 SSH 功能域的交互逻辑；HUHU 主题、品牌、宿主窗口及公共基础设施按现有工作台适配 |

关联：#6 负责 MCP/CLI/HTTP 的统一公共能力目录、共享开放设置、Web 宿主和跨入口调用；本 Issue 补充 SSH 领域的完整功能和交互，不建立第二套网关。#4 负责 Agent CLI/Herdr 的 Space、Tab、Pane；SSH 工作区和 SSH 会话不冒充 Agent Space 或 Herdr session，可复用通用布局组件。#3 负责桌面外壳；SSH 模块不重新创建全局标题栏体系。

**证据优先级：固定提交的实现与测试 > 同提交的使用文档 > README 概述。** 已发现 README 的“隧道随 SSH tab 关闭”等概括不覆盖专用隧道连接和恢复分支，不能据此删掉源码已有能力。后续实施使用下文来源索引中的固定链接，避免上游更新后验收基线漂移。

## 2. Motty 整体功能盘点与本次归属

| 功能域 | 已核实的能力 | 本次处理 |
| --- | --- | --- |
| 主机与认证 | 分组/标签/颜色/图标、列表/网格、搜索与快速连接、批量操作、多个客户端导入、密码/密钥/agent/交互式认证、已知主机和凭据 | 完整移植到 SSH |
| SSH 工作区 | 临时/固定工作区、主机组合、布局预设、自定义分割树、连接后命令、运行中保存模板 | 完整移植到 SSH；与 Agent CLI Space 分开 |
| 终端 | 真 PTY、多标签、多分栏、焦点与输入控制、搜索/历史/快捷命令/广播、录制、恢复和工具栏布局 | 完整复刻产品行为，复用 HUHU 可胜任的终端组件 |
| 文件 | 终端附属文件面板、独立双栏 SFTP、SCP 回退、批量/递归传输、队列/续传/暂停/取消、远端编辑、sudo、目录同步 | 完整移植到 SSH |
| 监控与服务器工具 | 当前终端侧栏、多主机仪表盘、资源采样与历史、进程/Docker 操作 | 完整移植到 SSH，绑定真实会话 |
| 网络 | Local/Remote/SOCKS5/HTTP CONNECT 转发、专用隧道、重连恢复、全局/主机代理、ProxyCommand、多跳及 shell 中继 | 完整移植到 SSH |
| 设置与 MCP | 通用、终端、连接、文件、快捷键与 MCP 配置；窗口内 HTTP MCP、stdio `mcp-serve`、终端/文件工具与后台任务 | 设置按原分类组织；工具接入 HUHU #6 的统一目录 |
| 配套功能 | Known Hosts、密钥/口令引用、快捷命令、会话日志、配置导入导出 | 作为以上流程的组成部分，不因未单列主标题而遗漏 |
| 其他上游能力 | VNC/RDP（可通过 SSH）、Mosh、本地 Shell、Telnet/串口、ZMODEM/XMODEM/YMODEM、AI Ask/Agent 与 CLI 服务商、加密备份及 WebDAV/S3/Gist/Gitee 同步 | 在对照清单中保留明确归属：本地终端及 SSH 文件传输相关动作随本次迁移；独立远程桌面/其他协议、完整 AI 产品、跨设备同步另列扩展，不用它们代替本次 SSH 完整性验收 |

这里的“全量”覆盖用户指定的 SSH 功能域、设置和交互闭环。HUHU 已有 Agent CLI、知识库和全局 MCP 等模块，不能把 Motty 的独立应用外壳、笔记、另一套 AI 引擎和全局设置全部塞进 SSH 插件。VNC/RDP 等扩展在设计中保留协议/会话类型边界；未实现时不展示伪可用入口，也不得宣称已获得 Motty 全应用的全部能力。

## 3. HUHU 当前基础与真实差距

| 当前实现 | 已有能力 | 与复刻目标的差距及处理 |
| --- | --- | --- |
| `plugins/ssh` / Node `ssh2` | HostStore、`safe://` 引用、SSH agent、多跳、逐跳指纹、PTY、Exec、SFTP、审计、插件关闭清理 | 承接宿主边界，按本 Issue 重构内部运行层；旧 `safe://` 认证改为 SSH 自管，当前实现不是从空白开始。[H-ENGINE] |
| `.huhu/ssh/hosts/<id>.json` | 稳定主机 ID、认证引用、`jumpHostIds`、tags、连接超时；有循环检查 | 缺分组树、完整导入/高级认证、独立路由与工作区/转发定义。保全旧主机数据，按 #9 处理旧认证资料后切换新模型；不保留 Safe 兼容解析器，也不能静默丢失密码或将失效引用当作可用认证。[H-HOSTS] |
| `SshManager` | 按 hostId 合并并发 connect，多个 Shell 共享一条已认证连接 | `disconnect(hostId)` 会关闭该主机全部 Shell；必须拆 Host/Connection/Shell/Pane 与资源持有关系。不能套上 Tab UI 就认为完成。[H-MANAGER] |
| `SshModule.tsx` | 主机列表 + 连接概览/终端/Exec/文件/审计 | `activeShell` 是局部状态，单终端固定 `52vh`；缺 SSH 工作区、分栏、工具附属面板和真实连接快照。[H-UI] |
| `FilesPanel.tsx` / `sftp.ts` | 单远端目录、单文件操作、只读文本预览、临时文件替换、覆盖/取消 | 当前每 host 只准一个传输，文件上限 512 MiB，预览 2 MiB；无双栏、多选/递归队列/续传/编辑/权限/SCP 回退。旧限制不能无说明地限制新传输模型。[H-FILES] |
| `TerminalView` / WS bridge | xterm.js、FitAddon、主题、5000 行回滚、64 KiB 最近输出；一名控制者，其余观察；detach 与 close 分开 | 复用渲染与控制权原则，补足分栏/窗口/外部入口；目前 WS 固定 desktop-only，不满足 MCP/CLI/Web 交互。[H-TERMINAL] |
| 21 个 `ssh.*` 能力 | 主机3、连接/信任3、Exec2、审计1、SFTP9、Shell3 | **全部 `exposable:false`**。已有业务服务但不能开放；与 #6 一起取消硬限制并补连续交互、任务和资源管理能力。[H-ENGINE] |
| 监控/转发/设置 | `forwardOut` 只用于下一跳；SSH manifest 的 `settingsPages` 为空 | 没有远端监控、用户转发规则、独立路由管理及 SSH 设置页；HUHU 全局健康状态不能替代远端监控。[H-PLUGIN] |
| Kernel / Gateway / CLI | Dispatcher、能力注册、MCP stdio/HTTP 适配、共享开放基础 | 接入实际实现；`plugins/mcp` 当前只是空壳，不能在这里另写一套 Motty 服务。[H-GATEWAY] |

当前 21 个能力为：`ssh.hosts.list/save/delete`、`ssh.connect/disconnect`、`ssh.hostKey.decide`、`ssh.exec.run/cancel`、`ssh.audit.list`、`ssh.sftp.list/read/write/upload/download/cancel/mkdir/rename/delete`、`ssh.shells.open/list/close`。最终可以统一重命名，但必须一次更新所有消费者，不保留两套名称/授权/执行分支。

## 4. 必须保持的界面与交互契约

### 4.1 导航和空间关系

- HUHU 一级功能仍进入 SSH 模块；模块二级导航承载“主机、工作区、监控、会话日志、密钥、跳板路由/代理、端口转发、已知主机、快捷命令”，底部保留本地终端和 SSH 设置入口。按 HUHU 宿主容器适配，不重复全局应用侧栏。
- 主机页保持“顶部搜索/快速连接、导入/新建、分组筛选、可折叠列表或网格、选择与批量动作”的关系。主机行包含图标、名称、账户、地址/端口、标签和连接状态。
- 会话页保持“标签/工作区、中央终端分栏、附属文件面板、监控/工具侧栏”的关系。文件、监控可与终端同时存在，不把每个操作都导航成离开终端的独立页面。
- 工具栏跟随活动 Pane；独立文件/服务器工具窗口则固定到打开它的会话。必须区分这两种绑定，不能切换 Tab 后悄悄改变已有传输或工具操作的目标。
- 搜索、键盘、右键菜单和显式按钮调用同一动作；可用/禁用、加载、空态、错误、取消、重试等状态有真实依据。
- 颜色、字号、圆角、图标材质使用 HUHU 设计系统；对象层级、操作顺序、焦点、上下文菜单和状态反馈以 Motty 为准。任何行为差异都记入对照表并说明宿主适配原因。

### 4.2 可核对的视觉证据

以下为上游仓库自带的界面图，并非本次运行截图。实现 PR 应在相同场景、相近窗口尺寸下提供 HUHU 对照图和操作记录，不能只提供一张空白主页面。

- [主机列表、分组、标签、状态](https://github.com/t8y2/motty/blob/102228261703d8f22c5eb98b1c500e2a24889dee/assets/readme-hosts.png)
- [终端与附属 SFTP 文件面板](https://github.com/t8y2/motty/blob/102228261703d8f22c5eb98b1c500e2a24889dee/assets/readme-sftp-light.png)
- [分栏终端与资源监控侧栏](https://github.com/t8y2/motty/blob/102228261703d8f22c5eb98b1c500e2a24889dee/assets/readme-monitor.png)
- [端口转发规则表](https://github.com/t8y2/motty/blob/102228261703d8f22c5eb98b1c500e2a24889dee/assets/readme-forward-light.png)

## 5. 主机、认证与连接

| 编号 | 必须迁移的功能与行为 |
| --- | --- |
| H01 | 主机新建、编辑、复制、删除、连接/断开、测试连接；名称/地址/端口/用户/协议/备注、图标/颜色、分组/标签。测试用未保存表单，不自动保存或制造隐藏终端；区分成功、可达但需要额外认证而未验证、失败。编辑字段后旧测试结果失效。 |
| H02 | 名称、地址、用户、标签搜索及快速输入 SSH 目标；多级分组树/子组、筛选、折叠、置顶、手动/自动排序、主机拖拽、列表/网格切换；右键动作与顶部动作一致。 |
| H03 | 多选连接、分组移动、跳板关联与删除，从选中主机建立工作区/监控面板；组创建/重命名/移动/删除。右键已选主机保留集合，右键未选主机只临时作用该目标；单目标动作在多选时正确禁用。 |
| H04 | 复用上游导入器及字段映射：OpenSSH config、PuTTY、Xshell、MobaXterm、WindTerm、Electerm、Netcatty、SecureCRT；保留导入预览/冲突决策/来源及不可导入项。不能承诺读取 SecureCRT 加密口令。 |
| H05 | SSH agent、身份文件、加密私钥口令、密码、keyboard-interactive 多轮/同轮多问题；OpenSSH 用户证书配对、PPK v2/v3、TOTP/HOTP 等依照上游能力适配。密码、私钥/口令和 OTP seed 由 SSH 自己管理，按 #9 的轻量本机加密方案保存；不使用 Safe/SecretUse。 |
| H06 | 在发送凭据前验证每一跳的主机密钥；首次信任、已保存信任、证书 CA/指纹以及 changed-key 错误清楚区分。Known Hosts 管理可查询/移除/更新，不能通过“自动接受全部”实现顺畅连接。 |
| H07 | 自动认证与 IdentitiesOnly、IdentityFiles、主机级 SSH keepalive、agent forwarding、X11、字符编码及登录命令；全局超时/重连策略与主机级选项分开；未配置与显式值 0 必须保持不同语义。保留 HUHU 已有每主机超时能力时明确标为宿主能力。 |
| H08 | 连接状态可查询：拨号、逐跳验证、认证、等待密码/私钥口令/交互回答、已连接、失败、取消、已关闭；错误标出失败 hop 和原因。所有等待状态可由桌面和已授权的 MCP/CLI 完成。 |
| H09 | OpenSSH config 的一次性导入和持续双向同步为不同功能，保留 ProxyJump/IdentityFile/keepalive 等字段及冲突/错误反馈；通过稳定映射与变更检测避免循环写回。导入的 ProxyCommand 未经明确确认不能在导入时执行。 |
| H10 | 密钥管理支持导入文件、粘贴私钥、生成 Ed25519、复制公钥、删除和对应口令；文件路径引用与加密保存的私钥分别处理。Known Hosts、快捷命令和会话日志具备真实管理动作。 |

密钥串、Known Hosts、主机配置和跳板引用使用稳定 ID；主机重命名、移动分组不改变引用。删除被工作区/路由/转发引用的主机时，明确展示依赖并按统一规则处理，不能留下无法解释的悬空配置。SSH 协议 keepalive 与向空闲终端输入字符的保活是不同配置，不能互相替代。[U-HOSTS]

## 6. SSH 工作区与终端

### 6.1 工作区完整流程

| 编号 | 必须迁移的功能与行为 |
| --- | --- |
| W01 | 工作区库的创建、查看、编辑（含重命名）、删除和启动；“临时”立即启动，“固定”保存模板供后续进入；运行中的临时工作区可以保存为模板。库中条目有主机数量/布局摘要、展开预览、进入与更多操作。 |
| W02 | 按分组/搜索选择和排列主机，预览布局；上游模板使用稳定 HostIDs、顺序、布局和每个 SSH 主机可选登录命令，不把密码、活连接或终端缓冲写入模板。 |
| W03 | 保留 1/2/3 列网格、左主右辅、上主下辅、内部标签页六种预设和任意自定义分割树；主辅布局的空间比例及分割拖动按上游规则。上游最多 12 个 Pane/模板主机及不重复 HostID 的约束应明确体现，不能静默丢主机。 |
| W04 | 启动时先建立完整 Tab/Pane/session 绑定，保存成功后才拨号；结构或保存失败整体回滚，不启动半个工作区。拨号后每个 Pane 独立呈现状态，一台失败不摧毁其他成功会话。取消某台连接只影响对应对象。 |
| W05 | 支持活动 Pane、最大化/还原、方向导航、交换/移动 Pane、调整布局、分割/关闭 Pane；不通过卸载终端再重建连接实现布局变化。 |
| W06 | 保存/恢复布局时区分“同进程页面重挂载/窗口转移”和“程序重启后的重连”；前者应保留活会话，后者不能伪装成 SSH TCP 连接从未中断。 |

### 6.2 终端完整流程

- 真 PTY、resize、交互输入、ANSI/真彩色、宽字符/组合字符/中文输入法、备用屏幕、鼠标协议和全屏程序行为正确；复用 HUHU 的终端渲染器，按 Motty 对照验证，不能仅显示命令输出文本。
- 新建、复制、重连、断开、关闭、重命名、锁定、重排标签页、关闭其他/右侧/下方、移至新窗口；上下/左右分割、拖动分割比例、方向切换焦点、最大化/还原；横向标签与侧栏纵向列表、同目标分组、收起/悬停展开等布局设置保留。
- 同一主机的不同账户、协议、端口、Shell 或混合主机工作区不能误合并；分组仅改变显示，不合并或断开会话。
- 终端历史搜索、命令历史、HTTP/OSC8 链接、快捷命令、关键词高亮、可选补全、显式录制和日志查看；对照表内的图像/键盘/终端协议用成熟 addon/适配达到等价行为。宿主限制须有具体证据、影响和替代操作，未达到该项要求不能按全量完成验收，不以 xterm 默认行为代替对照。快捷命令支持分组、排序、多行预览、当前/全部/勾选会话目标以及是否最终发送回车；建议插入不等于自动执行。
- 工作区广播输入必须有可见状态和清楚目标；与单 Pane 输入、终端控制权统一，不能让隐藏 Pane 或其他工作区收到意外输入。
- 终端工具栏保留位置/顺序/可见性/尺寸、移动/隐藏/恢复默认交互；Escape/无效落点取消拖放，布局不应导致终端无意义重连或输入焦点丢失。
- 本地终端、默认 Shell 与每个会话自己的 Shell 选择分开；Windows 已安装 Shell/WSL 的发现、子菜单、重连和恢复跟随原会话，文件/监控绑定实际运行环境。

登录后命令只在对应 shell 准备好后执行，恢复/重挂视图不能重复发送；工作区覆盖值与主机默认值按上游规则处理。工作区与终端依据 [U-WORKSPACE]、[U-TERMINAL] 对照。

## 7. SFTP、文件面板、编辑与传输

| 编号 | 必须迁移的功能与行为 |
| --- | --- |
| F01 | 同时保留终端附属文件面板和独立双栏 SFTP 管理器；独立管理器按设置以新窗口或主窗口 Tab 打开。一侧本地、一侧绑定的 SSH 远端，可交换左右位置，各自独立导航；不把上游描述成任意双远端选择器。 |
| F02 | 从终端打开时绑定其源会话；从主机打开时可拥有独立连接。切换当前终端不改变已打开独立文件管理器的目标；关闭文件视图和断开连接是不同动作。 |
| F03 | 路径栏/面包屑、返回/前进/父目录、刷新、排序、隐藏文件、多选/范围选择、书签、目录树、搜索/筛选、可见权限/大小/时间、列显示/列宽、属性/递归目录大小；键盘和右键菜单完整。 |
| F04 | 创建目录/文件、重命名、移动、删除、复制/粘贴、权限和所有者、链接操作；本地↔远端、跨远端复制按上游能力保留，跨远端流式中转不能要求先落盘到用户下载目录。 |
| F05 | 文件/目录递归上传下载、拖放、批量队列、并发上限、进度/速率/状态、暂停/继续、取消/重试；冲突明确选择拒绝/覆盖/续传/跳过，目录合并行为可理解。 |
| F06 | 临时文件、续传前缀验证、完整传输后的同步/原子替换；失败、取消或内容不匹配不破坏旧目标。路径越界、异常文件名、符号链接等处理沿用上游已验证规则。 |
| F07 | 远端文本编辑、编码/大小限制、行号/语法/查找替换/跳转/缩进等成熟编辑交互；保存前后内容版本/哈希冲突检查和权限保持。上游编辑器为 1 MiB UTF-8，应如实列明基线；若复用 HUHU 编辑器扩大限制，作为显式适配而非虚构上游能力。远端文档不强行登记成 Vault 笔记，也不要求知识库插件启用。 |
| F08 | 无 SFTP 时的 SCP 回退明确展示能力边界；不能有 SFTP 菜单但实际只跑 `cat`/`scp` 临时命令并虚报完整兼容。 |
| F09 | 文件 sudo 开关、同一会话中切换和退出、实际 privileged SFTP 后端；与远程工具/监控 sudo 分离，不把终端自动升级成 root，也不将临时 sudo 口令保存成普通主机密码。 |
| F10 | Bash/Zsh 终端目录→文件面板的跟随；文件目录→终端跟随独立设置，默认关闭，仅在已确认可用且空闲的 shell prompt 执行，不能向 vim、sudo 提示或运行中的命令插入 `cd`。不改写用户原有 shell 启动文件，不支持的 shell 回普通连接；重连重新建立 prompt 授权，避免刷新/目录报告造成循环。 |
| F11 | 外部编辑器（如 VS Code/Zed）使用系统已安装入口和准确 SSH 目标；私有跳板/代理无法由外部编辑器复现时给出真实原因，不生成错误直连地址。 |
| F12 | 传输中心汇总任务并能返回来源会话；关闭面板、切页不丢任务；关闭实际连接、插件停用/退出对任务的暂停/终止结果明确。 |
| F13 | 远端压缩/解压与工具可用性检查、保留时间戳；缺少远端程序显示原因，不替用户自动安装。清理传输记录不删除真实文件。 |
| F14 | 区分附属面板的递归名称搜索与独立双栏的当前目录过滤。递归搜索有界、可取消，不跟随符号链接；搜索结果用于定位，不能直接变成删除/改名/批量传输的隐式目标。 |

Web/MCP/CLI 文件来源语义继承 #6：Engine 本机路径、浏览器上传、CLI 客户端文件和远端文件分别表示；浏览器选择的文件不能被当成 Engine 的同名绝对路径。文件数据走流/任务通道，不把大文件塞进普通工具 JSON。文件视图与传输依据 [U-FILES]，目录跟随依据 [U-CWD]；跳过的反向 `cd` 不得在之后偷偷补发。

## 8. 跳板路由、代理与连接复用

| 编号 | 必须迁移的功能与行为 |
| --- | --- |
| R01 | 独立跳板路由页：全部路由/按跳板中枢分组、目标主机与完整 hop 路径、启用状态、行内编辑/启停/删除、多选批量操作。不是在主机表单里增加一个“跳板 IP”字段就完成。 |
| R02 | 按上游编辑“目标→直接跳板”关系并递归组成多跳链；目标/跳板可搜索，禁用候选标明原因，跳板必须 SSH，每目标一条直接路由。批量关联可选择是否覆盖已有关系，校验缺失主机/自身引用/循环；主机编辑页和路由页使用同一份数据。HUHU 旧 `jumpHostIds` 归一到新模型，不能双份维护。 |
| R03 | `本机 → A → B → C → 目标` 每一跳独立认证、主机密钥校验和失败定位；终端、SFTP、命令、监控、转发共用这一拨号策略，不能某类工具悄悄改成直连。 |
| R04 | 全局出站 SOCKS5/HTTP 代理、每主机继承/直连/独立代理、本机 ProxyCommand；代理凭据由 SSH 的代理配置自行维护并加密保存。ProxyCommand 的本机执行与远端 jump hop 必须明确区分。 |
| R05 | 上游 ViaShell 中继（如 `nc %h %p`）用于只开放 shell 的堡垒机；保留受控占位符替换、握手、超时、取消和关闭语义，不能靠向可见交互终端连续敲多次 `ssh` 冒充链路。 |
| R06 | 路由停用保留配置，按上游行为让后续连接改为直连，已经打开的会话不变；界面明确这一结果。启用状态不是常驻隧道在线状态，配置路径与实际运行链分开显示。 |
| R07 | “将本机代理共享给远端”独立辅助流程：检测本机 HTTP 代理、启动/测试/停止 SSH 反向转发、复制远端启用/还原环境命令及 Docker 代理配置说明。复制动作不偷偷修改远端 shell/Docker 配置。 |

全局出站代理只作用第一段 TCP（有跳板时为第一跳）；本机 ProxyCommand 的 `%h/%p/%r/%%` 与远端 ViaShell 占位符规则不能混用。所有网络策略与字段按 [U-ROUTES]、[U-PROXY] 复刻。

## 9. 端口转发与专用隧道

| 编号 | 必须迁移的功能与行为 |
| --- | --- |
| P01 | Local、Remote、SOCKS5、HTTP CONNECT 四种规则；名称、SSH 主机、回环监听端口、目标地址/端口、模式、状态、恢复选项。上游 UI 固定 `127.0.0.1`，显示实际绑定地址；不虚构任意网卡输入框。动态代理没有固定目标时不强行填假地址。 |
| P02 | 规则列表与编辑器；新建、编辑、删除、启动、停止、重试；规则保存不等于已经监听。运行中编辑先停止旧规则再保存；删除先回收资源；启动/失败/停止/恢复中显示真实状态。 |
| P03 | 运行时优先复用可用 SSH 会话，也可复用/创建无终端 Tab 的专用隧道连接；明确借用或自有的生命周期。关闭一个不相关 Tab 不能终止专用隧道。 |
| P04 | 按上游保留显式 Resume 选择、断线重连与规则恢复；用户主动停止后不自动复活，重复点击/重试不产生重复监听器。 |
| P05 | 当前连接数、累计连接、上传下载字节、最后错误及真实绑定地址；端口冲突、服务器禁止 remote forward、跳板断链有可诊断结果。 |
| P06 | 默认及上游现有规则保持回环监听约束；Remote 规则的监听端与目的端位置明确。SOCKS5/HTTP CONNECT 是“SSH 出口代理”，不与“连接 SSH 时使用的出站代理”混为一个设置。 |
| P07 | Local/SOCKS5/HTTP CONNECT 的显式 ViaShell 中继设置可用于禁止 direct-tcpip 的服务器；Remote 不支持该替代。模式切换同步调整字段显示/校验，不能保存无效组合。 |

名称/端口范围按上游校验，但允许多条未运行规则保存相同端口，在启动时报告真实端口占用。多规则共享专用连接，停止一条不影响另一条，最后一个持有者释放后关闭专用连接。[U-FORWARD]

本模块是持久规则管理和真实 TCP 转发，不是展示一段供用户复制执行的 `ssh -L/-R/-D` 命令。

## 10. 监控、多主机仪表盘与服务器工具

- **终端附属监控**：绑定活动 Pane 的真实主机/环境，可与文件面板同时使用；左右停靠、收起/暂停/继续/重试，1/2/5 秒刷新；概览、磁盘、网络及硬件详情，CPU/每核、内存、负载、运行时间、磁盘容量、网卡吞吐、GPU/登录会话等按系统支持情况呈现。不支持和未采样显示明确状态，不能填假零。
- **多主机仪表盘**：支持多个命名面板的新建/编辑/删除、名称/备注/主机集合；选择主机和排列顺序是清楚的步骤，可按分组/搜索/仅已选/全选匹配，拖拽或键盘排序。主机页多选可加入面板；简洁/详细显示、逐主机视图/重试/开终端。创建只保存定义，手动“开始监控”才连接/采样；每台主机独立显示未开始/连接中/运行/停止/失败/不支持/已移除。
- **采样与历史**：保留上游 2/5/10/30/60 秒仪表盘采样选项，15 分钟/1/6/24 小时有界内存历史，不声称为跨重启时序库；断线/暂停有明确空隙。同主机被多个运行面板引用时共享采集源并采用最快所需周期，慢元数据查询与快速资源采样解耦。页面隐藏继续已启动采集，但不驱动隐藏画面重绘；停止监控不关闭用户终端。
- **系统适配**：区分远端 Linux/macOS/Windows、本地系统及 WSL；采样失败、权限不足、工具缺失显示明确降级。不要为了显示监控要求用户在每台远端常驻安装自研 Agent。
- **进程/Docker 工具**：进程列表与终止、容器/镜像相关查看和操作、日志/容器终端等复刻上游可用项；独立可移动/缩放窗口绑定打开它的会话，同会话再次打开聚焦现有窗口，不同会话分别打开。关闭工具窗口取消查询但不关闭 SSH。
- **sudo**：文件、远程工具/终端监控、各仪表盘主机各有清晰作用域和状态；不会因一个开关导致全部主机或整个终端提权。

监控来源 [U-MONITOR]；服务器工具使用固定命令/受校验参数并绑定原会话，见 [U-REMOTE]。

## 11. 设置：保留原分类、默认值和实际生效对象

设置采用 Motty 的“左侧类别/搜索，右侧分组字段”结构，映射进 HUHU 的 SSH 设置容器，避免把所有配置堆成单个超长表单。

| 类别 | 必须覆盖 |
| --- | --- |
| 通用/布局 | 标签方向、纵向标签分组/收起、导航项显隐、工具栏位置/顺序/尺寸/显隐、恢复默认、设备本地布局偏好 |
| 终端 | 字体/字号/行距、配色方案、光标/滚动/回滚、复制粘贴/右键/选词/链接、关键词/补全/通知、默认本地 Shell、快捷键/命令面板、录制与历史设置 |
| 连接 | 超时、重试/自动重连、keepalive 间隔/次数、连接共享、恢复时是否重连、启动自动连接目标、代理与每主机覆盖、默认认证与身份限制、终端/SFTP 初始行为、逐跳连接状态、SSH Config 同步 |
| 文件 | 隐藏文件/排序/双栏、附属面板自动打开与左右位置、路径栏模式、目录树/列设置、独立 SFTP 的窗口或 Tab 模式、传输并发/覆盖策略/时间戳、默认下载目录、双向目录跟随的独立开关、外部编辑器 |
| MCP | 服务状态、HTTP/stdio 使用配置、客户端示例复制、SSH 工具分类与搜索、共享开放设置入口、允许调用对象、调用/任务状态和审计记录 |
| 凭据与已知主机 | SSH 自有主机密码、私钥/口令、代理认证及 Known Hosts 管理；保留上游认证交互与密钥操作，直接在 SSH 内配置，不要求用户操作 Safe |

每项设置在对照表记录：上游字段/默认值/存储范围 → HUHU 字段/控件/生效时机。设备布局、文件路径、Shell/编辑器选择等机器相关值与可迁移主机配置分开；“保存成功”必须对应实际终端、连接、文件或工具行为变化。全应用语言/主题/托盘等由 HUHU 全局设置承接，避免重复配置。[U-SETTINGS]

## 12. MCP：复制工具语义，接入 HUHU 统一能力

### 12.1 上游事实，避免将两种模式混写

Motty 提供窗口内 HTTP MCP 和无窗口 `motty mcp-serve` stdio。两者复用部分工具语义，但工具集合、对象 ID 和运行载体不同，不能照 README 概述假定完全等价。[U-MCP]

| 工具或行为 | 窗口内 HTTP | stdio `mcp-serve` |
| --- | --- | --- |
| `list_hosts` | 列出明确允许代理访问的保存 SSH 主机，返回稳定 host ID，不连接 | 同样按保存主机授权筛选，不连接 |
| `list_sessions` | 所有窗口的已打开终端，使用 session ID；不是 `list_hosts` 的同一授权集合 | 授权保存主机，使用 host ID；并非列出 UI Tab |
| `terminal_read` | 有；可读 screen/scrollback，1–500 行 | 无相同的可见终端读取能力 |
| `terminal_exec` / `terminal_exec_many` | 在可见终端执行；many 为 2–8 个目标 | 按模式开放，使用独立 SSH exec channel；无持久 shell 状态，可指定本次绝对 POSIX cwd |
| `terminal_start/poll/stop` | 有后台 job；每终端一个；offset 轮询、停止该命令 | 源码也已经支持；独立 channel，可并发；不是文档旧称的“只在 HTTP 可用” |
| `tool_output_read` | 已保留 exec 输出分页读取，不重新运行命令 | 无此同名窗口输出工具 |
| `sftp_list/read/write/remove` | 有，写/删受模式及执行 gate 约束 | 有；读支持较完整分页/offset/tail/base64，写/删要求相应模式 |
| `sftp_stat/checksum` | 无同名增强工具 | 有，checksum 支持流式 SHA-256/512 |
| `sftp_upload/download`、`transfer_status/cancel` | 无这一组同名增强工具 | 有，上传下载需全允许及 transfer-root；支持二进制/目录、冲突策略、异步任务 |
| `rzsz_upload/download` | 有，使用当前可见终端的 ZMODEM 环境 | 无对应可见终端工具 |
| `note_query/edit` | 有 | 有；属于上游笔记系统，本次不复制成 SSH 内另一份笔记 |
| 工具发现 | `tools/list` 使用 `tools.All()`；观察等限制主要在执行 gate | 随模式裁剪命令/写工具 |

**上游限制也要保留为事实：** stdio 不自动处理未信任/变化的主机密钥、交互 OTP/锁定凭据，当前拒绝 ProxyCommand；它没有完整的 host/group CRUD、工作区/路由/转发/监控管理目录。HUHU 后续增加可查询等待交互和全领域管理合同，是对上游未开放部分的整合扩展，不能写成直接搬来就已有。

MCP 设置页的成熟交互需要保留：[U-MCP-UI]

- HTTP 组：实际服务开关/监听地址、观察/询问/全部允许的上游模式、复制地址/token、重置 token、客户端选择、掩码配置预览、复制可用配置。
- stdio 组：启动命令/JSON/TOML/YAML 预览、当前数据目录、主机范围与模式、客户端选择、最近活动及清理；上游已有进程读启动时设置，需重启才应用新策略，这是其限制，不能复制成 HUHU 开关不及时生效的借口。
- 上游模板包括 Claude Code、Cursor、CodeBuddy、ZCode、TRAE、VS Code、Windsurf、Codex、DeepSeek Harness、OpenCode、Cherry Studio、Qoder、WorkBuddy、Pi Coding Agent。迁移时替换为 HUHU 的真实命令/地址/凭据，配置预览脱敏，显式复制才提供可用值。
- 后台命令返回稳定 job ID；分页使用 UTF-8 字节 offset，返回状态、退出码、next_offset、截断/跳过信息。未知退出码不能冒充 0，poll 不能重新执行。HTTP job/输出按 MCP 会话归属，不能同 token 跨会话读取或停止其他任务。
- 任务/输出有界并有明确保留策略：上游 stdio 命令最多 8 个运行/64 个保留，传输 4 并发/32 历史；HTTP 完成 job 保留 10 分钟。迁入时保留有界与可查询结果语义，任何数值调整在对照表说明，不能无限保留或隐式丢失。
- 文件 local path 是 MCP/Engine 所在机器；真正完成状态为 completed，不能仅凭拿到任务 ID 或进度 100% 宣告成功。审计保留工具、目标、命令/路径及结果，不把所有终端输出和明文秘密写入普通日志。

### 12.2 HUHU 目标：UI 与工具操作同一份业务

1. 使用 #6 的单一能力目录、Dispatcher、工具开放配置、HTTP/stdio MCP 和 CLI；SSH 设置页可呈现筛选为 SSH 的同一配置视图，不能另外保存 `sshMcpEnabledTools`。
2. SSH 模块停用、MCP 服务停用、具体工具关闭是不同状态：模块停用终止其运行资源；MCP 停用不把用户桌面 SSH 连接全部断开；工具偏好保留且所有入口一致。
3. 上游的 Observe/Ask、stdio 授权列表和风险审批属于上游产品事实；迁入时按 #6 的统一开放策略实现，不复制第二套逐次审批、第二套永久禁用或独立安全分类器。主机密钥信任、密码/口令输入等 SSH 协议必需交互继续支持。
4. Motty 已有工具作为行为基线；HUHU 还需把主机、工作区、路由、转发、监控、配置、任务管理等所有本 Issue 新增的用户动作登记到共同目录。不能误称 Motty 原本已经通过 MCP 暴露了全部这些管理功能。
5. `hostId`、`connectionId`、`shellId/sessionId`、`workspaceRunId`、`transferId`、`forwardRunId`、`jobId` 分开；不得复制上游 HTTP 与 stdio 对 `list_sessions` ID 语义不一致的行为。
6. 提供连接开始/快照/等待交互查询/应答/取消、终端输出游标读取/写入/resize/控制权、命令启动/轮询/停止、传输创建/进度/暂停/取消/续传等完整合同。外部调用无需先由桌面打开一个隐藏 Tab 才能工作。
7. 新连接、传输、后台命令、启动工作区/转发等返回稳定操作 ID，支持幂等请求、状态查询、取消和明确结束原因；超时不能被误报为业务失败后任意重做。
8. 工具描述、输入输出 schema、scope、风险标签、错误及可用性从同一声明导出；按主机/终端/文件/工作区/路由/转发/监控/设置分类，可以搜索与批量开放。高危是可识别的分类，不是永久禁止用户开放。
9. 从 MCP/CLI 输入终端与桌面共享控制权仲裁；只观察者不能写入或改 PTY 大小。网页/CLI 断开、切页不自动等于结束服务端任务。
10. 若保留按主机授权/对象选择交互，其资源范围纳入 #6 的共同调用判定和共享策略；SSH 设置与全局网关读取同一份数据，不增加只供这一页使用的主机白名单，也不扩成多用户权限平台。

| Motty 配置交互 | HUHU 的对应落点与适配 |
| --- | --- |
| HTTP 服务开关、地址、token/配置复制 | 显示/操作 HUHU 全局 MCP 的同一服务及凭据，不为 SSH 新开端口或生成独立 token |
| `motty mcp-serve` 客户端配置 | 使用真实 `huhu mcp`/统一入口命令，调用同一个 Engine 内 SSH 服务；不由 CLI 再启动另一套独立 SSH 引擎 |
| 观察/允许命令/全部允许 | 可作为 #6 同一工具选择的便捷预设，展示实际将改变的能力集合；不保存第二套模式权限或绕过业务校验 |
| 主机范围 | 纳入共同资源判定，host 与 session ID 明确分离，改变后各入口按同一策略生效 |
| 最近活动/后台任务 | 查看同一审计与任务服务的状态；工具关闭不伪装已发生业务被回滚，停止任务是显式操作 |

以下是**目标能力分组示例，最终名称由统一契约确定**，不能另建第二套别名接口：

| 分组 | 应覆盖的用户操作 |
| --- | --- |
| `ssh.hosts.*` / `ssh.groups.*` | 查询、新建、编辑、复制、删除、导入、标签/分组、认证配置引用 |
| `ssh.connections.*` / `ssh.prompts.*` | 开始/列出/查询/关闭/重试，逐跳状态、信任/认证等待项查询与应答 |
| `ssh.shells.*` / `ssh.jobs.*` | PTY 创建/读取/输入/resize/attach/detach/关闭，命令启动/轮询/取消 |
| `ssh.files.*` / `ssh.transfers.*` | 文件目录操作、编辑读写与冲突、权限、上传下载/跨远端复制及队列管理 |
| `ssh.workspaces.*` | 模板 CRUD、启动/状态/停止、布局/Pane、保存运行布局为模板 |
| `ssh.routes.*` / `ssh.proxies.*` | 路由/代理 CRUD、主机关联、顺序/循环校验、启停/批量操作 |
| `ssh.forwards.*` | 规则 CRUD、启动/停止、恢复偏好、运行状态与统计 |
| `ssh.monitor.*` / `ssh.remoteTools.*` | 订阅/取消/快照/历史、仪表盘设置、进程与容器工具 |
| `ssh.settings.*` / 配套能力 | 读取/修改 SSH 设置、已知主机、快捷命令与会话日志；主机/密钥/代理凭据由 SSH handler 管理，普通查询脱敏，显式秘密读取遵守 #6 用户选择 |

## 13. 技术移植方案与生命周期

### 13.1 保留宿主，优先搬可复用的上游实现

Motty 为 Go + Viva 原生绘制，HUHU 为 Electron + TypeScript/React。**复制业务实现和交互不等于把 Viva 窗口套进 Electron，也不等于把全部 Go 协议逻辑重新手写成 TypeScript。**

- 前端保留 HUHU 工作台、设计系统、主题、宿主能力和成熟终端/编辑器；从 Motty 的状态、事件处理、菜单和布局规则逐项移植，保留来源关联。
- 后端优先提取 `internal/sshconn`、`internal/portforward`、`internal/sftpclient`、`internal/scpclient`、监控采样等 Go 实现及对应测试，作为 **SSH 插件私有的单一原生执行组件**。HUHU `plugins/ssh` 保留公共契约、配置、自有凭据管理、审计及事件适配。
- 先做一次限定范围的提取验证：直接连接→多跳→PTY→SFTP→转发，核实依赖与打包。`sftpclient/worker.go` 直接引用 Viva 的 `leaks`，不能声称这些目录无依赖地复制即可；只替换必要的生命周期/通知钩子，记录适配。协议算法和文件完整性处理优先保留上游实现。
- 如采用 Go 组件，它应成为现有 SSH 服务的执行实现：TS `SshManager` 作为薄适配，删除被替换的 ssh2 执行路径；不能同时让 Go 和旧 ssh2 各自拥有一套连接池。若有组件无法直接提取，先给出具体依赖证据和替代复用来源，不以语言不同为由全面重写。
- 不搬入 Motty 全局 SQLite/configstore、MCP server、更新器或应用主窗口。主机/路由/工作区/规则使用 HUHU Vault 的文件真源，索引/缓存可重建；可复用 Motty 成熟的凭据交互/加密机制做小范围适配，但仅供 SSH 私有使用，不把它扩成第二套跨模块保险箱。认证数据按 #9 保存与备份，不再走 SecretUse。
- 原生进程启动、版本/校验、平台产物及 Electron 打包参考项目已有 Herdr 交付模式，但不要把 Herdr 专用类误当成现成通用运行时，也不要把 SSH 会话交给 Agent CLI 管理。
- TS 与原生组件采用插件私有进程通信或本机 IPC，明确定义协议版本/错误/事件和流；原生组件不另开用户可访问的业务网关，UI/MCP/CLI 仍先经既有 Dispatcher。
- SSH 原生进程由 SSH 插件/Vault 管理：停用插件、切换/关闭 Vault 必须清理资源并结束进程，不能照搬 Herdr `dispose()` 只 detach、保留 Core 的行为。临时视图关闭与插件关闭分别处理。
- 本地 PTY/Shell/WSL 也要有真实执行器和来源映射，优先提取 Motty `internal/localshell` 或复用适合的成熟实现；关闭 Agent CLI 插件后 SSH 的本地终端仍可使用，不隐含依赖 Herdr Space/session。
- 原生组件作为受版本控制的应用产物随包分发，支持项目声明的平台/架构、校验与缺件失败；不能把安装 Go 编译器或手动克隆 Motty/Viva 变成最终用户使用 SSH 的前置条件。

### 13.2 对象分离和关闭语义

| 对象 | 语义与必须保持的边界 |
| --- | --- |
| Host | 保存的地址/账户/SSH 自有认证配置；密码等可在内部独立加密记录，不是 Safe 引用、唯一活连接或唯一终端 |
| Route / Proxy | 可引用的网络策略；记录配置版本和实际拨号路径 |
| Connection | 一次认证后的传输实例；有稳定 ID、真实状态和持有者 |
| Shell / Session | 连接内的 PTY/命令会话；可独立创建关闭，输出与控制权独立 |
| WorkspaceTemplate / WorkspaceRun | 可保存布局与主机引用 / 一次运行实例；模板不保存密码或活连接对象 |
| Tab / Pane | 展示和布局对象；重排/切页/缩放不意味着重建 SSH |
| FileSession / Transfer | 绑定明确连接和路径的文件操作；页面切换不改变传输目标 |
| ForwardRule / ForwardRun | 保存规则 / 某次监听与连接所有权；专用隧道和借用会话分别释放 |
| MonitorSubscription / Job | 采样订阅 / 命令任务；取消自己不误杀其他消费者 |

关闭 Pane、关闭 Tab、关闭独立 SFTP、停止隧道、停止监控、显式断开连接、停用 SSH 插件分别定义行为。**拥有者和借用者分开，借用不自动取得延长连接生命周期的权利。** 关闭拥有连接的会话时，依赖对象按上游规则结束、报错或进入已显式开启的 Resume；独立隧道由转发运行实例持有，不受无关 Tab 影响。关闭借用视图/工具只释放自身资源。真实多 Shell 共享传输按拥有关系释放，不能把旧 `disconnect(hostId)` 用作关闭单 Pane。取消时释放 socket/channel/listener/worker 和待处理认证，避免悬挂后台资源。

### 13.3 UI、工具和持久化同源

桌面/网页 UI、MCP、CLI 都通过既有 Dispatcher/SSH 领域服务执行相同动作并读取相同快照/事件，不能只让前端 state 改成功、实际运行层未变化。保存配置与运行态分开，保留 revision/冲突处理；切 Vault 时释放旧运行对象，防止新页面向旧主机写入。

### 13.4 SSH 自有凭据：一个表单、同一 handler、直接可用

- 新增/编辑主机时直接填写 `host/port/user` 和所选认证方式；密码、粘贴/导入私钥、私钥口令、SSH agent、必要的交互认证均留在 SSH 流程。允许测试连接；保存成功对应同一份配置与凭据，不先跳保险箱创建条目。
- `ssh.hosts.*`、密钥管理与代理配置的写 handler 同时服务桌面/Web/MCP/CLI。更新中省略秘密字段表示保留，显式替换与清空各自明确；掩码不是密码值。普通列表/读取只给认证方式、已配置状态和必要标识，不返回明文，显式读取遵循 #6。
- 持久秘密按 #9 的轻量本机加密方案保存在 SSH 所属范围；临时认证回答按实际需要留在内存，不进入主机 JSON、模板、日志或普通导出。保存私钥与引用用户本机身份文件分别处理；本机路径和 SSH agent 不假装可跨设备恢复。
- 不引入额外主密码、逐模块授权矩阵、通用密钥代理服务或插件凭据市场。密码/私钥被运行层使用是 SSH 的内部业务，工具调用只需相应 SSH 能力授权与协议必需交互。
- Safe 未初始化、锁定、停用都不影响已配置 SSH。失败状态定位到缺失认证、本机加密钥匙不可用、主机信任或服务器拒绝等实际原因；MCP/CLI 能直接补齐配置/回答，不要求先 reveal 或手动打开桌面。
- 旧 `safe://` / `passphraseRef` 配置按 #9 的一次性保全/重配决定处理；不将新模型改造等同于允许删除旧密码。删除旧读取链、Safe UI 选择器、依赖声明、事件与相关示例，Git 同步/备份按新凭据边界一起更新。

## 14. 源码迁移映射、许可证与文档

下列目标目录为实施落点建议；现有文件按源码真实位置列出，新文件可在同一插件内合理拆分。包名以代码为准，上游实际是 `internal/portforward`，README 的 `internal/forward` 概述不能作为复制路径。

| Motty 主要来源 | HUHU 落点 / 迁移方式 |
| --- | --- |
| `internal/workbench/host_*`、`model.go`、`internal/sshconfig` | `plugins/ssh/src/ui/` 主机目录/编辑器/导入/组管理；`engine/hosts.ts` 及共享 DTO；保留稳定 ID 和字段语义 |
| `internal/workspace`、`workbench/workspace_*`、`tab_menu.go` | SSH 自有工作区模板/运行模型与 UI；布局算法/序列化/测试优先复用，可抽无领域依赖的通用 Pane 组件 |
| `internal/sshconn`、`workbench/connection.go` | 插件私有原生核心与 `engine/manager.ts` 薄适配；认证/逐跳/共享/状态/取消全部接统一契约 |
| `workbench/proxy*`、`outbound_proxy.go`、`local_proxy*` | SSH 路由/代理页、配置实体与运行诊断；全局/每主机代理、本机共享代理分别处理 |
| `internal/portforward`、`workbench/forward*` | 原生转发/专用隧道 + TS 规则服务 + React 管理页；配置与运行分离 |
| `internal/sftpclient`、`internal/scpclient`、`workbench/sftp*`、`transfer_center.go` | 替换/扩展现有 `engine/sftp.ts`、`FilesPanel.tsx`；新增双栏/文件会话/任务中心/编辑/冲突 UI，复用上游完整性测试 |
| `docs/terminal-folder-sync.md`、`sshconn/integration*`、shell 相关代码 | SSH shell integration 与文件面板跟随，复用 `packages/ui/.../TerminalView.tsx` 并补成熟 addon；不搬 Viva 原生绘制器 |
| `internal/localshell` | SSH 模块独立本地 PTY 与 Shell/WSL 适配；已有终端 UI 不能被当作已有本地执行服务 |
| `internal/remotestats`、`internal/monitoring`、`workbench/monitor*`、`remote_tools*` | 原生采样/共享源/历史和 SSH 监控页、侧栏、独立工具窗口 |
| `workbench/settings*`、`sftp_extra.go`、快捷键/日志/密钥等 | SSH `SettingsPageContribution` 和配套页面；语言/主题/窗口行为引用全局宿主设置 |
| `internal/ai/tools`、`workbench/agent_jobs.go`、`ai_mcp_config*` | 复用工具 schema/任务语义/客户端配置模板；登记在 `plugins/ssh/src/engine/index.ts`，接 kernel Dispatcher/MCP 与 `apps/cli`，不复制 AIHub 服务 |
| `internal/configstore`、`internal/vault`、应用启动/更新代码 | 研究并复用必要的 SSH 凭据行为/成熟加密实现，适配 HUHU Vault 与模块私有保存及现有打包；不引入 Motty 全局数据库、跨模块秘密服务或第二更新系统 |

HUHU 原生交付参考 [H-NATIVE]，公共能力和 MCP 接入参考 [H-GATEWAY]。SSH 远端文件编辑可复用 #2 的通用编辑组件，但不依赖知识库领域的笔记对象。

复制条目必须写入现有 `docs/upstream/ledger.md`，记录上游 URL、固定 SHA、原始文件、HUHU 目标文件、直接复制/必要改造/行为复刻及改动理由。维护 `UPSTREAM.md`/第三方声明并同步现有 notice 生成流程。

Motty 主仓库标示 Apache-2.0，`NOTICE` 列出额外组件；名称和 Logo 不在该授权范围。保留所复制代码的 LICENSE、NOTICE、版权和修改说明，第三方组件按各自声明处理；HUHU 使用自己的品牌资源。Viva 单独许可，不能因为 Motty 可复制就默认整套 Viva UI/资源也可以随意搬入。[U-LICENSE]

同步更新现行 `.agents/dev/changes/` 下的需求、设计、接口、任务和验收说明，以及 SSH 用户文档、MCP/CLI 示例、打包说明、能力映射与开发指南。建立一份“功能 ID → Motty 源码/截图 → HUHU 实现/公开能力 → 验收证据”对照表；未实现/不适用/宿主差异明确标记，不能只有勾选没有证据。

## 15. 实施顺序与交付

| 阶段 | 交付结果 |
| --- | --- |
| S1：锁定复刻基线 | 保存本 Issue 的功能/交互对照、关键截图、数据对象与生命周期；完成 Go 核心提取及桌面打包可行性验证，决定必要适配点 |
| S2：主机/路由/连接 | 认证与已知主机、SSH 自有凭据保存/更新、代理/多跳/中继、独立 Connection/Shell、可查询的等待交互与取消；移除 Safe 依赖并逐项替换旧实现 |
| S3：工作区/终端 | 完整模板库、临时/固定、布局/Pane/Tab、焦点/输入控制/恢复、快捷键/工具栏与配套日志/快捷命令 |
| S4：文件/传输 | 附属面板+独立双栏、队列/续传/冲突/编辑/SCP/sudo、目录同步、外部编辑器 |
| S5：转发/监控 | 四种规则、专用隧道与恢复、资源侧栏、多主机仪表盘、进程/Docker 工具 |
| S6：设置/公共能力 | 全部对应设置生效；与 #6 联动覆盖每个用户动作、MCP/CLI 无桌面依赖闭环、开关和状态同源 |
| S7：对照验收和清理 | 真实主机和关键异常场景验证、上游/HUHU 操作对照、平台打包、来源与文档完成；删除失效代码/双状态/临时兼容入口 |

阶段可拆 PR，但每个 PR 更新受影响调用方；不能因先交付 UI 就宣布 SSH 已全量复刻。测试复用上游有价值的协议/传输用例和 HUHU 现有设施，覆盖真实行为与生命周期，不为本次另建庞大 CI 平台。

## 16. 验收标准

- [ ] A01 主机搜索/快速连接、分组/标签、列表/网格、右键/多选/导入与认证字段对照完整，配置真实保存。
- [ ] A02 真实直连及至少三层跳板链均能完成终端、SFTP、监控、转发；逐跳信任/认证、拒绝/取消、主机密钥变化可定位。
- [ ] A03 路由页独立可用，完整路径、批量关联/启停、代理继承/直连/独立覆盖、ProxyCommand/ViaShell 均有证据，循环关系被阻止。
- [ ] A04 临时和固定工作区按原流程工作，六种预设+自定义分割、主机顺序、登录命令、保存/编辑/恢复完整；结构保存失败不提前拨号。
- [ ] A05 同一主机同时打开多个终端、文件视图、监控和转发，关闭不相关 Pane/Tab 不误杀其他会话；连接拥有者关闭时正确结束或恢复依赖任务；单台失败不摧毁工作区。
- [ ] A06 真实全屏程序、中文 IME、resize、焦点、广播、搜索、录制和横/纵标签交互可用；切页/分割/拖动不重连；Agent CLI 插件关闭时 SSH 本地终端仍可用。
- [ ] A07 附属文件面板、独立新窗口/Tab 双栏均可用，独立窗口目标不随全局活动 Tab 改变。
- [ ] A08 递归上传下载/跨远端复制、暂停/续传/取消/重试、冲突/断网/目标改变覆盖可验证；失败不损坏原文件，队列不无限膨胀。
- [ ] A09 远端编辑保存冲突和权限保留有效；SCP 回退和文件 sudo 有真实能力检测及不支持提示；双向目录同步不干扰运行中的 shell 程序。
- [ ] A10 四种转发实际转发流量；端口冲突、服务端拒绝、跳板断开、专用连接、Resume/主动停止、字节统计真实且无重复监听。
- [ ] A11 单终端监控和多主机仪表盘显示真实指标、历史、采样/暂停/错误；关闭监控不关闭终端；进程/Docker 窗口绑定正确主机。
- [ ] A12 设置按通用/终端/连接/文件/MCP 分类，搜索/默认值/恢复/作用范围正确，保存后能在对应功能中观察到效果。
- [ ] A13 只用已授权 MCP 完成列主机→连接→处理等待交互→命令/后台任务→文件传输→查状态→停止；CLI 完成等价流程，无需先手动点桌面连接。
- [ ] A14 工作区/路由/转发/监控/设置等新增用户操作全部进入 #6 公共目录；不是只开放 Motty 原有终端/文件工具子集。
- [ ] A15 SSH 设置与全局 MCP/CLI 页显示同一工具选择；关模块/关 MCP/关工具的状态与实际调用一致，未复制第二套权限或审批平台。
- [ ] A16 工具重试不重复连接/运行/监听/传输，终端控制权不冲突，输出游标/进度/错误/取消结果可消费；旧缓存工具名不能绕过当前开放状态。
- [ ] A17 切 Vault、关闭会话、停用插件、原生组件退出/崩溃后资源回收和 UI 状态正确，既无孤儿进程/端口，也不误结束其他插件会话。
- [ ] A18 按项目支持平台验证原生组件启动/打包/路径；缺产物在打包阶段失败，不等到用户点连接才发现不可用。
- [ ] A19 功能对照表、截图/操作记录、最小真实主机验证、来源台账、许可证/NOTICE、用户与 MCP/CLI 文档齐全；清楚标记未实测平台和上游已有限制。
- [ ] A20 不留下只有菜单无执行器、只有开关无实际效果、UI 和工具各存一份状态、Go 与 ssh2 双连接池、第二套 Motty MCP/全局 SQLite/跨模块保险箱等问题。
- [ ] A21 Safe 未初始化/锁定/停用时，桌面与已授权 MCP/CLI 均能新增/修改主机密码或私钥、测试并连接；秘密更新的保留/替换/清空正确，普通读取和导出不泄露明文，旧 Safe 读取与依赖已移除。

### 固定源码来源索引

以下链接全部固定到分析提交。表格中的引用给出主要入口，补充文件用于核对边界、UI 与运行细节。

### Motty

- 总览：[README](https://github.com/t8y2/motty/blob/102228261703d8f22c5eb98b1c500e2a24889dee/README.md)、[完整设置分类](https://github.com/t8y2/motty/blob/102228261703d8f22c5eb98b1c500e2a24889dee/internal/workbench/settings_nav.go)、[侧栏顺序](https://github.com/t8y2/motty/blob/102228261703d8f22c5eb98b1c500e2a24889dee/internal/workbench/sidebar_pages.go)。
- 主机：[菜单与选中动作][U-HOSTS]、[主机模型](https://github.com/t8y2/motty/blob/102228261703d8f22c5eb98b1c500e2a24889dee/internal/workbench/model.go)、[草稿连接测试](https://github.com/t8y2/motty/blob/102228261703d8f22c5eb98b1c500e2a24889dee/internal/workbench/host_test_connection.go)、[认证说明](https://github.com/t8y2/motty/blob/102228261703d8f22c5eb98b1c500e2a24889dee/website/content/docs/connections/hosts-and-authentication.zh.mdx)。
- 工作区：[完整结构保存后启动][U-WORKSPACE]、[模板与数量约束](https://github.com/t8y2/motty/blob/102228261703d8f22c5eb98b1c500e2a24889dee/internal/workbench/workspace_template.go)、[六预设及自定义布局](https://github.com/t8y2/motty/blob/102228261703d8f22c5eb98b1c500e2a24889dee/internal/workspace/spec.go)、[工作区库](https://github.com/t8y2/motty/blob/102228261703d8f22c5eb98b1c500e2a24889dee/internal/workbench/workspace_library.go)。
- 终端：[功能与交互][U-TERMINAL]、[Tab 菜单](https://github.com/t8y2/motty/blob/102228261703d8f22c5eb98b1c500e2a24889dee/internal/workbench/tab_menu.go)、[逐跳/认证/连接实现](https://github.com/t8y2/motty/blob/102228261703d8f22c5eb98b1c500e2a24889dee/internal/sshconn/conn.go)。
- 文件：[固定会话双栏][U-FILES]、[作为主窗口 Tab](https://github.com/t8y2/motty/blob/102228261703d8f22c5eb98b1c500e2a24889dee/internal/workbench/sftp_tabs.go)、[传输中心](https://github.com/t8y2/motty/blob/102228261703d8f22c5eb98b1c500e2a24889dee/internal/workbench/transfer_center.go)、[队列与原子提交](https://github.com/t8y2/motty/blob/102228261703d8f22c5eb98b1c500e2a24889dee/internal/sftpclient/worker.go)、[目录同步][U-CWD]。
- 路由：[配置/校验/启停][U-ROUTES]、[路由页面](https://github.com/t8y2/motty/blob/102228261703d8f22c5eb98b1c500e2a24889dee/internal/workbench/proxy_paint.go)、[出站代理][U-PROXY]、[本机 ProxyCommand](https://github.com/t8y2/motty/blob/102228261703d8f22c5eb98b1c500e2a24889dee/internal/sshconn/proxycommand.go)、[本机代理分享](https://github.com/t8y2/motty/blob/102228261703d8f22c5eb98b1c500e2a24889dee/internal/workbench/local_proxy_ui.go)。
- 转发：[规则与运行流程][U-FORWARD]、[专用隧道](https://github.com/t8y2/motty/blob/102228261703d8f22c5eb98b1c500e2a24889dee/internal/workbench/forward_tunnel.go)、[四模式转发核心](https://github.com/t8y2/motty/blob/102228261703d8f22c5eb98b1c500e2a24889dee/internal/portforward/forward.go)。
- 监控：[命名面板与采集生命周期][U-MONITOR]、[终端侧栏](https://github.com/t8y2/motty/blob/102228261703d8f22c5eb98b1c500e2a24889dee/internal/workbench/monitor.go)、[历史与共享源](https://github.com/t8y2/motty/blob/102228261703d8f22c5eb98b1c500e2a24889dee/internal/monitoring/history.go)、[采集器](https://github.com/t8y2/motty/blob/102228261703d8f22c5eb98b1c500e2a24889dee/internal/remotestats/stats.go)、[服务器工具][U-REMOTE]。
- 设置：[分组声明][U-SETTINGS]、[文件设置](https://github.com/t8y2/motty/blob/102228261703d8f22c5eb98b1c500e2a24889dee/internal/workbench/sftp_extra.go)。
- MCP：[工具目录][U-MCP]、[stdio 文件增强](https://github.com/t8y2/motty/blob/102228261703d8f22c5eb98b1c500e2a24889dee/internal/ai/tools/host_files.go)、[HTTP 跨窗口 hub](https://github.com/t8y2/motty/blob/102228261703d8f22c5eb98b1c500e2a24889dee/internal/workbench/ai_hub.go)、[窗口 session 后端](https://github.com/t8y2/motty/blob/102228261703d8f22c5eb98b1c500e2a24889dee/internal/workbench/ai_backend.go)、[stdio 后端](https://github.com/t8y2/motty/blob/102228261703d8f22c5eb98b1c500e2a24889dee/internal/workbench/agent_mcp.go)、[stdio jobs](https://github.com/t8y2/motty/blob/102228261703d8f22c5eb98b1c500e2a24889dee/internal/workbench/agent_jobs.go)。
- MCP 配置：[HTTP 设置 UI][U-MCP-UI]、[stdio 设置](https://github.com/t8y2/motty/blob/102228261703d8f22c5eb98b1c500e2a24889dee/internal/workbench/ai_agent_settings.go)、[客户端模板](https://github.com/t8y2/motty/blob/102228261703d8f22c5eb98b1c500e2a24889dee/internal/workbench/ai_mcp_config.go)。
- 许可及依赖：[LICENSE][U-LICENSE]、[NOTICE](https://github.com/t8y2/motty/blob/102228261703d8f22c5eb98b1c500e2a24889dee/NOTICE)、[go.mod](https://github.com/t8y2/motty/blob/102228261703d8f22c5eb98b1c500e2a24889dee/go.mod)、[存储边界](https://github.com/t8y2/motty/blob/102228261703d8f22c5eb98b1c500e2a24889dee/internal/configstore/store.go)。

### HUHU

- SSH：[能力注册与插件生命周期][H-ENGINE]、[主机持久化][H-HOSTS]、[连接/Shell/Exec/传输管理][H-MANAGER]、[插件 manifest][H-PLUGIN]。
- UI：[当前主页面][H-UI]、[当前文件面板][H-FILES]、[SFTP 限制与读写](https://github.com/NAMEWTA/huhu/blob/913264045cee1818497a37a57715c664aa85a1ae/plugins/ssh/src/engine/sftp.ts)、[共用终端组件][H-TERMINAL]。
- 统一入口：[Dispatcher][H-GATEWAY]、[MCP 适配](https://github.com/NAMEWTA/huhu/blob/913264045cee1818497a37a57715c664aa85a1ae/packages/kernel/src/mcp.ts)、[HTTP/WS](https://github.com/NAMEWTA/huhu/blob/913264045cee1818497a37a57715c664aa85a1ae/packages/kernel/src/server/http-app.ts)、[CLI stdio](https://github.com/NAMEWTA/huhu/blob/913264045cee1818497a37a57715c664aa85a1ae/apps/cli/src/mcp.ts)、[Gateway 页面](https://github.com/NAMEWTA/huhu/blob/913264045cee1818497a37a57715c664aa85a1ae/packages/workbench/src/gateway/GatewayModule.tsx)。
- 原生交付：[Herdr 专用进程管理模式][H-NATIVE]、[下载及校验脚本](https://github.com/NAMEWTA/huhu/blob/913264045cee1818497a37a57715c664aa85a1ae/scripts/fetch-herdr.mjs)、[Electron 资源打包](https://github.com/NAMEWTA/huhu/blob/913264045cee1818497a37a57715c664aa85a1ae/apps/desktop/electron-builder.yml)、[打包前检查](https://github.com/NAMEWTA/huhu/blob/913264045cee1818497a37a57715c664aa85a1ae/apps/desktop/scripts/before-pack.cjs)。
- 复用记录：[现有上游来源台账](https://github.com/NAMEWTA/huhu/blob/913264045cee1818497a37a57715c664aa85a1ae/docs/upstream/ledger.md)、[现有复用优先原则](https://github.com/NAMEWTA/huhu/blob/913264045cee1818497a37a57715c664aa85a1ae/CLAUDE.md)。

[U-HOSTS]: https://github.com/t8y2/motty/blob/102228261703d8f22c5eb98b1c500e2a24889dee/internal/workbench/host_menu.go
[U-WORKSPACE]: https://github.com/t8y2/motty/blob/102228261703d8f22c5eb98b1c500e2a24889dee/internal/workbench/workspace_launch.go
[U-TERMINAL]: https://github.com/t8y2/motty/blob/102228261703d8f22c5eb98b1c500e2a24889dee/website/content/docs/terminal/terminal.zh.mdx
[U-FILES]: https://github.com/t8y2/motty/blob/102228261703d8f22c5eb98b1c500e2a24889dee/internal/workbench/sftp_window.go
[U-CWD]: https://github.com/t8y2/motty/blob/102228261703d8f22c5eb98b1c500e2a24889dee/docs/terminal-folder-sync.md
[U-ROUTES]: https://github.com/t8y2/motty/blob/102228261703d8f22c5eb98b1c500e2a24889dee/internal/workbench/proxy.go
[U-PROXY]: https://github.com/t8y2/motty/blob/102228261703d8f22c5eb98b1c500e2a24889dee/internal/workbench/outbound_proxy.go
[U-FORWARD]: https://github.com/t8y2/motty/blob/102228261703d8f22c5eb98b1c500e2a24889dee/internal/workbench/forward.go
[U-MONITOR]: https://github.com/t8y2/motty/blob/102228261703d8f22c5eb98b1c500e2a24889dee/internal/workbench/monitor_dashboard.go
[U-REMOTE]: https://github.com/t8y2/motty/blob/102228261703d8f22c5eb98b1c500e2a24889dee/website/content/docs/reference/server-tools.zh.mdx
[U-SETTINGS]: https://github.com/t8y2/motty/blob/102228261703d8f22c5eb98b1c500e2a24889dee/internal/workbench/settings_paint.go
[U-MCP]: https://github.com/t8y2/motty/blob/102228261703d8f22c5eb98b1c500e2a24889dee/internal/ai/tools/tools.go
[U-MCP-UI]: https://github.com/t8y2/motty/blob/102228261703d8f22c5eb98b1c500e2a24889dee/internal/workbench/ai_settings_paint.go
[U-LICENSE]: https://github.com/t8y2/motty/blob/102228261703d8f22c5eb98b1c500e2a24889dee/LICENSE
[H-ENGINE]: https://github.com/NAMEWTA/huhu/blob/913264045cee1818497a37a57715c664aa85a1ae/plugins/ssh/src/engine/index.ts
[H-HOSTS]: https://github.com/NAMEWTA/huhu/blob/913264045cee1818497a37a57715c664aa85a1ae/plugins/ssh/src/engine/hosts.ts
[H-MANAGER]: https://github.com/NAMEWTA/huhu/blob/913264045cee1818497a37a57715c664aa85a1ae/plugins/ssh/src/engine/manager.ts
[H-UI]: https://github.com/NAMEWTA/huhu/blob/913264045cee1818497a37a57715c664aa85a1ae/plugins/ssh/src/ui/SshModule.tsx
[H-FILES]: https://github.com/NAMEWTA/huhu/blob/913264045cee1818497a37a57715c664aa85a1ae/plugins/ssh/src/ui/FilesPanel.tsx
[H-TERMINAL]: https://github.com/NAMEWTA/huhu/blob/913264045cee1818497a37a57715c664aa85a1ae/packages/ui/src/components/TerminalView.tsx
[H-PLUGIN]: https://github.com/NAMEWTA/huhu/blob/913264045cee1818497a37a57715c664aa85a1ae/plugins/ssh/huhu-plugin.json
[H-GATEWAY]: https://github.com/NAMEWTA/huhu/blob/913264045cee1818497a37a57715c664aa85a1ae/packages/kernel/src/dispatcher.ts
[H-NATIVE]: https://github.com/NAMEWTA/huhu/blob/913264045cee1818497a37a57715c664aa85a1ae/plugins/agent-cli/src/engine/herdr-core.ts

## 评论

无评论。
