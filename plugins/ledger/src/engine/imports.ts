import { createHash, randomUUID } from "node:crypto";
import { errors, LedgerCurrency, ledgerBusinessDate, ledgerDecimalToMinor, ledgerSourceTime, type LedgerRecord } from "@huhu/contracts";
import { canonicalJson, type CapabilityContext } from "@huhu/kernel";
import { ZodError, type z } from "zod";
import { maxStatementBytes, type ConfirmImport, type ImportFile, type ImportMapping, type ImportPreview, type ImportReference, type ImportResult, type Resolutions, type SaveMapping } from "../shared/imports.js";
import type { CreateRecord } from "../shared/entries.js";
import { requireActiveBook } from "./accounts.js";
import { parseStatement, type StatementRow } from "./import-parsers.js";
import { saveRecord } from "./records.js";
import type { BookState, LedgerStore } from "./store.js";

type Source = z.infer<typeof ImportFile>["source"];
type RecordInput = z.infer<typeof CreateRecord>["record"];
type Line = ImportPreview["rows"][number];
type ResolvedLine = { info: Line; key: string; draft?: RecordInput };
type Plan = {
  preview: Omit<ImportPreview, "rows" | "counts" | "proposedAccounts">;
  parsed: StatementRow[];
  timeZone: string;
  owner: string;
  expires: number;
  overrides: Map<string, Resolutions[number]>;
  lines: ResolvedLine[];
};
const lifetimeMs = 15 * 60_000;
const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const normalize = (value: string) => value.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
const brief = (value: string, size = 180) => value.slice(0, size);
const owner = (context: CapabilityContext) => hash(canonicalJson([context.caller, context.subject ?? null, context.delegatedBy ?? null]));
const sourceKey = (line: StatementRow, source: Source, digest: string) => hash(canonicalJson(line.number ? [source, line.number, line.kind, line.date] : [source, digest, line.line]));

function optionalText(value: string) {
  return value ? brief(value, 500) : null;
}

function dateFor(raw: string, sourceZone: string, bookZone: string, disambiguation?: "earlier" | "later") {
  if (/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?(?:Z|[+-]\d\d:\d\d)$/.test(raw)) {
    const instant = new Date(raw);
    const date = instant.toISOString();
    // Validate the stated calendar fields before allowing the Date constructor to normalize them.
    ledgerSourceTime(raw.slice(0, 19), "UTC", "UTC");
    return { date, businessDate: ledgerBusinessDate(date, bookZone) };
  }
  const parts = /^(\d{4})[-/年](\d{1,2})[-/月](\d{1,2})日?(?:[T\s]+(\d{1,2}):(\d{1,2})(?::(\d{1,2})(\.\d{1,3})?)?)?$/.exec(raw);
  if (!parts) throw new Error("无法识别交易日期");
  const [, year, month, day, hour = "0", minute = "0", second = "0", fraction = ""] = parts;
  const pad = (part: string | undefined) => (part ?? "").padStart(2, "0");
  const local = `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:${pad(second)}${fraction}`;
  const result = ledgerSourceTime(local, sourceZone, bookZone, disambiguation);
  if (result.state === "gap") throw new Error("来源时区在此刻跳时，请跳过该行或修正来源时间");
  if (result.state === "ambiguous") return undefined;
  return { date: result.occurredAt, businessDate: result.businessDate };
}

