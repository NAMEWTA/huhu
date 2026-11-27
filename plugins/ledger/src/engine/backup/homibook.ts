import { randomUUID } from "node:crypto";
import { errors, LedgerCurrency, LedgerMinorUnits, LedgerRecord, ledgerBusinessDate, ledgerDecimalToMinor, type LedgerRecord as RecordRow } from "@huhu/contracts";
import { z } from "zod";
import type { BackupDecision, BackupIssue, BackupModule, InspectBackup } from "../../shared/backups.js";
import { Budget } from "../../shared/budgets.js";
import { Attachment, maxAttachmentBytes } from "../../shared/entries.js";
import { ImportMapping } from "../../shared/imports.js";
import { stateSchema, type BookState } from "../store.js";
import { archiveJson } from "./archive-json.js";
import type { PreparedBackup } from "./index.js";
import { restoreHomibookCycles } from "./homibook-cycles.js";
import { digest, validateBookRelations } from "./snapshot.js";

const manifestSchema = z.object({ formatVersion: z.literal(1), scope: z.literal("full"), modules: z.array(z.string()).max(200) });
const id = z.string().min(1).max(256);
const instant = z.iso.datetime({ offset: true });
const decimal = z.string().max(65);
const bookSchema = z.object({ id, name: z.string().trim().min(1), createdAt: instant.optional() });
const accountSchema = z.object({
  id,
  accountBookId: id,
  name: z.string().trim().min(1),
  type: z.string(),
  currency: LedgerCurrency.default("CNY"),
  initialBalance: decimal.default("0"),
  status: z.string().optional(),
  createdAt: instant.optional(),
  deletedAt: instant.nullish(),
});
const recordSchema = z.object({
  id,
  accountBookId: id,
  type: z.enum(["INCOME", "EXPENSE", "TRANSFER"]),
  amount: decimal,
  date: instant,
  accountId: id,
  fromAccountId: id.nullish(),
  toAccountId: id.nullish(),
  categoryCode: id.nullish(),
  remark: z.string().nullish(),
  payer: z.string().nullish(),
  tags: z.string().max(20_000).optional(),
  offsetAt: instant.nullish(),
});
const adjustmentSchema = z.object({ id, accountId: id, date: instant, balanceAfter: decimal });
const dictionarySchema = z.object({ code: id, group: id, label: z.string().trim().min(1) });
const attachmentSchema = z.object({ id, path: z.string().max(512), originalFilename: z.string(), recordIds: z.array(id).max(10_000) });
const budgetSchema = z.object({
  id,
  accountBookId: id,
  name: z.string().trim().min(1),
  type: z.enum(["FIXED", "FREE"]),
  year: z.int().min(1).max(9999),
  month: z.int().min(0).max(12),
  amount: decimal,
  categoryCode: id.nullish(),
  tags: z.string().max(20_000).optional(),
  startDate: instant.nullish(),
  endDate: instant.nullish(),
});
const numericFields = new Set(["amount", "initialBalance", "balanceAfter", "loanTotalAmount", "loanInterestRate", "totalPayment", "principal", "interest", "remainingPrincipal"]);
const kinds = { cash: "cash", bank: "bank", credit: "credit", wallet: "wallet", investment: "investment", credit_card: "credit" } as const;
const summaryText = (value: string | null | undefined) => value?.trim().slice(0, 500) || null;

function rows(files: ReadonlyMap<string, Uint8Array>, name: string, required = false): Record<string, unknown>[] {
  const relative = "data/" + name + ".json";
  if (!required && !files.has(relative)) return [];
  const result = z
    .array(z.record(z.string(), z.unknown()))
    .max(10_000)
    .safeParse(archiveJson(files, relative, numericFields));
  if (!result.success) throw errors.invalidInput("HomiBook 表缺失、损坏或超出行数上限：" + name);
  return result.data;
}

function tags(value: string | undefined) {
  if (!value) return [];
  try {
    return z.array(z.string().trim().min(1).max(100)).max(50).parse(JSON.parse(value));
  } catch {
    throw errors.invalidInput("标签格式无效");
  }
}

