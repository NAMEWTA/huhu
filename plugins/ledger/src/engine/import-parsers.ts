import { errors } from "@huhu/contracts";
import { csvParseRows } from "d3-dsv";
import * as xlsx from "xlsx";
import { maxStatementRows, type BillSource, type CsvColumns } from "../shared/imports.js";
import type { RecordFilters } from "../shared/entries.js";

type Kind = NonNullable<RecordFilters["type"]>;
type TableRow = { line: number; cells: string[] };
type Access = (names: string[]) => string;
export type StatementRow = {
  line: number; number: string; date: string; amount: string; toAmount: string; currency: string;
  title: string; account: string; toAccount: string; payee: string; category: string; memo: string;
  kind: Kind | null; status: string; skip?: string;
};
const recognized = /^(交易时间|交易日期|日期|时间|date|time|occurredat)$/i;
const normalized = (value: string) => value.normalize("NFKC").replace(/\s+/g, "").toLowerCase();
const direction = (value: string) => {
  const key = normalized(value);
  if (["收入", "income", "credit", "入账"].includes(key)) return "income";
  if (["支出", "expense", "debit", "出账"].includes(key)) return "expense";
  if (["转账", "transfer"].includes(key)) return "transfer";
  return null;
};

function textCsv(bytes: Buffer) {
  try { return { encoding: "UTF-8" as const, text: new TextDecoder("utf-8", { fatal: true }).decode(bytes) }; }
  catch {
    try { return { encoding: "GBK" as const, text: new TextDecoder("gbk", { fatal: true }).decode(bytes) }; }
    catch { throw errors.invalidInput("账单文本需使用 UTF-8 或 GBK 编码"); }
  }
}

function csvRows(text: string): TableRow[] {
  const starts = [1];
  let quoted = false;
  let fieldStart = true;
  let line = 1;
  for (let index = 0; index < text.length; index++) {
    const c = text[index];
    if (c === '"' && quoted && text[index + 1] === '"') index++;
    else if (c === '"' && (quoted || fieldStart)) { quoted = !quoted; fieldStart = false; }
    else if (c === "\n" || (c === "\r" && text[index + 1] !== "\n")) {
      line++;
      if (!quoted) { starts.push(line); fieldStart = true; }
    } else if (!quoted && c !== "\r") fieldStart = c === ",";
  }
  if (quoted) throw errors.invalidInput("CSV 中的引号未闭合");
  return csvParseRows(text, (cells, index) => {
    if (cells.length > 128 || index > maxStatementRows + 200) throw errors.invalidInput("账单列数或行数超过上限");
    return { line: starts[index] ?? index + 1, cells: cells.map((cell) => cell.trim()) };
  });
}

// Check the archive index before SheetJS inflates workbook or shared-string entries.
function requireBoundedWorkbook(bytes: Buffer) {
  const end = bytes.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const invalid = () => errors.invalidInput("微信 XLSX 已加密、损坏或超出体积上限");
  if (end < 0 || end + 22 > bytes.length || end + 22 + bytes.readUInt16LE(end + 20) !== bytes.length ||
      bytes.readUInt32LE(end + 4) !== 0 || bytes.readUInt16LE(end + 8) !== bytes.readUInt16LE(end + 10)) throw invalid();
  const count = bytes.readUInt16LE(end + 10);
  let cursor = bytes.readUInt32LE(end + 16);
  let expanded = 0;
  let workbook = false;
  if (count > 256 || cursor + bytes.readUInt32LE(end + 12) !== end) throw invalid();
  for (let index = 0; index < count; index++) {
    if (cursor + 46 > end || bytes.readUInt32LE(cursor) !== 0x02014b50 ||
        (bytes.readUInt16LE(cursor + 8) & 1) !== 0) throw invalid();
    const nameLength = bytes.readUInt16LE(cursor + 28);
    const next = cursor + 46 + nameLength + bytes.readUInt16LE(cursor + 30) + bytes.readUInt16LE(cursor + 32);
    if (next > end) throw invalid();
    expanded += bytes.readUInt32LE(cursor + 24);
    if (expanded > 32 * 1024 * 1024) throw invalid();
    if (bytes.toString("utf8", cursor + 46, cursor + 46 + nameLength) === "xl/workbook.xml") workbook = true;
    cursor = next;
  }
  if (!workbook || cursor !== end) throw invalid();
}

