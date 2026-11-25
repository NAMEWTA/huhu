import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, expect, test } from "vitest";
import { type Book, type BookList, type RemovalPreview } from "../src/shared/books.js";
import { ledgerEngine } from "./fixture.js";

const teardown: (() => void | Promise<void>)[] = [];
afterEach(async () => {
  for (const done of teardown.splice(0).reverse()) await done();
});

function directory() {
  const root = mkdtempSync(path.join(tmpdir(), "huhu-ledger-"));
  teardown.push(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

async function engine(root: string, readOnly = false) {
  const session = await ledgerEngine(root, readOnly);
  teardown.push(session.close);
  return session;
}

const input = (name: string) => ({ name, defaultCurrency: "TWD", timeZone: "Asia/Taipei", firstAccount: { name: "银行账户" } });
const version = (book: Book) => ({ bookId: book.id, expectedRevision: book.revision });

test("books and selection survive reopen and disable; another Vault and read-only writes stay isolated", async () => {
  const root = directory();
  const first = await engine(root);
  const a = await first.call<Book>("ledger.books.create", input("开支"));
  const b = await first.call<Book>("ledger.books.create", input("项目"));
  await first.call("ledger.books.open", { bookId: a.id });
  await first.plugins.disable("ledger");
  expect((await first.invoke("ledger.books.list")).ok).toBe(false);
  expect(await first.plugins.enable("ledger")).toBe("active");
  expect(await first.call<BookList>("ledger.books.list")).toEqual({ books: [a, b], activeBookId: a.id, readOnly: false });
  await first.close();

  const unrelated = await engine(directory());
  expect(await unrelated.call<BookList>("ledger.books.list")).toEqual({ books: [], activeBookId: null, readOnly: false });
  const reopened = await engine(root);
  expect(await reopened.call<BookList>("ledger.books.list")).toEqual({ books: [a, b], activeBookId: a.id, readOnly: false });
  await reopened.close();
  const reader = await engine(root, true);
  expect(await reader.call<BookList>("ledger.books.list")).toEqual({ books: [a, b], activeBookId: a.id, readOnly: true });
  expect(await reader.invoke("ledger.books.open", { bookId: b.id })).toMatchObject({ ok: false, error: { code: "READ_ONLY_VAULT" } });
  expect(await reader.invoke("ledger.books.create", input("拒绝"))).toMatchObject({ ok: false, error: { code: "READ_ONLY_VAULT" } });
});

test("archive preserves history; removal requires the preview revision and the current name", async () => {
  const session = await engine(directory());
  const book = await session.call<Book>("ledger.books.create", input("历史"));
  const started = await session.call<RemovalPreview>("ledger.books.previewRemoval", { bookId: book.id });
  expect(started).toEqual({ book, accounts: 1, records: 0, attachments: 0 });
  const archived = await session.call<Book>("ledger.books.archive", version(book));
  expect(archived.status).toBe("archived");
  expect(await session.invoke("ledger.books.remove", { ...version(book), confirmedName: "历史" })).toMatchObject({ ok: false, error: { code: "VERSION_CONFLICT" } });
  const active = await session.call<Book>("ledger.books.restore", version(archived));
  const updated = await session.call<Book>("ledger.books.update", { ...version(active), name: "已更名" });
  expect(await session.invoke("ledger.books.remove", { ...version(updated), confirmedName: "历史" })).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
  expect(await session.call("ledger.books.remove", { ...version(updated), confirmedName: "已更名" })).toEqual({ ok: true });
  expect(await session.call<BookList>("ledger.books.list")).toEqual({ books: [], activeBookId: null, readOnly: false });
});
