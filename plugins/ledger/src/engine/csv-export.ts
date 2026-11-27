import { ledgerBusinessDate, ledgerMinorToDecimal } from "@huhu/contracts";
import { csvFormatRows } from "d3-dsv";
import type { RecordFilters } from "../shared/entries.js";
import { filteredRecords, recordTitle } from "./records.js";
import type { BookState } from "./store.js";

const externalCell = (value: string) => (/^[\s\uFEFF]*[=+\-@]|^[\t\r\n]/.test(value) ? "'" + value : value);

export function exportCsv(state: BookState, filters: RecordFilters) {
  const rows = filteredRecords(state, filters);
  const accounts = new Map(state.accounts.map(({ id, name }) => [id, name]));
  const dictionary = new Map(state.dictionary.map(({ id, name }) => [id, name]));
  const offsets = new Set(state.offsets.flatMap((group) => group.memberRecordIds));
  const header = ["流水标识", "交易时间", "业务日", "类型", "事项", "转出或单边账户", "币种", "金额", "转入账户", "转入币种", "转入金额", "分类", "标签", "交易对方", "备注", "已平账"];
  const content = rows.map((row) => {
    const transfer = row.type === "transfer";
    const account = transfer ? row.fromAccountId : row.accountId;
    const currency = transfer ? row.fromCurrency : row.currency;
    const amount = transfer ? row.fromAmountMinor : row.amountMinor;
    return [
      row.id,
      row.occurredAt,
      ledgerBusinessDate(row.occurredAt, state.book.timeZone),
      row.type,
      externalCell(recordTitle(state, row)),
      externalCell(accounts.get(account) ?? account),
      currency,
      ledgerMinorToDecimal(amount, currency),
      transfer ? externalCell(accounts.get(row.toAccountId) ?? row.toAccountId) : "",
      transfer ? row.toCurrency : "",
      transfer ? ledgerMinorToDecimal(row.toAmountMinor, row.toCurrency) : "",
      externalCell(dictionary.get(row.categoryId ?? "") ?? ""),
      externalCell(row.tagIds.map((id) => dictionary.get(id) ?? id).join(" / ")),
      externalCell(row.payee ?? ""),
      externalCell(row.memo ?? ""),
      offsets.has(row.id) ? "是" : "否",
    ];
  });
  return { fileName: "账本流水.csv", csv: "\uFEFF" + csvFormatRows([header, ...content]) + "\n", count: rows.length };
}
