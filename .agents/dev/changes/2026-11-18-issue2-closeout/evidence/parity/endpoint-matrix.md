# 本地模板接口补充

本表补充归档 `evidence/endpoint-matrix.md`，上游固定为 `44a2e0a`。

| 上游入口 | 上游行为 | Huhu 接线 | 验证 |
| --- | --- | --- | --- |
| 文件树 `Import as template` → `POST /api/template/import` | `server/src/http/folder-template-routes.ts:1087–1320` 读取源文件，转换模板头，经 OK 会话写入同级的 `.ok/templates/<name>.md`，可选删除源文件。 | `hostFetch` 通过 `notes.templates.import` 调用本地引擎。按原始字节创建同级「模板」目录中的 Markdown，使用一次 Vault 原子写，保留源文件，重名加数字后缀。 | 服务测试验证写入中断、重试、同名并行写入和字节保真。真实树菜单验证导入落盘。 |
| 文件树 `New from template` → `GET /api/folder-config` → `POST /api/create-page` | 选择文件夹配置里的模板，再用所选内容创建页面。 | 文件树的模板项使用 `notes.templates.list` 返回的 Vault 相对路径。所选项交给已有新建对话框，确定名称后经 `notes.create` 的 `templatePath` 写入最终文件。Huhu 新建笔记对话框共用同一清单，也继续显示四个内建模板。 | 真实 Electron 从两个入口分别创建，核对内容，编辑保存、关闭及重开。模板和原笔记字节保持一致。 |

本地模板清单纳入 Vault 内各个「模板」目录的直接 Markdown 文件。清单显示相对路径，方便区分跨目录同名模板。新建直接复制所选文件的完整 Markdown 字节。内建模板继续由 `plugins/notes/src/shared/templates.ts` 渲染。
