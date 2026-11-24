# 本地模板接口补充

本表补充归档 `evidence/endpoint-matrix.md`，上游固定为 `44a2e0a`。

| 上游入口 | 上游行为 | Huhu 接线 | 验证 |
| --- | --- | --- | --- |
| 文件树 `Import as template` → `POST /api/template/import` | `server/src/http/folder-template-routes.ts:1087–1320` 读取源文件，转换模板头，经 OK 会话写入同级的 `.ok/templates/<name>.md`，可选删除源文件。 | `hostFetch` 通过 `notes.templates.import` 调用本地引擎。按原始字节创建同级「模板」目录中的 Markdown，使用一次 Vault 原子写，保留源文件，重名加数字后缀。 | 服务测试验证写入中断、重试、同名并行写入和字节保真。真实树菜单验证导入落盘。 |
| 文件树 `New from template` → `GET /api/folder-config` → `POST /api/create-page` | 选择文件夹配置里的模板，再用所选内容创建页面。 | 文件树的模板项使用 `notes.templates.list` 返回的 Vault 相对路径。所选项交给已有新建对话框，确定名称后经 `notes.create` 的 `templatePath` 写入最终文件。Huhu 新建笔记对话框共用同一清单，也继续显示四个内建模板。 | 真实 Electron 从两个入口分别创建，核对内容，编辑保存、关闭及重开。模板和原笔记字节保持一致。 |

本地模板清单纳入 Vault 内各个「模板」目录的直接 Markdown 文件。清单显示相对路径，方便区分跨目录同名模板。新建直接复制所选文件的完整 Markdown 字节。内建模板继续由 `plugins/notes/src/shared/templates.ts` 渲染。

## H04 用户反馈覆盖

渲染测试只替换 Engine 端口或预览请求边界，使用真实路由、响应格式与消费组件。Electron 定向用例同时核对提示和 Vault 结果。打包签名及 Q2 排除见归档 desktop-host-endpoints.json（本机原件 `temp/dev/feature_2026-11-14-knowledge-ok-parity/integration/legacy-7984bff4/desktop-host-endpoints.json`）。