function parsedAmount(raw: string, currency: string) {
  const text = raw
    .normalize("NFKC")
    .trim()
    .replace(/^[¥￥]\s*/, "");
  const decimal = /^(?:-?\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(text) ? text.replaceAll(",", "") : text;
  const units = BigInt(ledgerDecimalToMinor(decimal, currency));
  if (units === 0n) throw errors.invalidInput("交易金额为零");
  return (units < 0n ? -units : units).toString();
}

function matchesRule(rule: ImportMapping, source: Source, kind: ImportMapping["kind"], original: string, row: StatementRow, rowKind: Line["kind"]) {
  return (
    rule.source === source &&
    rule.kind === kind &&
    normalize(rule.original) === normalize(original) &&
    (!rule.recordType || rule.recordType === rowKind) &&
    (!rule.payeeContains || normalize(row.payee).includes(rule.payeeContains)) &&
    (!rule.descriptionContains || normalize(row.title + " " + row.memo).includes(rule.descriptionContains))
  );
}
const specificity = (rule: ImportMapping) => Number(!!rule.recordType) + Number(!!rule.payeeContains) + Number(!!rule.descriptionContains);
function mapped(state: BookState, source: Source, kind: ImportMapping["kind"], original: string, row: StatementRow, rowKind: Line["kind"]) {
  return state.mappings
    .slice()
    .reverse()
    .filter((rule) => matchesRule(rule, source, kind, original, row, rowKind))
    .sort((a, b) => specificity(b) - specificity(a))[0]?.targetId;
}

function inferAccount(state: BookState, source: Source, label: string, row: StatementRow, kind: Line["kind"], override?: string) {
  const active = state.accounts.filter((entry) => entry.status === "active");
  const saved = override ?? mapped(state, source, "account", label, row, kind);
  if (saved) return active.find((account) => account.id === saved);
  if (!label) return undefined;
  const name = normalize(label);
  const exact = active.filter((account) => normalize(account.name) === name);
  if (exact.length) return exact.length === 1 ? exact[0] : undefined;
  const partial = active.filter((account) => {
    const candidate = normalize(account.name);
    return Math.min(candidate.length, name.length) > 1 && (name.includes(candidate) || candidate.includes(name));
  });
  return partial.length === 1 ? partial[0] : undefined;
}

function apparentKey(record: RecordInput | LedgerRecord, businessDay: string) {
  return canonicalJson(record.type === "transfer" ? [record.type, record.fromAccountId, record.toAccountId, record.fromAmountMinor, record.toAmountMinor, businessDay] : [record.type, record.accountId, record.amountMinor, businessDay]);
}

function analyze(state: BookState, plan: Plan): ResolvedLine[] {
  const { source, inputDigest } = plan.preview;
  const seen = new Set(state.records.map((row) => apparentKey(row, ledgerBusinessDate(row.occurredAt, state.book.timeZone))));
  return plan.parsed.map((raw) => {
    const id = hash(canonicalJson([inputDigest, raw.line]));
    const key = sourceKey(raw, source, inputDigest);
    const edit = plan.overrides.get(id);
    const kind = edit?.kind ?? raw.kind;
    const selectedAccount = inferAccount(state, source, raw.account, raw, kind, edit?.accountId);
    const destination = kind === "transfer" ? inferAccount(state, source, raw.toAccount, raw, kind, edit?.toAccountId) : undefined;
    const mappedCategory =
      edit?.categoryId === undefined
        ? (mapped(state, source, "category", raw.category, raw, kind) ?? state.dictionary.find((entry) => entry.kind === "category" && entry.status === "active" && normalize(entry.name) === normalize(raw.category))?.id)
        : edit.categoryId;
    const category = state.dictionary.find((entry) => entry.id === mappedCategory && entry.kind === "category" && entry.status === "active");
    const info: Line = {
      rowId: id,
      line: raw.line,
      originalNumber: raw.number ? brief(raw.number) : null,
      title: brief(raw.title || raw.payee || "账单流水", 150),
      sourceDate: brief(raw.date, 100),
      businessDate: null,
      amount: brief(raw.amount),
      toAmount: brief(edit?.toAmount ?? raw.toAmount),
      sourceCurrency: brief(raw.currency),
      sourceAccount: brief(raw.account),
      sourceDestination: brief(raw.toAccount),
      sourceCategory: brief(raw.category),
      accountId: selectedAccount?.id ?? null,
      toAccountId: destination?.id ?? null,
      categoryId: category?.id ?? null,
      kind,
      state: "pending",
      diagnostic: null,
    };
    const result = (status: Line["state"], diagnostic?: string, draft?: RecordInput): ResolvedLine => ({ info: { ...info, state: status, diagnostic: diagnostic ?? null }, key, ...(draft && { draft }) });
    if (Object.hasOwn(state.importRows, key)) return result("imported", "该来源行已入账");
    if (edit?.skip || raw.skip) return result("skipped", raw.skip ?? "已选择跳过");
    let date;
    try {
      date = dateFor(raw.date, plan.timeZone, state.book.timeZone, edit?.disambiguation);
    } catch (error) {
      return result("invalid", error instanceof ZodError ? "日期格式不合法" : error instanceof Error ? error.message : "无效日期");
    }
    if (!date) return result("pending", "来源时区的时钟重复，请选择较早或较晚的时刻");
    info.businessDate = date.businessDate;
    if (!kind || !selectedAccount) return result("pending", !kind ? "请选择收支类型" : "请选择资金账户");
    if (mappedCategory && !category) return result("pending", "原分类映射已失效，请选择新分类或清空");
    const currency = selectedAccount.currency;
    const sourceCurrency = /^(RMB|人民币|元|¥)$/i.test(raw.currency) ? "CNY" : raw.currency.toUpperCase();
    if (sourceCurrency && (!LedgerCurrency.safeParse(sourceCurrency).success || sourceCurrency !== currency)) {
      return result("pending", "来源币种与资金账户币种不符，请调整账户");
    }
    let amount;
    try {
      amount = parsedAmount(raw.amount, currency);
    } catch {
      return result("invalid", "金额无法按账户币种精确入账");
    }
    const fields = {
      occurredAt: date.date,
      payee: optionalText(raw.payee),
      memo: optionalText(raw.memo),
      categoryId: info.categoryId,
      attachmentIds: [],
      tagIds: [],
    };
    let draft: RecordInput;
    if (kind === "transfer") {
      if (!destination || destination.id === selectedAccount.id) return result("pending", "请选择不同的转入账户");
      const toAmount = edit?.toAmount ?? raw.toAmount;
      if (!toAmount && destination.currency !== currency) return result("pending", "跨币种转账需填写转入实际金额");
      let units;
      try {
        units = toAmount ? parsedAmount(toAmount, destination.currency) : amount;
      } catch {
        return result("pending", "请填写可精确入账的转入金额");
      }
      if (destination.currency === currency && units !== amount) return result("pending", "同币种转账两端金额须相同");
      draft = { ...fields, type: kind, fromAccountId: selectedAccount.id, fromCurrency: currency, fromAmountMinor: amount, toAccountId: destination.id, toCurrency: destination.currency, toAmountMinor: units };
    } else draft = { ...fields, type: kind, accountId: selectedAccount.id, currency, amountMinor: amount };
    const apparent = apparentKey(draft, date.businessDate);
    const duplicate = seen.has(apparent);
    seen.add(apparent);
    return result(duplicate ? "duplicate" : "ready", duplicate ? "同日同账户和金额已有相似流水，可保留为独立交易" : undefined, draft);
  });
}

export class LedgerImports {
  private readonly plans = new Map<string, Plan>();
  private readonly inFlight = new Map<string, Promise<ImportResult>>();
  constructor(private readonly store: LedgerStore) {}

  dispose() {
    this.plans.clear();
  }

  private sweep() {
    for (const [id, plan] of this.plans) if (plan.expires <= Date.now()) this.plans.delete(id);
  }

  private get(context: CapabilityContext, input: z.infer<typeof ImportReference>) {
    this.sweep();
    const plan = this.plans.get(input.previewId);
    if (!plan || plan.preview.bookId !== input.bookId || plan.owner !== owner(context)) throw errors.notFound("导入预览失效，请重新预览");
    return plan;
  }

  private present(plan: Plan): ImportPreview {
    const counts = { ready: 0, duplicate: 0, pending: 0, invalid: 0, skipped: 0, imported: 0 };
    const proposed = new Set<string>();
    const rows = plan.lines.map(({ info }) => {
      counts[info.state]++;
      if (info.state === "pending") {
        if (!info.accountId && info.sourceAccount) proposed.add(info.sourceAccount);
        if (info.kind === "transfer" && !info.toAccountId && info.sourceDestination) proposed.add(info.sourceDestination);
      }
      return info;
    });
    return { ...plan.preview, rows, counts, proposedAccounts: [...proposed] };
  }

  async preview(context: CapabilityContext, input: z.infer<typeof ImportFile>) {
    const bytes = Buffer.from(input.base64, "base64");
    if (!bytes.length || bytes.length > maxStatementBytes || bytes.toString("base64") !== input.base64) throw errors.invalidInput("账单文件无效或大于 4 MiB");
    await this.store.idle();
    context.assertCapabilityCurrent?.();
    const state = this.store.snapshot(input.bookId);
    const result = parseStatement(bytes, input.source, input.columns);
    const plan: Plan = {
      preview: {
        bookId: input.bookId,
        previewId: randomUUID(),
        expectedRevision: state.book.revision,
        mappingRevision: state.mappingRevision,
        source: input.source,
        encoding: result.encoding,
        inputDigest: hash(bytes),
      },
      timeZone: input.sourceTimeZone,
      owner: owner(context),
      expires: Date.now() + lifetimeMs,
      parsed: result.rows,
      overrides: new Map(),
      lines: [],
    };
    plan.lines = analyze(state, plan);
    this.sweep();
    if (this.plans.size >= 12) this.plans.delete(this.plans.keys().next().value!);
    this.plans.set(plan.preview.previewId, plan);
    return this.present(plan);
  }

  async resolve(context: CapabilityContext, input: z.infer<typeof ImportReference> & { rows: Resolutions }) {
    await this.store.idle();
    context.assertCapabilityCurrent?.();
    const plan = this.get(context, input);
    const state = this.store.snapshot(input.bookId);
    this.verifyVersion(state, plan);
    const known = new Set(plan.lines.map(({ info }) => info.rowId));
    for (const row of input.rows) if (!known.has(row.rowId)) throw errors.invalidInput("预览不包含所指定的行");
    for (const row of input.rows) plan.overrides.set(row.rowId, { ...plan.overrides.get(row.rowId), ...row });
    plan.lines = analyze(state, plan);
    this.plans.delete(input.previewId);
    plan.preview.previewId = randomUUID();
    this.plans.set(plan.preview.previewId, plan);
    return this.present(plan);
  }

  cancel(context: CapabilityContext, input: z.infer<typeof ImportReference>) {
    this.get(context, input);
    this.plans.delete(input.previewId);
    return { cancelled: true as const };
  }

  private verifyVersion(state: BookState, plan: Plan) {
    if (state.book.revision !== plan.preview.expectedRevision || state.mappingRevision !== plan.preview.mappingRevision) {
      throw errors.versionConflict(state.book.revision);
    }
  }

  async confirm(context: CapabilityContext, input: z.infer<typeof ConfirmImport>): Promise<ImportResult> {
    const subject = owner(context);
    const key = hash(canonicalJson([subject, input.previewId, input.bookId, input.expectedRevision, input.inputDigest, input.mappingRevision, [...input.selectedRowIds].sort(), input.intentKey]));
    const pending = this.inFlight.get(key);
    if (pending) return pending;
    await this.store.idle();
    context.assertCapabilityCurrent?.();
    const state = this.store.snapshot(input.bookId);
    const saved = state.importReceipts.find((receipt) => receipt.key === key && receipt.owner === subject);
    if (saved) return { batchId: saved.batchId, imported: saved.imported, recordIds: saved.recordIds };
    const repeated = this.inFlight.get(key);
    if (repeated) return repeated;
    const plan = this.get(context, input);
    this.verifyVersion(state, plan);
    if (plan.preview.inputDigest !== input.inputDigest || plan.preview.expectedRevision !== input.expectedRevision || plan.preview.mappingRevision !== input.mappingRevision) throw errors.invalidInput("导入文件或映射已变化，请重新预览");
    const selected = new Set(input.selectedRowIds);
    const candidates = plan.lines.filter((row) => selected.has(row.info.rowId));
    if (candidates.length !== selected.size || candidates.some((row) => !row.draft)) throw errors.invalidInput("所选账单行包含未解决、已导入或已跳过的条目");
    const action = this.store.change(context, input.bookId, input.expectedRevision, (draft) => {
      requireActiveBook(draft);
      const recordIds = [];
      for (const line of candidates) {
        if (Object.hasOwn(draft.importRows, line.key)) continue;
        const record = saveRecord(draft, line.draft!, line.info.title);
        draft.importRows[line.key] = record.id;
        recordIds.push(record.id);
      }
      const receipt = { batchId: randomUUID(), imported: recordIds.length, recordIds };
      draft.importReceipts.push({ ...receipt, key, owner: subject, previewId: input.previewId });
      return receipt;
    });
    this.inFlight.set(key, action);
    try {
      const result = await action;
      this.plans.delete(input.previewId);
      return result;
    } finally {
      this.inFlight.delete(key);
    }
  }

  async status(context: CapabilityContext, input: z.infer<typeof ImportReference>) {
    await this.store.idle();
    const receipt = this.store.snapshot(input.bookId).importReceipts.find((row) => row.previewId === input.previewId && row.owner === owner(context));
    return receipt ? { batchId: receipt.batchId, imported: receipt.imported, recordIds: receipt.recordIds } : null;
  }

  saveMappings(context: CapabilityContext, input: z.infer<typeof SaveMapping>) {
    return this.store.change(context, input.bookId, input.expectedRevision, (state) => {
      requireActiveBook(state);
      const rules = new Map(state.mappings.map((rule) => [mappingKey(rule), rule]));
      for (const rule of input.rules) {
        const valid =
          rule.kind === "account" ? state.accounts.some((row) => row.id === rule.targetId && row.status === "active") : state.dictionary.some((row) => row.id === rule.targetId && row.kind === "category" && row.status === "active");
        if (!valid) throw errors.invalidInput("映射目标必须属于当前账本且可用");
        const normalized = { ...rule, payeeContains: normalize(rule.payeeContains), descriptionContains: normalize(rule.descriptionContains) };
        rules.set(mappingKey(normalized), normalized);
      }
      state.mappings = [...rules.values()];
      state.mappingRevision = randomUUID();
      return { revision: state.mappingRevision, rules: state.mappings };
    });
  }
}

function mappingKey(rule: ImportMapping) {
  return canonicalJson([rule.source, rule.kind, normalize(rule.original), rule.payeeContains, rule.descriptionContains, rule.recordType]);
}
