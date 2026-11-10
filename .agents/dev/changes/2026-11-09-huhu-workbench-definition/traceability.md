# 追溯矩阵

## 1. 原型功能 → 规格 → 任务

原型路径相对 `temp/huhu-workbench-v8/`。“处理”列：保留 = 按原型意图进入产品；调整 = 保留功能但改变做法（理由见所列决定）；移除 = 原型说明工具，不进入产品。

| 原型模块 / 区域 | 原型功能 | 原型位置 | 处理 | 规格 | 任务 |
| --- | --- | --- | --- | --- | --- |
| 启动页 | 打开/导入 Vault 文件夹、示例 Vault、新建空白 Vault、导入数据包、本次运行记录 | `vault.jsx` | 保留 | workbench §2–3 | W04.1、W04.6 |
| 外壳 | rail 14 模块、模块标签、路径栏、通知、明暗切换、专注模式、收起导航、状态栏 | `app.jsx` | 保留 | design-system §3 | W02.3 |
| 外壳 | 二级导航四种形态 | `app.jsx`、`system.jsx`、`plugins-v3.jsx` | 调整（D-19 统一模块侧栏） | design-system §3 | W02.3 |
| 外壳 | 搜索与命令面板、快捷键 | `app.jsx` | 保留 | workbench §2、design-system §5 | W02.5、W04.5 |
| 工作台 | 总览指标、我的任务、继续上次的思考、专注计时、习惯、灵感收件箱、自定义卡片、新建菜单 | `app.jsx`（`Home`） | 保留 | workbench §2 | W18.1 |
| 工作台 | 今日安排、最近活动 | `app.jsx`（`ActivityFeed`） | 保留 | workbench §2 | W18.1 |
| 知识库 | 文件树、五筛选、搜索、排序、新建笔记（模板）/文件夹、重命名、移动、复制、回收站、恢复冲突改名、永久删除、拖放、导入文件 | `knowledge.jsx`（`NotesView`） | 保留 | knowledge §2–3 | W05.1–W05.3 |
| 知识库 | 日记 | `knowledge.jsx` | 保留 | knowledge §3 | W05.4 |
| 知识库 | 四模式编辑、行号、留白、工具栏、查找替换、双链补全 | `editor.jsx`、`vendor/atomic/` | 保留 | knowledge §5 | W06.1、W06.2 |
| 知识库 | 自动/手动保存、草稿、关闭四出口 | `knowledge.jsx`、`vault-session.js` | 保留 | knowledge §5 | W06.3 |
| 知识库 | 外部修改处理 | `desktop/main/vault-files.ts`（版本检查） | 保留并补全（合并） | knowledge §5 | W06.4 |
| 知识库 | 属性、大纲、关联（反链/任务/档案）、批注、历史、导出 | `knowledge.jsx` | 保留 | knowledge §6–7 | W06.6、W06.7、W07.1、W07.2 |
| 知识库 | 更多文件类型（文本/代码/图片/PDF） | 早期 Change 的编辑设计 | 保留 | knowledge §4 | W06.5 |
| 任务 | 五分类、未完成/已完成分组、列表/看板/月历、直接勾选、搜索 | `task-workbench.jsx` | 保留 | tasks §3 | W08.2、W08.4 |
| 任务 | 编辑：名称、Markdown 内容、截止日、项目、执行方式与 Space、关联资料、提醒 | `task-workbench.jsx`、`vault-resource-picker.jsx` | 保留 | tasks §3–4 | W08.3、W08.5 |
| 任务 | 详情中的运行记录 | `task-workbench.jsx`（`TaskDetail`） | 保留 | tasks §3 | W13.3 |
| 自动化 | 规则列表、详情、启停、编辑（cron 预设/自定义/时区）、四种动作、激活时间预览、最近激活、激活记录 | `task-workbench.jsx`（`AutomationWorkbenchView`） | 保留 | automations §3 | W13.1、W13.5 |
| 自动化 | 预览扫描（零写入） | `ActionPreviewModal` | 保留 | automations §3 | W13.2 |
| 自动化 | “显式演练”记录 | `ActionPreviewModal` | 调整为真实“立即运行”（D-24） | automations §3 | W13.3、W13.5 |
| 档案 | 类型导航、表格/卡片、搜索、详情、字段、关系、关联笔记、新建关联任务、更改类型、类型与字段管理、迁移删除、导出当前视图 | `knowledge.jsx`（`Archives*`） | 保留 | archives §2–3 | W09.1–W09.4 |
| 收件箱 | 三状态、来源筛选、快速捕获、转换三目标、归档、撤销、删除、批量 | `knowledge.jsx`（`InboxView`） | 保留 | inbox §2–3 | W10.1、W10.2 |
| Agent CLI | Space 列表与创建、顶部 + 启动菜单（模型/推理/Fast/提示词）、新终端、标签、分屏、右侧历史（搜索/筛选/固定）、智能体设置 | `agent-cli.jsx` | 保留 | agent-cli §3–4 | W12.3–W12.5 |
| Agent CLI | 样例检测开关、终端样例文字 | `agent-cli.jsx`、`agent-cli-model.js` | 移除（D-24） | — | — |
| Agent CLI | 变更审查与审查意见 | `agent-cli-review.jsx`（原型未接线） | 保留（D-30） | agent-cli §3 | W12.6 |
| 远程连接 | 主机配置、跳板、认证引用、概览、交互终端（多 shell、并排、重连视图）、Exec、文件、审计 | `execution.jsx`（`SSHView`）、`ssh-console.jsx` | 保留 | ssh §2–3 | W14.1–W14.3 |
| 远程连接 | 连接故障演练选择器 | `execution.jsx` | 移除（D-24） | — | — |
| 插件中心 | 已安装（内置/外部）、详情、启停、设置、发现插件、外部示例、运行时、权限与依赖 | `plugins-v3.jsx` | 保留 | plugins §2 | W16.1、W16.2 |
| 插件中心 | 模拟故障 | `plugins-v3.jsx` | 移除（D-24） | — | — |
| 能力网关 | MCP（传输、复制客户端配置、能力开放、Tools/Resources/Templates/Prompts）、CLI 测试台、服务端（端口、令牌、启停）、桌面宿主、测试台、调用记录 | `system.jsx`（`Interfaces`、`Tester`）、`cli-prototype.js` | 保留 | plugins §3 | W17.1–W17.3 |
| 保险箱 | 锁定/解锁、凭据 CRUD、显示/复制、引用、允许模块、访问记录、自动锁定、离开锁定 | `system.jsx`（`Safe`） | 保留 | safe §3–4 | W11.1–W11.3 |
| 保险箱 | 演示口令 huhu-demo | `system.jsx` | 调整为用户主密码（brief 约束 4） | safe §3 | W11.1 |
| 版本历史 | 文件历史、保存版本、差异（并排/统一、忽略空白、展开上下文）、恢复 | `version-workbench.jsx` | 保留 | versioning §3–4 | W15.1、W15.2 |
| 版本历史 | Git 工作区/暂存区/提交历史、手动暂存与提交 | `version-workbench.jsx` | 保留 | versioning §3 | W15.3 |
| 版本历史 | 同步：远端、三模式、预览、拉取/推送/同步、冲突与手工合并 | `version-workbench.jsx` | 保留 | versioning §3–4 | W15.4、W15.5 |
| 版本历史 | WebDAV/本地备份同步、检查点页 | `system.jsx`（`Versioning`，未路由）、`git-v4.jsx`（未路由） | 不采用（旧代码，D-15） | — | — |
| 健康中心 | 系统状态、运行诊断、取消、导出诊断、事件日志、通知 | `system.jsx`（`Health`） | 保留；“宿主演示”状态移除 | system §2 | W18.2、W18.3 |
| 设置 | 外观、当前 Vault、Agent 接入（指南）、编辑器、日期与时间、快捷键、数据与存储、关于与来源 | `system.jsx`（`Preferences`）、`builtin-guide-v5.jsx`、`vault-storage-v6.jsx` | 保留 | system §3–4、plugins §4 | W18.4、W18.5、W17.4 |
| 设置 | 指南“演练安装异常” | `builtin-guide-v5.jsx` | 移除（D-24） | — | — |
| 数据 | 导出受管数据包、关闭前备份确认 | `vault-storage-v6.jsx`、`backup-dialog-v6.jsx` | 保留 | system §4、data-model §9 | W04.6、W18.5 |

