import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, expect, test } from "vitest";
import type { Book } from "../src/shared/books.js";
import type { Budget, BudgetDetail, BudgetOverview, CopyBudgetResult } from "../src/shared/budgets.js";
import type { AccountsView, DictionaryItem } from "../src/shared/entries.js";
import { ledgerEngine } from "./fixture.js";

const cleanup: Array<() => void | Promise<void>> = [];
afterEach(async () => {
  for (const dispose of cleanup.splice(0).reverse()) await dispose();
});

async function setup() {
  const root = mkdtempSync(path.join(tmpdir(), "huhu-ledger-budgets-"));
  cleanup.push(() => rmSync(root, { recursive: true, force: true }));
  const engine = await ledgerEngine(root);
  cleanup.push(engine.close);
  const book = await engine.call<Book>("ledger.books.create", {
    name: "预算夹具",
    defaultCurrency: "CNY",
    timeZone: "Asia/Taipei",
    firstAccount: { name: "银行" },
  });
  const ref = { bookId: book.id };
  const accounts = () => engine.call<AccountsView>("ledger.accounts.list", ref);
  const version = async () => ({ ...ref, expectedRevision: (await accounts()).book.revision });
  const dictionary = async (kind: DictionaryItem["kind"], name: string) => (await engine.call<DictionaryItem>("ledger.dictionaries.save", { ...(await version()), kind, name })).id;
  const save = async (budgets: Array<{ id?: string; definition: Budget["definition"] }>) => engine.call<Budget[]>("ledger.budgets.saveBatch", { ...(await version()), budgets });
  return { root, engine, ref, version, dictionary, save, account: (await accounts()).accounts[0]! };
}

test("L6 progress and paginated detail count any matching tag once and use category IDs and business dates", async () => {
  const { engine, ref, version, dictionary, save, account } = await setup();
  const tagA = await dictionary("tag", "旅行");
  const tagB = await dictionary("tag", "度假");
  const otherTag = await dictionary("tag", "旅行备用");
  const category = await dictionary("category", "交通");
  const otherCategory = await dictionary("category", "交通备用");
  const create = async (title: string, amountMinor: string, occurredAt: string, tagIds: string[], categoryId: string | null, type = "expense") =>
    engine.call("ledger.records.create", {
      ...(await version()),
      intentKey: randomUUID(),
      title,
      record: {
        type,
        accountId: account.id,
        occurredAt,
        amountMinor,
        currency: account.currency,
        categoryId,
        tagIds,
        memo: null,
        payee: null,
        attachmentIds: [],
      },
    });
  await create("原交通分类", "700", "2026-02-02T09:00:00.000Z", [], category);
  await engine.call("ledger.dictionaries.save", { ...(await version()), id: category, kind: "category", name: "历史交通", status: "archived" });
  await engine.call("ledger.dictionaries.save", { ...(await version()), id: otherCategory, kind: "category", name: "交通" });
  const defs: Budget["definition"][] = [
    { name: "度假", type: "free", currency: "CNY", limitMinor: "10000", tagIds: [tagA, tagB], from: "2026-02-01", to: "2026-02-28" },
    { name: "交通", type: "fixed", currency: "CNY", limitMinor: "20000", month: "2026-02", direction: "expense", categoryIds: [otherCategory] },
  ];
  const [free, fixed] = await save(defs.map((definition) => ({ definition })));
  await create("上月末", "900", "2026-01-31T15:59:59.999Z", [tagA], otherCategory);
  await create("双标签支出", "2100", "2026-01-31T16:00:00.000Z", [tagA, tagB], otherCategory);
  await create("标签近似", "400", "2026-02-02T10:00:00.000Z", [otherTag], null);
  await create("单标签支出", "1200", "2026-02-02T16:00:00.000Z", [tagB], null);
  await create("收入", "500", "2026-02-04T00:00:00.000Z", [tagA], otherCategory, "income");

  const query = { ...ref, year: "2026", month: "02" };
  const overview = await engine.call<BudgetOverview>("ledger.budgets.list", query);
  expect(overview.budgets).toMatchObject([
    { id: free!.id, count: 2, actualMinor: "3300", remainingMinor: "6700" },
    { id: fixed!.id, count: 1, actualMinor: "2100", remainingMinor: "17900" },
  ]);
  const detail = (page: number) => engine.call<BudgetDetail>("ledger.budgets.detail", { ...query, budgetId: free!.id, page, pageSize: 1 });
  const [first, second] = await Promise.all([detail(1), detail(2)]);
  expect(first).toMatchObject({ count: 2, actualMinor: "3300", rows: [{ title: "单标签支出" }] });
  expect(second.rows).toMatchObject([{ title: "双标签支出", businessDate: "2026-02-01" }]);
  expect(await engine.call("ledger.budgets.list", { ...ref, year: "2026" })).toMatchObject({
    totals: [
      { type: "free", currency: "CNY", actualMinor: "3300" },
      { type: "fixed", currency: "CNY", actualMinor: "2100" },
    ],
  });
});

test("L6 multi-month copying preserves a conflicting budget and remains repeatable after reopening", async () => {
  const { root, engine, ref, version, save } = await setup();
  const month = { name: "餐饮", type: "fixed", currency: "CNY", limitMinor: "20000", month: "2026-01", direction: "expense", categoryIds: [] } as const;
  const [, existing] = await save([{ definition: { ...month, categoryIds: [] } }, { definition: { ...month, categoryIds: [], month: "2026-02", limitMinor: "30000" } }]);
  const copy = { source: "2026-01", targets: ["2026-02", "2026-03"] };
  expect(await engine.call<CopyBudgetResult>("ledger.budgets.copy", { ...(await version()), ...copy })).toEqual({
    created: 1,
    skipped: [{ month: "2026-02", name: "餐饮", existingId: existing!.id }],
  });
  const revisionAfterCopy = await version();
  await engine.close();
  const reopened = await ledgerEngine(root);
  cleanup.push(reopened.close);
  expect(await reopened.call<CopyBudgetResult>("ledger.budgets.copy", { ...revisionAfterCopy, ...copy })).toMatchObject({
    created: 0,
    skipped: [{ existingId: existing!.id }, { month: "2026-03" }],
  });
  const year = await reopened.call<BudgetOverview>("ledger.budgets.list", { ...ref, year: "2026" });
  expect(year.budgets.map(({ definition }) => definition)).toMatchObject([
    { month: "2026-01", limitMinor: "20000" },
    { month: "2026-02", limitMinor: "30000" },
    { month: "2026-03", limitMinor: "20000" },
  ]);
  expect(year.totals).toMatchObject([{ limitMinor: "70000", actualMinor: "0" }]);
});
