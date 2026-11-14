# 进度：档案改为文件夹笔记

## 已完成并验证

- AR-S1：`index.md` 标题取文件夹名、`[[目录/]]` 解析 / 打开 / 反链（`[[index]]` 不再误匹配）、文件树点名称开文件夹笔记；`links-rewrite` 支持文件夹前缀改写。证据：`packages/vault/test/{vault-index,markdown}.test.ts`、`plugins/notes/test/{links-rewrite,service}.test.ts`。
- AR-S2：`plugins/notes/src/engine/archives/`（类型与档案的创建 / 读取 / 更新 / 字段改名原子写 / 移动 / 删除 / 附件）；`archives.*` 能力迁到 notes；`plugins/archives`、两个 kind、`Archive Types` 全部删除；inbox 转档案、kernel 权限与域映射、event-log、查询失效同步。证据：`plugins/notes/test/archives.test.ts`（17 例，对应 AR-01～05、07、08、12、13、18～20）、`apps/engine/test/engine.test.ts`（AR-15 暴露表）。
- AR-S3：档案首页、类型视图（DataTable）、档案视图（字段表单、未定义字段、正文、档案文件、出链 / 被链接、改名 / 移动 / 删除）、面包屑、编辑字段对话框；命令面板“档案”分组；demo vault 增加“通讯录”示例。证据：e2e shell“收件箱与档案”。
- AR-14：`git grep` 残留检查（见 audit）。

## 已补 e2e

- AR-06 / AR-09 / AR-10 / AR-16 已补 e2e（acceptance.spec.ts 末尾两个用例：阅读模式点 `[[Archives/…/]]` 打开档案视图且被链接出现该笔记、添加 pdf 附件、命令面板“档案”分组且标题不是 index、随包 demo vault 的通讯录示例与反链）。

## 未验证 / 未做

- 档案视图没有拖动排序以外的字段类型转换；类型改名在重名时加随机码。
- 视图样式已在 `plugins/notes/src/ui/notes.css`（随设计系统的样式拆分迁入）。
