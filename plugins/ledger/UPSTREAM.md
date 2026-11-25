# 账本行为来源

HomiBook 固定提交 `5d3d71713de805c95245378408b73f101f69659a`。仓库根的 [账本来源台账](../../docs/upstream/ledger.md) 记录版本和许可。

- `frontend/src/pages/BooksPage.tsx` 和 `frontend/src/stores/book.ts` 提供多账本、切换当前账本、管理与名称确认删除的参考。Huhu 使用已确认原型的建账表单，并在同一操作中保存第一项资金账户。选中的账本由当前 Vault 保存。
- 持久化复用 `VaultFiles` 与 `OperationLog`，能力复用 Huhu Dispatcher。界面采用共享 Workbench 导航、对话框和表单控件。
- `frontend/src/pages/AccountsPage.tsx` 的账户状态、期初余额、校准和校准历史与 `frontend/src/pages/RecordsPage.tsx` 的流水筛选、分页、复制和批量处理作为交互参考。余额、币种与日期使用 Huhu 已冻结的账本合同。凭证内容和账本内引用使用 `OperationLog` 同次提交。
- `backend/src/services/import/{parsers,pipeline,mapping-normalize,execute}.ts` 和 `frontend/src/components/ImportDialog.tsx` 为账单字段、回退映射与预览流程的参考。Huhu 用来源时区解释时间、精确转换原金额，并在 Vault 记录确认回执。
- CSV 复用 `d3-dsv@3.0.2`（ISC）。微信 XLSX 复用 [SheetJS CE 0.20.3 官方发布包](https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz)，Apache-2.0。根锁文件固定 `sha512-oLDq3jw7AcLqKWH2AhCpVTZl8mf6X2YReP+Neh0SJUzV/BdZYjth94tG5toiMB1PPrYtxOCfaoUCkvtuH+3AJA==`。
