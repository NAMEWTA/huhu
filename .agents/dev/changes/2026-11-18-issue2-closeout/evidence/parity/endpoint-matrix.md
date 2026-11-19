# Task05 本地模板接口补充

本表补充归档 `evidence/endpoint-matrix.md`，上游固定为 `44a2e0a`。

| 上游入口 | 上游行为 | Huhu 接线 | 验证 |
| --- | --- | --- | --- |
| 文件树 `Import as template` → `app/src/lib/folder-config-api.ts:108` → `POST /api/template/import` | `server/src/http/folder-template-routes.ts:1087–1320` 读取源文件，转换模板头，经 OK 会话写入同级的 `.ok/templates/<name>.md`，可选删除原文件。OK 的新建模板菜单还从文件夹配置获取专属元数据。 | `packages/editor/src/host/routes/files.ts` 注册同一路由到 `hostFetch`。`plugins/notes/src/ui/explorer/filesDeps.ts` 用现有本地 `notes.read`、`notes.create`、`notes.save` 与目录能力，把 Vault 内已保存的 Markdown 导入同级可见的「模板」目录。内容保留为普通 Markdown，用户可用现有 DocTab 编辑或用复制命令重用。导入保留原文件，重名采用数字后缀，保存使用版本检查。 | `tests/e2e/knowledge/editor-parity-assets-template.spec.ts` 从真实树菜单导入，核对源和目标字节，编辑保存、关标签、重开并复查。 |

现有 Huhu 内置模板是 `plugins/notes/src/shared/templates.ts` 的四个固定选项。可见的本地模板文件是保留导入功能的最小等价，OK 模板注册表、专属头部元数据和删除源文件的转换路径仍由 OK 应用定义。导入仅经本地引擎，使用同一个 Vault 的源文件和目标目录。
