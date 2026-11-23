# t13b · Notes 确认放弃的草稿身份与读取失败

状态已完成。本轮从 `ce3a3b7b` 开始，只修改 Notes 草稿能力、共享文档会话及各自测试，共四个文件。改动留在工作树供 Lead 审查。 [任务](/home/wta/projects/huhu/.agents/system/herdr-core/2026-11-21-huhu-issues-3-10-linux/t13b/task12.md) · [独审](t152-report03.md)

## 实现

- 会话在恢复草稿或收到留稿成功回执时，记录与当前缓冲关联的草稿版本。确认放弃时固定该版本，读到其他版本就保留该草稿并采用磁盘正文。Workbench 读取和保存草稿可通过 `withVersion` 获取现有字节版本。新 Workbench 草稿存储一个记录 ID，使相同毫秒、相同正文的两次写入也得到不同版本。既有草稿仍可读，普通调用省略参数时继续使用原响应形状。 [会话读取与确认](../../plugins/notes/src/ui/documents/DocumentSession.ts#L238) · [留稿回执](../../plugins/notes/src/ui/documents/DocumentSession.ts#L662) · [Engine 读写](../../plugins/notes/src/engine/index.ts#L716)
- 条件删除复用 `expectedVersion` 和 Engine 现有写入队列，核对当前版本后同步删除。另一工作台若在读取后替换或删除草稿，Engine 返回 `VERSION_CONFLICT`，会话用原版本限制重试，保留并展示读到的新稿。会话的普通清理与横幅丢弃也带被处理的版本。 [队列](../../plugins/notes/src/engine/index.ts#L422) · [条件删除](../../plugins/notes/src/engine/index.ts#L761) · [普通清理](../../plugins/notes/src/ui/documents/DocumentSession.ts#L460)
- 草稿读取仅在文件缺失（`ENOENT`）时返回空，其他读取与解析错误由 Engine 返回。确认放弃遇到读取错误会保留当前缓冲和冲突，显示错误并允许重试。真实 Engine 测试将草稿暂时替换为目录触发读取错误，验证恢复文件后可重试，也验证关联草稿已被删除时可以正常重载。 [草稿读取](../../plugins/notes/src/engine/index.ts#L467) · [真实 Engine 用例](../../plugins/notes/test/domain-exposure.engine.test.ts#L763)

## 红绿证据

每次在 `flock /tmp/huhu-heavy.lock` 下运行一个 Vitest 文件或筛选。Engine fixture 使用回环监听，获批重跑后的日志记录的是行为断言。

| 文件 | 修复前 | 修复后 |
| --- | --- | --- |
| `document-session.test.ts` | 2 失败、81 未选。确认前替换、读取后替换均丢失新稿 Y。 [红灯](save-draft-identity-session-red.log) | 83 项通过，包含整个会话测试文件。 [绿灯](save-draft-identity-session-green.log) |
| `domain-exposure.engine.test.ts` | 2 失败、9 未选。过期删除返回成功，真实读取失败时确认重载也返回成功。 [红灯](save-draft-identity-engine-red.log) | 4 通过、7 未选。覆盖两个新用例、桌面重启后的草稿兼容及外部草稿重命名后的身份。 [绿灯](save-draft-identity-engine-green.log) |

## 未运行的验证

E2E、Playwright/Electron、打包、安装包检查、类型检查、全量测试、lint 和其他全仓门禁均未运行。