export function inspectHomibook(files: ReadonlyMap<string, Uint8Array>, rawManifest: unknown, input: z.infer<typeof InspectBackup>): PreparedBackup {
  const { modules: sourceModules } = manifestSchema.parse(rawManifest);
  const recordsIncluded = sourceModules.includes("record");
  const budgetsIncluded = sourceModules.includes("budget");
  const attachmentsIncluded = recordsIncluded && sourceModules.includes("attachments");
  const cyclesIncluded = recordsIncluded && sourceModules.includes("recurring");
  const mappingsIncluded = sourceModules.includes("importMapping");
  const sourceBooks = z
    .array(bookSchema)
    .min(1)
    .max(200)
    .parse(rows(files, "accountBook", true));
  const selected = input.sourceBookId ? sourceBooks.find(({ id }) => id === input.sourceBookId) : sourceBooks[0];
  if (!selected) throw errors.notFound("数据包中没有所选 HomiBook 账本");
  const timeZone = input.timeZone;
  if (!timeZone) throw errors.invalidInput("请选择 HomiBook 账本的业务时区");
  const bookId = randomUUID();
  const state = stateSchema.parse({ book: { id: bookId, name: selected.name.slice(0, 100), status: "active", schemaVersion: 1, revision: randomUUID(), defaultCurrency: "CNY", timeZone }, accounts: [], bases: [], records: [] });
  const issues: BackupIssue[] = [];
  const flags = new Map<string, string>();
  const accountBySource = new Map<string, BookState["accounts"][number]>();
  const initial = new Map<string, { openingMinor: string; date: string }>();
  const recordsBySource = new Map<string, RecordRow>();
  const attachmentBytes = new Map<string, Uint8Array>();
  const dictionary = new Map<string, string>();
  function issue(module: BackupModule, row: string, message: string, choices: BackupDecision[] = ["skip-row"]) {
    const id = module + "-" + String(issues.length + 1);
    issues.push({ id, module, row: row.slice(0, 150), message: message.slice(0, 240), choices });
    return id;
  }
  function addDictionary(kind: "tag" | "category", rawKey: string, name: string) {
    const key = kind + ":" + rawKey;
    const existing = dictionary.get(key);
    if (existing) return existing;
    const id = randomUUID();
    state.dictionary.push({ id, bookId, name: name.slice(0, 100), kind, status: "active" });
    dictionary.set(key, id);
    return id;
  }
  function idsForTags(raw: string | undefined) {
    return [...new Set(tags(raw))].map((tag) => addDictionary("tag", tag, tag));
  }

  const categories = new Map<string, { label: string; direction: "income" | "expense" }>();
  for (const raw of rows(files, "dictionary")) {
    const result = dictionarySchema.safeParse(raw);
    if (!result.success) continue;
    const { group, code, label } = result.data;
    if (group === "transaction_category_income") categories.set(code, { label, direction: "income" });
    if (group === "transaction_category_expense") categories.set(code, { label, direction: "expense" });
  }

  for (const raw of rows(files, "account", true).filter((row) => row.accountBookId === selected.id)) {
    const parsed = accountSchema.safeParse(raw);
    try {
      if (!parsed.success) throw errors.invalidInput("账户名称、币种或字段无效");
      const row = parsed.data;
      if (accountBySource.has(row.id)) throw errors.invalidInput("重复账户 ID");
      const type = row.type.toLowerCase() as keyof typeof kinds;
      const account = {
        id: randomUUID(),
        bookId,
        name: row.name.slice(0, 150),
        type: Object.hasOwn(kinds, type) ? kinds[type] : ("other" as const),
        currency: row.currency,
        status: row.deletedAt || (row.status && row.status !== "ACTIVE") ? ("archived" as const) : ("active" as const),
      };
      const openingMinor = ledgerDecimalToMinor(row.initialBalance, row.currency);
      const date = row.createdAt || selected.createdAt ? ledgerBusinessDate(row.createdAt ?? selected.createdAt!, timeZone) : "0001-01-01";
      state.accounts.push(account);
      accountBySource.set(row.id, account);
      initial.set(account.id, { openingMinor, date });
    } catch (error) {
      issue("accounts", String(raw.name ?? raw.id ?? "账户"), error instanceof Error ? error.message : "期初金额无法精确换算");
    }
  }
  if (!state.accounts.some(({ currency }) => currency === "CNY") && state.accounts[0]) state.book.defaultCurrency = state.accounts[0].currency;

  const movements = new Map<string, { at: string; delta: bigint }[]>();
  const accumulate = (accountId: string, at: string, delta: bigint) => {
    const day = ledgerBusinessDate(at, timeZone);
    const opening = initial.get(accountId)!;
    if (day < opening.date) opening.date = day;
    const key = accountId + ":" + day;
    const group = movements.get(key) ?? [];
    group.push({ at, delta });
    movements.set(key, group);
  };
  for (const raw of (recordsIncluded ? rows(files, "record", true) : []).filter((row) => row.accountBookId === selected.id)) {
    const label = String(raw.id ?? "流水");
    try {
      const row = recordSchema.parse(raw);
      if (recordsBySource.has(row.id)) throw errors.invalidInput("流水 ID 重复");
      const account = accountBySource.get(row.type === "TRANSFER" ? (row.fromAccountId ?? "") : row.accountId);
      const target = row.type === "TRANSFER" ? accountBySource.get(row.toAccountId ?? "") : undefined;
      if (!account || (row.type === "TRANSFER" && !target)) throw errors.invalidInput("流水所需的账户不存在或无法迁入");
      if (target && target.currency !== account.currency) throw errors.invalidInput("跨币种转账缺少另一端金额");
      const amountMinor = ledgerDecimalToMinor(row.amount, account.currency);
      if (BigInt(amountMinor) <= 0n) throw errors.invalidInput("流水金额须为正数");
      const category = row.categoryCode ? categories.get(row.categoryCode) : null;
      const occurredAt = new Date(row.date).toISOString();
      const fields = {
        id: randomUUID(),
        bookId,
        occurredAt,
        revision: randomUUID(),
        categoryId: category && row.categoryCode ? addDictionary("category", row.categoryCode, category.label) : null,
        tagIds: idsForTags(row.tags),
        memo: summaryText(row.remark),
        payee: summaryText(row.payer),
        attachmentIds: [],
      };
      const record = LedgerRecord.parse(
        row.type === "TRANSFER" && target
          ? { ...fields, type: "transfer", fromAccountId: account.id, toAccountId: target.id, fromCurrency: account.currency, toCurrency: target.currency, fromAmountMinor: amountMinor, toAmountMinor: amountMinor }
          : { ...fields, type: row.type === "INCOME" ? "income" : "expense", accountId: account.id, currency: account.currency, amountMinor },
      );
      state.records.push(record);
      recordsBySource.set(row.id, record);
      state.recordTitles[record.id] = (fields.memo ?? fields.payee ?? "迁入流水").slice(0, 150);
      accumulate(account.id, occurredAt, BigInt(amountMinor) * (row.type === "INCOME" ? 1n : -1n));
      if (target) accumulate(target.id, occurredAt, BigInt(amountMinor));
      if (row.categoryCode && !category) issue("records", label, "原分类缺失，可保留流水并去除分类引用", ["drop-link"]);
      if (row.offsetAt) flags.set(issue("records", label, "旧平账标记缺少组成员，可选择是否沿用报表排除", ["retain-offset", "clear-offset"]), record.id);
    } catch (error) {
      issue("records", label, error instanceof Error ? error.message : "流水无法迁入");
    }
  }

  for (const [accountId, { openingMinor, date }] of initial) {
    state.bases.push({ bookId, accountId, effectiveBusinessDate: date, balanceMinor: openingMinor, revision: randomUUID() });
  }
  const adjustments = rows(files, "balanceAdjustment").filter((row) => typeof row.accountId === "string" && accountBySource.has(row.accountId));
  adjustments.sort((a, b) => Date.parse(String(a.date)) - Date.parse(String(b.date)));
  for (const raw of adjustments) {
    try {
      const row = adjustmentSchema.parse(raw);
      const account = accountBySource.get(row.accountId)!;
      const at = new Date(row.date).toISOString();
      const day = ledgerBusinessDate(at, timeZone);
      const after = BigInt(ledgerDecimalToMinor(row.balanceAfter, account.currency));
      const applied = (movements.get(account.id + ":" + day) ?? []).reduce((sum, item) => (item.at <= at ? sum + item.delta : sum), 0n);
      state.bases.push({ bookId, accountId: account.id, effectiveBusinessDate: day, balanceMinor: LedgerMinorUnits.parse((after - applied).toString()), revision: randomUUID() });
    } catch (error) {
      issue("accounts", String(raw.id ?? "余额校准"), error instanceof Error ? error.message : "校准金额无法精确换算");
    }
  }

  for (const raw of (budgetsIncluded ? rows(files, "budget", true) : []).filter((row) => row.accountBookId === selected.id)) {
    try {
      const row = budgetSchema.parse(raw);
      const currency = state.book.defaultCurrency;
      const base = { name: row.name.slice(0, 100), currency, limitMinor: ledgerDecimalToMinor(row.amount, currency) };
      let definition: unknown;
      if (row.type === "FIXED") {
        const category = row.categoryCode ? categories.get(row.categoryCode) : undefined;
        if (!category || !row.categoryCode) throw errors.invalidInput("固定预算缺少可确认的分类及方向");
        definition = { ...base, type: "fixed", month: String(row.year).padStart(4, "0") + "-" + String(row.month).padStart(2, "0"), direction: category.direction, categoryIds: [addDictionary("category", row.categoryCode, category.label)] };
      } else {
        definition = { ...base, type: "free", tagIds: idsForTags(row.tags), ...(row.startDate && { from: ledgerBusinessDate(row.startDate, timeZone) }), ...(row.endDate && { to: ledgerBusinessDate(row.endDate, timeZone) }) };
      }
      state.budgets.push(Budget.parse({ id: randomUUID(), bookId, revision: randomUUID(), definition }));
    } catch (error) {
      issue("budgets", String(raw.name ?? raw.id ?? "预算"), error instanceof Error ? error.message : "预算无法迁入");
    }
  }

  for (const raw of attachmentsIncluded ? rows(files, "recordAttachment", true) : []) {
    const parsed = attachmentSchema.safeParse(raw);
    if (!parsed.success) {
      if (Array.isArray(raw.recordIds))
        for (const id of raw.recordIds) {
          if (typeof id === "string" && recordsBySource.has(id)) issue("attachments", id, "原凭证元数据损坏", ["drop-link"]);
        }
      continue;
    }
    const row = parsed.data;
    const linked = [...new Set(row.recordIds)].flatMap((sourceId) => {
      const record = recordsBySource.get(sourceId);
      return record ? [{ sourceId, record }] : [];
    });
    if (!linked.length) continue;
    const name = row.path.split("/").at(-1);
    const data = name ? files.get("attachments/" + name) : undefined;
    const candidate =
      data?.length && data.length <= maxAttachmentBytes
        ? Attachment.safeParse({
            id: randomUUID(),
            fileName: row.originalFilename,
            size: data.length,
            sha256: digest(data),
            mediaType: "application/octet-stream",
          })
        : null;
    if (!data || !candidate?.success) {
      for (const { sourceId } of linked) issue("attachments", sourceId, "缺少或无法迁入凭证 " + row.originalFilename, ["drop-link"]);
      continue;
    }
    const { id: attachmentId } = candidate.data;
    let referenced = false;
    for (const { sourceId, record } of linked) {
      if (record.attachmentIds.length < 20) {
        record.attachmentIds.push(attachmentId);
        referenced = true;
      } else issue("attachments", sourceId, "该流水已达到凭证数量上限", ["drop-link"]);
    }
    if (referenced) {
      state.attachments.push(candidate.data);
      attachmentBytes.set(attachmentId, data);
    }
  }

  if (cyclesIncluded)
    restoreHomibookCycles(
      state,
      rows(files, "recurringTransaction", true).filter((row) => row.accountBookId === selected.id),
      rows(files, "repaymentPlan", true),
      accountBySource,
      recordsBySource,
      issue,
    );
  if (mappingsIncluded) {
    const normalize = (text: unknown) => (typeof text === "string" ? text.normalize("NFKC").trim().replace(/\s+/gu, " ").toLowerCase() : "");
    for (const [kind, table] of [
      ["account", "importAccountMapping"],
      ["category", "importCategoryMapping"],
    ] as const) {
      for (const row of rows(files, table, true)) {
        const original = kind === "account" ? row.sourceAccountName : row.sourceCategory;
        const reference = kind === "account" ? row.targetAccountName : row.targetCategoryCode;
        const target = typeof reference === "string" && kind === "category" ? categories.get(reference) : undefined;
        const accounts = kind === "account" && typeof reference === "string" ? state.accounts.filter(({ name, status }) => name === reference && status === "active") : [];
        const targetId = target && typeof reference === "string" ? addDictionary("category", reference, target.label) : accounts.length === 1 ? accounts[0]!.id : undefined;
        const result = ImportMapping.safeParse({
          source: row.source,
          kind,
          original,
          targetId,
          payeeContains: normalize(row.payerContains),
          descriptionContains: normalize(row.descriptionContains),
          recordType: normalize(row.recordType) || null,
        });
        if (result.success) state.mappings.push(result.data);
        else issue("mappings", String(original ?? row.id ?? "映射"), "目标在当前账本中缺失、不唯一或无法转换");
      }
    }
  }
  const modules: BackupModule[] = ["accounts"];
  if (recordsIncluded) modules.push("records");
  if (budgetsIncluded) modules.push("budgets");
  if (attachmentsIncluded) modules.push("attachments");
  if (cyclesIncluded) modules.push("cycles");
  if (mappingsIncluded) modules.push("mappings");
  const warnings: string[] = [];
  if (sourceModules.includes("recurring") && !cyclesIncluded) warnings.push("周期规则需要对应流水模块，请在 HomiBook 补选流水后重新导出。");
  if (state.recurring.length) warnings.push("固定收支恢复后可在账本页按需启用。");
  validateBookRelations(state);
  return {
    state,
    attachments: attachmentBytes,
    issues,
    warnings,
    modules,
    sourceBooks: sourceBooks.map(({ id, name }) => ({ id, name })),
    resolve(decisions) {
      return { ...state, legacyOffsetRecordIds: [...flags].flatMap(([issueId, recordId]) => (decisions[issueId] === "retain-offset" ? [recordId] : [])) };
    },
  };
}