## 2. 验收 → 任务

| 验收 | 任务 |
| --- | --- |
| ACC-WB-01 | W04.1、W17.4 |
| ACC-WB-02 | W04.1 |
| ACC-WB-03 | W06.3 |
| ACC-WB-04 | W04.6 |
| ACC-WB-05、ACC-WB-06 | W18.1 |
| ACC-WB-07 | W02.5、W04.5 |
| ACC-WB-08 | W16.1、W18.1 |
| ACC-WB-09 | W02.3、W19.2 |
| ACC-KN-01、ACC-KN-02 | W06.1 |
| ACC-KN-03、ACC-KN-04 | W06.3 |
| ACC-KN-05 | W06.4 |
| ACC-KN-06 | W05.2 |
| ACC-KN-07 | W05.3 |
| ACC-KN-08 | W07.1 |
| ACC-KN-09 | W06.2 |
| ACC-KN-10 | W06.5 |
| ACC-KN-11 | W05.4 |
| ACC-TK-01 | W08.1、W08.3 |
| ACC-TK-02、ACC-TK-03 | W13.3 |
| ACC-TK-04、ACC-TK-08、ACC-TK-09、ACC-TK-10 | W08.1 |
| ACC-TK-05 | W08.2 |
| ACC-TK-06 | W08.3 |
| ACC-TK-07 | W08.5、W18.2 |
| ACC-TK-11 | W08.4 |
| ACC-AU-01、ACC-AU-09 | W13.1 |
| ACC-AU-02、ACC-AU-05 | W13.2 |
| ACC-AU-03、ACC-AU-04、ACC-AU-06、ACC-AU-07 | W13.3 |
| ACC-AU-08 | W13.4 |
| ACC-AU-10 | W13.2、W16.1 |
| ACC-AU-11 | W13.5 |
| ACC-AU-12 | W13.2、W15.2 |
| ACC-AR-01 | W09.3 |
| ACC-AR-02、ACC-AR-04、ACC-AR-05 | W09.2 |
| ACC-AR-03 | W09.1 |
| ACC-AR-06 | W09.4 |
| ACC-IN-01、ACC-IN-05 | W10.1 |
| ACC-IN-02、ACC-IN-03、ACC-IN-04、ACC-IN-06 | W10.2 |
| ACC-AG-01、ACC-AG-04、ACC-AG-07、ACC-AG-08 | W12.3 |
| ACC-AG-02、ACC-AG-03、ACC-AG-11 | W12.4 |
| ACC-AG-05、ACC-AG-06 | W12.5 |
| ACC-AG-09 | W12.2 |
| ACC-AG-10 | W12.6 |
| ACC-SH-01、ACC-SH-02、ACC-SH-03、ACC-SH-07 | W14.2 |
| ACC-SH-04 | W14.1 |
| ACC-SH-05、ACC-SH-06、ACC-SH-08 | W14.3 |
| ACC-SF-01、ACC-SF-07 | W11.2 |
| ACC-SF-02、ACC-SF-03、ACC-SF-05 | W11.1 |
| ACC-SF-04 | W11.3 |
| ACC-SF-06 | W11.3、W17.1 |
| ACC-VS-01 | W15.1 |
| ACC-VS-02、ACC-VS-03、ACC-VS-04 | W15.2 |
| ACC-VS-05 | W15.5 |
| ACC-VS-06、ACC-VS-08 | W15.4 |
| ACC-VS-07 | W15.3 |
| ACC-PL-01 | W16.1、W17.1 |
| ACC-PL-02 | W16.1 |
| ACC-PL-03、ACC-PL-04 | W16.2 |
| ACC-PL-05、ACC-PL-06 | W17.1 |
| ACC-PL-07 | W17.4 |
| ACC-PL-08 | W03.4、W17.3 |
| ACC-SY-01、ACC-SY-02、ACC-SY-03、ACC-SY-04 | W18.3 |
| ACC-SY-05 | W02.1、W18.4 |
| ACC-SY-06 | W18.4 |
| ACC-SY-07 | W18.5 |
| ACC-SY-08 | W04.6、W18.5 |

## 3. 基础任务（无直接对应的模块验收）

这些任务交付其他任务依赖的公共能力，按各自“完成”条件与 [quality](quality.md) §4 门槛验收，并由依赖它们的 ACC 间接覆盖。

| 任务 | 被哪些验收间接覆盖 |
| --- | --- |
| W01.1、W01.2、W01.3、W01.5 | 全部（工程、CI、夹具） |
| W01.4 | release §5 安装冒烟 |
| W02.2、W02.4 | 所有使用组件、表格与日期选择的 ACC |
| W03.1、W03.2、W03.3、W03.5、W03.6 | ACC-PL-01、ACC-PL-02、ACC-PL-05、ACC-SF-06、ACC-IN-05 |
| W04.2、W04.3、W04.4 | ACC-KN-05、ACC-IN-03、ACC-AR-05、ACC-TK-08 |
| W12.1 | ACC-AG-02、ACC-AG-04、ACC-AG-08 |
| W17.2 | release §5 CLI 检查 |
| W19.1、W19.3、W19.4 | product §3 工作流、quality §3 指标、design-system §7 |
| W20.1、W20.2、W20.3 | release §5 |

