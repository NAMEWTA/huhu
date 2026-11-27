import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test, vi } from "vitest";
import type { Book } from "../src/shared/books.js";
import type { AccountsView, RecordsPage } from "../src/shared/entries.js";
import type { RecurringList, RecurringRow } from "../src/shared/recurring.js";
import { ledgerEngine } from "./fixture.js";

test("AU16 calendar edits use one plan revision and retain overdue dates from the previous schedule", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "huhu-ledger-calendar-"));
  let now = Date.parse("2026-01-01T12:00:00Z");
  const engine = await ledgerEngine(root, false, { now: () => now });
  try {
    const book = await engine.call<Book>("ledger.books.create", {
      name: "改期账本",
      defaultCurrency: "CNY",
      timeZone: "Asia/Taipei",
      firstAccount: { name: "账户" },
    });
    const key = { bookId: book.id };
    const { accounts, book: latest } = await engine.call<AccountsView>("ledger.accounts.list", key);
    const rule = { id: randomUUID(), title: "改期订阅", type: "expense", accountId: accounts[0]!.id, currency: "CNY", amountMinor: "123", startOn: "2026-01-02", frequency: "monthly", memo: null };
    const { plan } = await engine.call<RecurringRow>("ledger.recurring.create", { ...key, expectedRevision: latest.revision, rule });
    const signal = new AbortController().signal;
    const enabled = await engine.periodic!.change(
      {
        change: "set-intent",
        intent: "enabled",
        planId: plan!.planId,
        expectedRevision: plan!.revision,
        intentId: randomUUID(),
      },
      signal,
    );
    now = Date.parse("2026-02-03T12:00:00Z");
    const edit = {
      change: "reschedule",
      planId: enabled.planId,
      expectedRevision: enabled.revision,
      intentId: randomUUID(),
      trigger: { kind: "calendar", frequency: "daily", startOn: "2026-02-03" },
    } as const;
    const changed = await engine.periodic!.change(edit, signal);
    expect(changed).toMatchObject({ planId: enabled.planId, trigger: edit.trigger, intent: "enabled", nextAt: "2026-01-01T16:00:00.000Z" });
    expect(changed.revision).not.toBe(enabled.revision);
    await expect(engine.periodic!.change(edit, signal)).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
    const read = async () => (await engine.call<RecurringList>("ledger.recurring.list", key)).rows[0]!;
    expect(await read()).toMatchObject({ plan: { revision: changed.revision }, rule: { frequency: "daily", startOn: "2026-02-03" }, periods: [] });
    await engine.periodic!.tick();
    await expect.poll(async () => (await read()).periods.map(({ date }) => date)).toEqual(["2026-02-02", "2026-01-02"]);
    expect((await read()).plan?.nextAt).toBe("2026-02-03T16:00:00.000Z");
  } finally {
    await engine.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("L7 catch-up preserves original business dates, skips disabled windows, and retries the original failed occurrence", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "huhu-ledger-recurring-"));
  let now = Date.parse("2026-01-30T12:00:00Z");
  const clock = { now: () => now };
  let engine = await ledgerEngine(root, false, clock);
  try {
    const book = await engine.call<Book>("ledger.books.create", {
      name: "固定账本",
      defaultCurrency: "CNY",
      timeZone: "Asia/Taipei",
      firstAccount: { name: "账户" },
    });
    const key = { bookId: book.id };
    const accounts = () => engine.call<AccountsView>("ledger.accounts.list", key);
    const revision = async () => ({ ...key, expectedRevision: (await accounts()).book.revision });
    const accountId = (await accounts()).accounts[0]!.id;
    const rule = { id: randomUUID(), title: "月末订阅", type: "expense", accountId, currency: "CNY", amountMinor: "123", startOn: "2026-01-31", frequency: "monthly", memo: null };
    const create = { ...(await revision()), rule };
    const row = await engine.call<RecurringRow>("ledger.recurring.create", create);
    expect(row.plan).toMatchObject({ intent: "paused", businessSchedule: { zone: "Asia/Taipei" } });
    expect(await engine.call("ledger.recurring.create", create)).toEqual(row);
    const planId = row.rule.planId;
    const intent = (value: "enabled" | "paused") =>
      engine.periodic!.change(
        {
          change: "set-intent",
          intent: value,
          planId,
          expectedRevision: engine.periodic!.read(planId)!.revision,
          intentId: randomUUID(),
        },
        new AbortController().signal,
      );
    const periods = async () => (await engine.call<RecurringList>("ledger.recurring.list", key)).rows[0]!.periods;
    const records = () => engine.call<RecordsPage>("ledger.records.list", key);
    const overview = () => engine.call("ledger.overview.activity", key);
    expect(await overview()).toMatchObject({ recurring: { rules: 1, enabled: 0, nextAt: null } });
    await intent("enabled");
    expect(engine.periodic!.read(planId)?.nextAt).toBe("2026-01-30T16:00:00.000Z");
    expect(await overview()).toMatchObject({ recurring: { enabled: 1, nextAt: "2026-01-30T16:00:00.000Z" } });
    await engine.close();

    now = Date.parse("2026-03-01T01:00:00Z");
    engine = await ledgerEngine(root, false, clock);
    const publication = vi.spyOn(engine.vault.files, "write").mockRejectedValueOnce(new Error("账本提交夹具中断"));
    await engine.periodic!.tick();
    await expect.poll(() => engine.periodic!.read(planId)?.lastOccurrence?.state).toBe("failed");
    const interruptedOccurrence = engine.periodic!.read(planId)!.lastOccurrence!.occurrenceId;
    expect(await periods()).toEqual([]);
    expect((await records()).total).toBe(0);
    publication.mockRestore();
    await engine.periodic!.tick();
    await expect.poll(periods).toMatchObject([
      { date: "2026-02-28", state: "generated", attempts: 1 },
      { date: "2026-01-31", state: "generated", attempts: 1 },
    ]);
    expect((await records()).rows.map(({ businessDate }) => businessDate)).toEqual(["2026-02-28", "2026-01-31"]);
    await expect.poll(() => engine.periodic!.read(planId)?.lastOccurrence?.state).toBe("completed");
    expect(engine.periodic!.read(planId)?.lastOccurrence?.occurrenceId).toBe(interruptedOccurrence);
    await engine.periodic!.tick();
    expect(await periods()).toHaveLength(2);
    await intent("paused");
    now = Date.parse("2026-04-15T00:00:00Z");
    await engine.periodic!.tick();
    expect(await periods()).toHaveLength(2);
    await intent("enabled");
    expect(engine.periodic!.read(planId)?.nextAt).toBe("2026-04-29T16:00:00.000Z");

    await engine.call("ledger.accounts.setStatus", { ...(await revision()), accountId, status: "archived" });
    now = Date.parse("2026-05-01T00:00:00Z");
    await engine.periodic!.tick();
    await expect.poll(periods).toMatchObject([
      { date: "2026-04-30", state: "failed", recordId: null, attempts: 1 },
      { date: "2026-02-28", state: "generated" },
      { date: "2026-01-31", state: "generated" },
    ]);
    const failed = (await periods())[0]!;
    expect(await overview()).toMatchObject({ recurring: { failedPeriods: 1 } });
    await engine.call("ledger.accounts.setStatus", { ...(await revision()), accountId, status: "active" });
    const retry = { ...(await revision()), ruleId: rule.id, periodId: failed.periodId };
    const recovered = await engine.call("ledger.recurring.retry", retry);
    expect(recovered).toMatchObject({ periodId: failed.periodId, occurrenceId: failed.occurrenceId, date: "2026-04-30", state: "generated", attempts: 2 });
    expect(await engine.call("ledger.recurring.retry", retry)).toEqual(recovered);

    const last = (await records()).rows[0]!;
    const remove = { ...(await revision()), selection: [{ recordId: last.record.id, recordRevision: last.record.revision }], action: { kind: "delete" } };
    const preview = await engine.call<{ previewId: string }>("ledger.records.previewBatch", remove);
    await engine.call("ledger.records.confirmBatch", { ...remove, previewId: preview.previewId });
    await engine.periodic!.tick();
    expect(await periods()).toHaveLength(3);
    expect((await records()).rows.map(({ businessDate }) => businessDate)).toEqual(["2026-02-28", "2026-01-31"]);

    await engine.plugins.disable("ledger");
    now = Date.parse("2026-06-01T00:00:00Z");
    await engine.periodic!.tick();
    expect(engine.periodic!.read(planId)?.availability).toMatchObject({ state: "blocked", reason: "plugin-disabled" });
    await engine.plugins.enable("ledger");
    expect(await periods()).toHaveLength(3);
  } finally {
    await engine.close();
    rmSync(root, { recursive: true, force: true });
  }
});