| 路由或桌面成员 | 响应证据 | 用户可见证据 | 覆盖边界 |
| --- | --- | --- | --- |
| GET /api/pages | [核心路由状态码及客户端形状](../../../../../../../../packages/editor/test/core-routes.test.ts#L30) | [候选 UI、错误提示与回退顺序](../../../../../../../../packages/editor/test/host-feedback.test.tsx#L117) | 建议菜单。详情栏兜底列表单独的失败态仍欠验证。 |
| GET /api/tags | [核心路由状态码及客户端形状](../../../../../../../../packages/editor/test/core-routes.test.ts#L30) | [候选 UI、错误提示与回退顺序](../../../../../../../../packages/editor/test/host-feedback.test.tsx#L117) | 既有标签候选与失败时的状态提示。 |
| GET /api/tag-documents | [核心路由状态码及客户端形状](../../../../../../../../packages/editor/test/core-routes.test.ts#L30) | [标签弹层内的列表及错误](../../../../../../../../packages/editor/test/host-feedback.test.tsx#L66) | 标签弹层。 |
| GET /api/page-headings | [核心路由状态码及客户端形状](../../../../../../../../packages/editor/test/core-routes.test.ts#L30) | [候选 UI、错误提示与回退顺序](../../../../../../../../packages/editor/test/host-feedback.test.tsx#L117) | 标题候选与失败提示。 |
| GET /api/forward-links、GET /api/backlinks | [核心路由状态码及客户端形状](../../../../../../../../packages/editor/test/core-routes.test.ts#L30) | [候选 UI、错误提示与回退顺序](../../../../../../../../packages/editor/test/host-feedback.test.tsx#L117) | 相连笔记优先。关联数据失败时仍显示候选并恢复普通排序。 |
| GET /api/document、GET /api/backlink-counts | [核心路由状态码及客户端形状](../../../../../../../../packages/editor/test/core-routes.test.ts#L30) | [预览摘要及反链数分别回退](../../../../../../../../packages/editor/test/host-feedback.test.tsx#L340) | 分别验证摘要与反链数缺失时仍显示预览标题。 |
| POST /api/link-preview | [预览卡片及 URL 回退](../../../../../../../../packages/editor/test/host-feedback.test.tsx#L300) | [预览卡片及 URL 回退](../../../../../../../../packages/editor/test/host-feedback.test.tsx#L300) | 验证启用、500 HOST_ERROR、关闭时无请求。链接目标一直可见。 |
| GET /api/documents（core 与 Files） | [核心路由状态码及客户端形状](../../../../../../../../packages/editor/test/core-routes.test.ts#L30)；[文件路由状态码及客户端形状](../../../../../../../../packages/editor/test/host-files.test.ts#L126) | [真实树状态及 500 反馈](../../../../../../../../packages/editor/test/file-tree-feedback.test.tsx#L164) | 文件树根列表成功显示文件，读取错误显示警报。core 兜底消费端另有正常流程。 |
| GET /api/principal | [本地固定身份、不可用写入 404](../../../../../../../../packages/editor/test/core-routes.test.ts#L101) | 本地身份无失败依赖。 | 无对应用户提交动作。 |
| POST /api/upload（编辑器） | [宿主错误状态码及文案](../../../../../../../../packages/editor/test/upload-routes.test.ts#L45) | [实图解码、落盘](../../../../../../../../tests/e2e/knowledge/attachments.spec.ts#L84)；[两类拒绝可见提示与原文保留](../../../../../../../../tests/e2e/knowledge/attachments.spec.ts#L112) | 粘贴与拖放成功，拒绝类型和空文件。 |
| POST /api/upload（文件树） | [目标目录参数及响应](../../../../../../../../packages/editor/test/upload-routes.test.ts#L91) | [真实树状态及 500 反馈](../../../../../../../../packages/editor/test/file-tree-feedback.test.tsx#L164)；[按目标目录写入真实字节](../../../../../../../../tests/e2e/knowledge/attachments.spec.ts#L135) | 拖入空树成功显示条目，出错显示可读原因。 |
| GET /api/comments | [批注路由状态码及客户端形状](../../../../../../../../packages/editor/test/comment-routes.test.ts#L132) | [渲染单测](../../../../../../../../packages/editor/test/host-feedback.test.tsx#L425) · [Electron 拒绝、重试与真实空列表](../../../../../../../../tests/e2e/knowledge/comments-s4.spec.ts#L588) | 单篇批注列表区分读取失败和读取成功后的空列表。重试重新调用 `comments.list`，保持笔记字节和批注文件状态。 |
| POST /api/comments、POST /api/comment、DELETE /api/comment | [批注路由状态码及客户端形状](../../../../../../../../packages/editor/test/comment-routes.test.ts#L132) | [渲染线程更新及写入错误提示](../../../../../../../../packages/editor/test/host-feedback.test.tsx#L223)；[Electron 回复、解决、重开和删除确认](../../../../../../../../tests/e2e/knowledge/comments-s4.spec.ts#L89) | 渲染表覆盖创建、回复、删除、解决、重开和重定位的 200／500。 |
| GET /api/folder-config | [文件路由状态码及客户端形状](../../../../../../../../packages/editor/test/host-files.test.ts#L37) | [模板读取失败仍能创建空白笔记](../../../../../../../../packages/editor/test/host-feedback.test.tsx#L360) | 正常列举、500 告警与可继续操作。 |
| POST /api/template/import | [文件路由状态码及客户端形状](../../../../../../../../packages/editor/test/host-files.test.ts#L126) | [真实树状态及 500 反馈](../../../../../../../../packages/editor/test/file-tree-feedback.test.tsx#L164)；[真实导入并保持源字节](../../../../../../../../tests/e2e/knowledge/editor-parity-assets-template.spec.ts#L67) | 写入成功和拒绝均有 toast。 |
| POST /api/create-page | [文件路由状态码及客户端形状](../../../../../../../../packages/editor/test/host-files.test.ts#L126) | [同名错误、原字节及随后创建](../../../../../../../../tests/e2e/knowledge/editor-parity-assets-template.spec.ts#L107) | 真实文件树模板创建与同名反馈。 |
| POST /api/rename-path | [文件路由状态码及客户端形状](../../../../../../../../packages/editor/test/host-files.test.ts#L126) | [真实树状态及 500 反馈](../../../../../../../../packages/editor/test/file-tree-feedback.test.tsx#L164) | 内联重命名接受后显示新路径，拒绝时提示并保留原路径。 |
| POST /api/duplicate-path、POST /api/delete-path、POST /api/create-folder | [文件路由状态码及客户端形状](../../../../../../../../packages/editor/test/host-files.test.ts#L126) | [真实树状态及 500 反馈](../../../../../../../../packages/editor/test/file-tree-feedback.test.tsx#L164) | 复制显示成功提示，移入回收站后旧行消失，新建目录出现。拒绝时提示。 |
| GET /api/workspace | [文件路由状态码及客户端形状](../../../../../../../../packages/editor/test/host-files.test.ts#L126) | [完整路径菜单可用态](../../../../../../../../packages/editor/test/file-tree-feedback.test.tsx#L133) | 读取失败时禁用完整路径。 |
| POST /api/trash/cleanup | 固定返回空删除列表。 | — | Huhu 的文件树通过宿主直接处理回收站操作。上游原生 trash 分支清理是本地无 I/O 兼容兜底。 |
| okDesktop.shell.openExternal | [桌面外链桥](../../../../../../../../apps/desktop/src/main/external-link.ts#L1) | [真实菜单、取消和确认动作](../../../../../../../../tests/e2e/workflows/viewers.spec.ts#L799)；[系统失败时原生错误框](../../../../../../../../apps/desktop/test/external-link.test.ts#L46) | 沿用真实 Electron 历史证据，并补主进程原生对话框边界断言。 |
| okDesktop.platform | [桌面桥平台映射](../../../../../../../../packages/editor/src/host/desktop-bridge.ts#L12) | [平台和成员独立断言](../../../../../../../../packages/editor/test/host-feedback.test.tsx#L456) | 模拟 Win32、MacIntel 与 Linux，断言平台字段、已接线成员和缺省成员。 |
| okDesktop.clipboard | [浏览器 Clipboard API 回退](../../../../../../../../packages/editor/src/vendor/open-knowledge/app/src/lib/copy-image.ts#L70) | [真实编辑器复制监听到错误通知](../../../../../../../../packages/editor/test/host-feedback.test.tsx#L480) | Huhu 桌面桥省略原生图片复制成员。浏览器 API 缺失和写入拒绝均显示可见通知。 |
| okDesktop 其余已打包成员 | 见 desktop-host-endpoints.json | — | 沿用 Q2/Q10 入口限制及签名归属。 |