function wechatRows(bytes: Buffer): TableRow[] {
  requireBoundedWorkbook(bytes);
  try {
    const workbook = xlsx.read(bytes, { type: "buffer", sheetRows: maxStatementRows + 201, sheets: 0, cellFormula: false, cellHTML: false });
    const sheet = workbook.Sheets[workbook.SheetNames[0] ?? ""];
    if (!sheet) throw new Error("Missing sheet");
    const rows = xlsx.utils.sheet_to_json<(number | string)[]>(sheet, { header: 1, defval: "", blankrows: true, raw: true });
    const date1904 = workbook.Workbook?.WBProps?.date1904 === true;
    const dateColumn = rows.find((row) => row.includes("交易时间"))?.indexOf("交易时间") ?? -1;
    return rows.map((row, index) => ({
      line: index + 1,
      cells: row.map((value, col) => {
        if (col !== dateColumn || typeof value !== "number") return String(value).trim();
        const date = xlsx.SSF.parse_date_code(value, { date1904 });
        if (!date) return String(value);
        const pad = (part: number) => String(part).padStart(2, "0");
        return `${date.y}-${pad(date.m)}-${pad(date.d)}T${pad(date.H)}:${pad(date.M)}:${pad(date.S)}`;
      }),
    }));
  } catch { throw errors.invalidInput("无法读取微信 XLSX 的第一张工作表"); }
}

function alipayAccount(value: string) {
  const specialty = ["花呗", "余利宝", "余额宝", "蚂蚁财富"].find((item) => value.includes(item));
  return specialty ?? (!value || /^(余额|账户余额|集分宝|红包|淘金币|支付宝|他人代付)/.test(value) ? "支付宝" : value);
}
const wechatAccount = (value: string) => !value || /^[/\\]$/.test(value) || /^(零钱|零钱通)$/.test(value) ? "微信" : value;
const jdAccount = (value: string) => !value || /京东白条/.test(value) ? "京东" : value;

function nativeRow(source: BillSource, get: Access, line: number): StatementRow {
  const base: StatementRow = {
    line, date: get(["交易时间", "日期", "交易日期", "时间", "date", "time"]),
    kind: direction(get(["收/支", "收支", "类型", "方向", "type"])),
    amount: get(["金额", "金额(元)", "amount"]), toAmount: get(["转入金额", "toAmount"]), currency: get(["币种", "currency"]),
    title: get(["商品说明", "交易说明", "商品", "事项", "标题", "title", "description"]),
    payee: get(["交易对方", "商户名称", "交易方", "交易对方名称", "payee", "merchant"]),
    category: get(["交易分类", "分类", "交易类型", "category"]),
    account: get(["收/付款方式", "收/支方式", "支付方式", "账户", "资金账户", "account"]),
    toAccount: get(["转入账户", "toAccount"]), memo: get(["备注", "说明", "memo", "remark"]),
    number: get(["交易订单号", "交易单号", "单号", "number"]), status: get(["交易状态", "当前状态"]),
  };
  if (/^(交易关闭|已关闭|已取消)$/.test(base.status)) {
    base.skip = "来源记录标记为关闭或取消";
    return base;
  }
  if (source === "alipay") {
    base.account = alipayAccount(base.account);
    if (!base.kind) {
      const { title, payee, category, status } = base;
      if (/花呗/.test(title + payee) && /金融借贷|信用借还|还款/.test(category + title)) {
        base.kind = "transfer"; base.toAccount = "花呗";
      } else if (/收益|分红/.test(title) || status === "退款成功") base.kind = "income";
      else if (category === "投资理财" && /余额宝|余利宝|蚂蚁财富|蚂蚁智还/.test(title + payee)) {
        const fund = alipayAccount(payee) !== "支付宝" && /余额宝|余利宝|蚂蚁财富/.test(payee) ? alipayAccount(payee)
          : /余利宝/.test(title) ? "余利宝" : /余额宝/.test(title) ? "余额宝" : "蚂蚁财富";
        base.kind = "transfer";
        if (/转出到银行卡|提现/.test(title)) { base.toAccount = base.account; base.account = fund; }
        else base.toAccount = fund;
      } else if (/提现/.test(title) && payee && alipayAccount(payee) === payee && !/支付宝|花呗|余额宝/.test(payee)) {
        base.kind = "transfer"; base.toAccount = payee; base.account = "支付宝";
      } else if (/充值/.test(title)) { base.kind = "transfer"; base.toAccount = "支付宝"; }
    }
  } else if (source === "wechat") {
    base.account = wechatAccount(base.account);
    if (base.category === "零钱充值") { base.kind = "transfer"; base.toAccount = "微信"; }
    else if (base.category === "零钱提现") { base.kind = "transfer"; base.toAccount = base.account; base.account = "微信"; }
  } else if (source === "jd") {
    base.account = jdAccount(base.account);
    if (!base.kind && /白条(?:主动)?还款/.test(base.title)) { base.kind = "transfer"; base.toAccount = "京东"; }
    else if (!base.kind && /退款/.test(base.status + base.title)) base.kind = "income";
  }
  if (base.kind === "transfer" && base.toAccount && base.account === base.toAccount && source !== "csv") {
    base.skip = "来源转账两端是同一资金账户";
  }
  return base;
}

