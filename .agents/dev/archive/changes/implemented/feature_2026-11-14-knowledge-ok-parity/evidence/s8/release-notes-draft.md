# 发布说明草稿（知识库编辑器重构）

> S8 草稿，由整合者在发布时并入正式发布说明。

## 用户可见
- 知识库换用 Open Knowledge 的编辑器：富文本 / 源码 / 阅读三种视图读同一份文件；`/` 命令、气泡菜单、块与表格、属性面板（YAML）、评论面板。
- 文件树显示 Vault 里**全部真实文件与空目录**（受保护目录 `.huhu`、`.git`、`.agents`、`node_modules` 可见但操作受限）；右键菜单；“在资源管理器中隐藏”只影响文件树视图，搜索 / `@` / 双链不受影响，可在树顶栏恢复。
- JSON / TXT 可直接编辑；PDF 与 HTML（隔离预览）可查看。
- 档案是真实标签，侧栏随活动标签切换。
- **首次编辑某个文件后，Markdown 会被整体规范化一次**（编辑器的序列化与原文格式不一定逐字节相同；未编辑的文件不会被改写）。
- 去掉：旧 CodeMirror 实时预览编辑器与“双栏”模式、旧格式化工具栏、旧文件列表与独立档案旁路页面。

## 对外接口（decisions OP-D19 / spec Q8）
| 变更 | 影响 |
| --- | --- |
| `vault.tree` 更名为 `vault.indexEntries` | 仓库内唯一调用方（`tasks/references.ts`、MCP 资源 `huhu://notes/recent`、`GatewayModule`、权限表 `vault.read` 组）已迁完，**没有保留旧名别名**；外部脚本若直接调用 `vault.tree` 需改名 |
| `notes.files` 删除 | 仓库内无其它调用方；旧文件树已被 `vault.list` 驱动的新树取代 |
| 新增 `vault.list`、`vault.readRange`、`notes.hidden.get/set`、事件 `vault.dirChanged` | `vault.list` 在权限组 `vault.read`；`vault.readRange` 与 `notes.hidden.*` 不对外暴露（`exposable:false`） |
| `notes.duplicate` 支持文件夹 | 向后兼容 |
| `notes.move` 的非空 `targetDir` 必须指向已存在的目录 | 移动前先创建目标目录。空字符串仍表示 Vault 根目录 |
| `notes.create.templatePath` 仅桌面端可用 | 外部调用可继续通过 `template` 选用内置模板 |

## 体积与依赖
- 新增约 115 个 npm 依赖（编辑器闭包共 133 个，其中 16 个与原版本不同）（编辑器闭包：Tiptap / Yjs / Lingui / Tailwind v4 / `@pierre/trees` 等）；编辑器、文件树、PDF 查看器均为懒加载 chunk；`marked`、DOMPurify、`react-markdown` 等旧预览依赖已移除。
- `pdfjs-dist` 统一为 6.3.289（带局部渲染补丁）。
- 第三方声明与来源台账：`THIRD_PARTY_NOTICES.md`、`docs/upstream/ledger.md`（R-46～R-52，R-09 退役）。
