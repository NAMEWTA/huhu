import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { ArchiveDto, LedgerRecord } from "@huhu/contracts";
import { expect, test } from "vitest";
import type { Book } from "../src/shared/books.js";
import type { Budget } from "../src/shared/budgets.js";
import type { AccountsView } from "../src/shared/entries.js";
import type { Reference } from "../src/shared/references.js";
import { ledgerEngine } from "./fixture.js";

async function withNotes(run: (engine: Awaited<ReturnType<typeof ledgerEngine>>) => Promise<void>) {
  const root = mkdtempSync(path.join(tmpdir(), "huhu-ledger-notes-"));
  let engine: Awaited<ReturnType<typeof ledgerEngine>> | undefined;
  try {
    engine = await ledgerEngine(root, false, undefined, { notes: true });
    await run(engine);
  } finally {
    try {
      await engine?.close();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
}

async function bookFixture({ call }: Pick<Awaited<ReturnType<typeof ledgerEngine>>, "call">) {
  const book = await call<Book>("ledger.books.create", { name: "日常账本", defaultCurrency: "CNY", timeZone: "Asia/Taipei", firstAccount: { name: "钱包" } });
  const ref = { bookId: book.id };
  const accounts = () => call<AccountsView>("ledger.accounts.list", ref);
  const version = async () => ({ ...ref, expectedRevision: (await accounts()).book.revision });
  const {
    accounts: [account],
  } = await accounts();
  const expense = () =>
    version().then((revision) =>
      call<LedgerRecord>("ledger.records.create", {
        ...revision,
        intentKey: randomUUID(),
        title: "付款",
        record: {
          type: "expense",
          accountId: account!.id,
          occurredAt: "2026-01-31T16:00:00.000Z",
          currency: "CNY",
          amountMinor: "1025",
          categoryId: null,
          tagIds: [],
          payee: null,
          memo: null,
          attachmentIds: [],
        },
      }),
    );
  return { ref, version, expense };
}

test("关联真实笔记和档案，沿原身份打开，关闭知识库或缺资源仍可记账", async () => {
  await withNotes(async ({ call, invoke, plugins }) => {
    const { ref, version, expense } = await bookFixture({ call });
    const record = await expense();
    const [budget] = await call<Budget[]>("ledger.budgets.saveBatch", {
      ...(await version()),
      budgets: [{ definition: { type: "fixed", name: "日用", month: "2026-02", currency: "CNY", direction: "expense", limitMinor: "3000", categoryIds: [] } }],
    });
    const note = await call<{ path: string; id: string }>("notes.create", { name: "采购清单", body: "# 采购清单" });
    await call("archives.types.save", { name: "财务", fields: [] });
    const archive = await call<ArchiveDto>("archives.create", { type: "财务", name: "报销" });
    const bookOwner = { kind: "book" } as const;
    const budgetOwner = { kind: "budget", id: budget!.id } as const;
    const recordOwner = { kind: "record", id: record.id } as const;
    const link = async (owner: Reference["owner"], resource: Pick<Reference["resource"], "kind" | "path">) => call<Reference>("ledger.references.link", { ...(await version()), owner, resource });
    const archiveLink = await link(bookOwner, { kind: "archive", path: archive.path });
    const noteLink = await link(recordOwner, { kind: "note", path: note.path });
    const budgetLink = await link(budgetOwner, { kind: "note", path: note.path });
    const open = (owner: Reference["owner"], referenceId: string) => call("ledger.references.open", { ...ref, owner, referenceId });
    expect(await open(bookOwner, archiveLink.id)).toMatchObject({ status: "available", resource: { path: archive.path } });
    expect(await call("ledger.references.list", { ...ref, owner: budgetOwner })).toMatchObject({
      rows: [{ id: budgetLink.id, status: "available", resource: { documentId: note.id } }],
    });

    await call("notes.rename", { path: note.path, newName: "已整理采购清单" });
    expect(await open(recordOwner, noteLink.id)).toMatchObject({
      status: "available",
      resource: { path: "已整理采购清单.md", documentId: note.id },
    });
    await call("notes.trash", { path: "已整理采购清单.md" });
    expect(await open(recordOwner, noteLink.id)).toMatchObject({ status: "missing", id: noteLink.id });
    await plugins.disable("notes");
    expect(await open(recordOwner, noteLink.id)).toMatchObject({ status: "notes-disabled" });
    expect(await invoke("ledger.references.link", { ...(await version()), owner: recordOwner, resource: { kind: "note", path: "采购清单.md" } })).toMatchObject({ ok: false, error: { code: "PLUGIN_DISABLED" } });
    await expense();

    await plugins.enable("notes");
    const replacement = await call<{ path: string; id: string }>("notes.create", { name: "新采购清单" });
    expect(
      await call("ledger.references.link", {
        ...(await version()),
        owner: recordOwner,
        replaceId: noteLink.id,
        resource: { kind: "note", path: replacement.path },
      }),
    ).toMatchObject({ id: noteLink.id, resource: { documentId: replacement.id } });
    await call("ledger.references.unlink", { ...(await version()), owner: recordOwner, referenceId: noteLink.id });
    expect(await call("ledger.references.list", { ...ref, owner: recordOwner })).toMatchObject({ rows: [] });
    expect(await call("notes.read", { path: replacement.path })).toMatchObject({ path: replacement.path });
  });
});

test("生成并保存与报表同口径的 Markdown 复盘，拒绝已过期的账本版本", async () => {
  await withNotes(async (engine) => {
    const { call, invoke } = engine;
    const { ref, version, expense } = await bookFixture(engine);
    await expense();
    const query = { ...ref, from: "2026-02-01", to: "2026-02-28", currency: "CNY" };
    const preview = await call<{ revision: string; markdown: string }>("ledger.references.previewReview", query);
    expect(preview.markdown).toContain("账本：日常账本");
    expect(preview.markdown).toContain("2026-02-01 至 2026-02-28（Asia/Taipei 业务日）");
    expect(preview.markdown).toContain("排除平账组与历史排除流水");
    expect(preview.markdown).toContain("| CNY | CNY 0.00 | CNY 10.25 | CNY -10.25 |");
    expect(await call("notes.list", {})).toEqual([]);

    await expense();
    expect(await invoke("ledger.references.saveReview", { ...query, expectedRevision: preview.revision, name: "二月复盘" })).toMatchObject({ ok: false, error: { code: "VERSION_CONFLICT" } });
    const saved = await call<{ path: string; id: string }>("ledger.references.saveReview", {
      ...query,
      ...(await version()),
      name: "二月复盘",
    });
    expect(saved).toMatchObject({ path: "二月复盘.md", id: expect.any(String) });
    expect(await call("notes.read", { path: saved.path })).toMatchObject({ text: expect.stringContaining("CNY 20.50") });
  });
});