function customRow(row: TableRow, columns: CsvColumns): StatementRow {
  const get = (column: number | undefined) => column === undefined ? "" : row.cells[column - 1] ?? "";
  const raw = normalized(get(columns.type));
  const kind = (Object.entries(columns.typeValues) as [Kind, string][]).find(([, label]) => normalized(label) === raw)?.[0] ?? null;
  return {
    line: row.line, date: get(columns.date), amount: get(columns.amount), toAmount: get(columns.toAmount), currency: get(columns.currency),
    kind, title: get(columns.title), account: get(columns.account), toAccount: get(columns.toAccount), category: get(columns.category),
    payee: get(columns.payee), memo: get(columns.memo), number: get(columns.number), status: "",
  };
}

export function parseStatement(bytes: Buffer, source: BillSource, columns?: CsvColumns) {
  if (columns && source !== "csv") throw errors.invalidInput("可自定义列映射的来源为通用 CSV");
  const csv = source === "wechat" ? undefined : textCsv(bytes);
  const table = csv ? csvRows(csv.text) : wechatRows(bytes);
  const headerIndex = table.findIndex(({ line, cells }) => columns ? line === columns.headerLine :
    line <= 200 && cells.some((cell) => recognized.test(normalized(cell))) && cells.some((cell) => /^(金额|金额\(元\)|amount)$/.test(normalized(cell))));
  if (headerIndex === -1) throw errors.invalidInput("找不到账单表头，请核对来源和表头行");
  const header = table[headerIndex]!.cells.map(normalized);
  if (columns && [columns.date, columns.amount, columns.type, columns.account, columns.title,
    columns.toAccount, columns.toAmount, columns.currency, columns.payee, columns.category, columns.memo, columns.number]
    .some((index) => index !== undefined && index > header.length)) throw errors.invalidInput("指定列超出所选表头范围");
  const values = table.slice(headerIndex + 1).filter(({ cells }) => cells.some(Boolean) &&
    !/^[-—=]{3,}/.test(cells[0] ?? "") && !/^(合计|共计|本页|总计)/.test(cells[0] ?? ""));
  if (values.length === 0 || values.length > maxStatementRows) throw errors.invalidInput("账单可导入行数需在 1 到 10,000 之间");
  const rows = values.map((row) => {
    if (columns) return customRow(row, columns);
    const get: Access = (names) => {
      for (const name of names) {
        const value = row.cells[header.indexOf(normalized(name))];
        if (value && value !== "/" && value !== "\\") return value;
      }
      return "";
    };
    return nativeRow(source, get, row.line);
  });
  return { encoding: csv?.encoding ?? "XLSX" as const, rows };
}
