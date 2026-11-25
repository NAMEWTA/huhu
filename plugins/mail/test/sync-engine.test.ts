import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { NotificationStore } from "@huhu/kernel";
import type { PlanSummary } from "@huhu/contracts";
import { assert, expect, test, test as engineTest, vi } from "vitest";
import { boot, type RunningEngine } from "./fixtures/engine.js";
import { openMailAccounts } from "../src/engine/accounts.js";
import type { MailLocationTarget } from "../src/engine/conversations.js";
import type { PeriodicPlans } from "../../automations/src/engine/periodic-plans.js";
import type { MailSyncOptions } from "../src/engine/sync-schedule.js";
import { onMailNotificationRequest, requestMailNotification } from "../src/ui/mail-notification-command.js";
import { openImapFixture, type FixtureImapMessage } from "./fixtures/imap.js";

const injection = vi.hoisted(() => ({
  options: undefined as MailSyncOptions | undefined,
  periodic: undefined as PeriodicPlans | undefined,
  now: undefined as (() => number) | undefined,
}));
vi.mock("../../automations/src/engine/index.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../automations/src/engine/index.js")>();
  return {
    ...original,
    apply: ((ctx, api, options) => {
      const result = original.apply(ctx, api, { ...options, ...(injection.now && { schedule: false, periodicClock: { now: injection.now } }) });
      injection.periodic = result.periodic;
      return result;
    }) satisfies typeof original.apply,
  };
});
vi.mock("../src/engine/registration.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../src/engine/registration.js")>();
  return {
    ...original,
    apply: ((ctx, api, owner, transport, syncOptions, ...options) => original.apply(ctx, api, owner, transport, injection.options ?? syncOptions, ...options)) satisfies typeof original.apply,
  };
});

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

function message(uid: number, seen = false): FixtureImapMessage {
  return { uid, uidValidity: 42, subject: `Fixture ${uid}`, seen, source: `From: Sender <sender@example.test>\r\nTo: fixture@example.test\r\nSubject: Fixture ${uid}\r\n\r\nBody start${uid}end\r\n` };
}

engineTest(
  "IMAP bounds initial history, reconciles ordered arrivals and retries after disconnect with exact notice targets",
  async () => {
    const root = mkdtempSync(path.join(tmpdir(), "huhu-mail-sync-"));
    const vaultPath = path.join(root, "vault");
    const desktopUserData = path.join(root, "app");
    mkdirSync(path.join(vaultPath, ".huhu/mail"), { recursive: true });
    writeFileSync(path.join(vaultPath, ".huhu/mail/sync-settings.json"), JSON.stringify({ minutes: 15 }));
    mkdirSync(desktopUserData);
    const box = { uidValidity: 42, messages: Array.from({ length: 205 }, (_, index) => message(index + 1)) };
    let fault: ((uid: number) => Promise<void>) | undefined;
    const mailboxOptions = { windows: { INBOX: box }, reverseFetch: true, allowIdle: false, beforeSource: (uid: number) => fault?.(uid) ?? Promise.resolve() };
    const imap = await openImapFixture(mailboxOptions);
    const notices = new NotificationStore(path.join(root, "standalone-workbench-notifications.ndjson"));
    const published: string[] = [];
    let loseNoticeAcknowledgement = false;
    let now = Date.UTC(2026, 10, 21);
    injection.now = () => now;
    const waitForImap = { timeout: 10_000 };
    injection.options = {
      notify({ id, ...notice }) {
        published.push(id);
        notices.create(notice, id);
        if (loseNoticeAcknowledgement) {
          loseNoticeAcknowledgement = false;
          throw new Error("fixture lost the notice acknowledgement");
        }
      },
      now: () => now,
    };
    function nextDelay() {
      const next = injection.periodic?.read("periodic-mail-sync")?.nextAt;
      return next ? Date.parse(next) - now : undefined;
    }
    async function tick(delay: number) {
      assert(injection.periodic);
      expect(nextDelay()).toBe(delay);
      now += delay;
      await injection.periodic.tick();
    }
    let engine: RunningEngine | undefined;
    function request(capability: string, input: unknown = {}, signal?: AbortSignal, intentKey?: string) {
      assert(engine);
      return engine.dispatcher.call("desktop", { capability, input, requestId: randomUUID(), idempotencyKey: intentKey ?? randomUUID(), ...(intentKey && { intentKey }) }, signal);
    }
    async function call<T = unknown>(capability: string, input: unknown = {}) {
      const response = await request(capability, input);
      assert(response.ok, JSON.stringify(response));
      return response.data as T;
    }
    const schedule = () => call<{ minutes: number; revision: string | null; plan: PlanSummary | null }>("mail.sync.settings");
    async function changeSchedule(change: { change: "delete" } | { change: "set-intent"; intent: "paused" }) {
      const { plan } = await schedule();
      assert(plan);
      const intentId = randomUUID();
      const result = await request("automations.plans.submit", { planId: plan.planId, expectedRevision: plan.revision, intentId, ...change }, undefined, intentId);
      expect(result).toMatchObject({ ok: true, data: { outcome: "completed", plan: { planId: plan.planId } } });
      return plan;
    }

    try {
      engine = await boot({ vaultPath, desktopUserData, create: true });
      assert(engine.moduleCredentialHost);
      assert(injection.periodic, "the Automations fixture clock was not installed");
      await injection.periodic.tick();
      expect((await schedule()).plan).toMatchObject({ intent: "enabled", availability: { state: "ready" } });
      const accounts = openMailAccounts({ ...engine.moduleCredentialHost, vault: engine.vault });
      const draft = accounts.begin(
        { provider: "custom_imap", email: "fixture@example.test", label: "Fixture", auth: "password", imap: { host: "127.0.0.1", port: imap.port, security: "none" }, smtpEnabled: false, smtp: { host: "", port: 465, security: "tls" } },
        `synthetic-${randomUUID()}`,
      );
      await draft.testConnection();
      const { accountId } = await draft.save();
      const folder = { accountId, folder: "INBOX" };
      const bodyFetches = () => imap.fetchRequests.filter((line) => /BODY\.PEEK/i.test(line));
      const refresh = () => call<{ message: { uid: number; localMessageId: string; readState: string } | null }>("mail.sync.refresh", folder);
      expect((await refresh()).message?.uid).toBe(205);
      expect(bodyFetches()).toHaveLength(200);
      expect(imap.fetchRequests.filter((line) => /^\S+ FETCH \d+:\d+ /i.test(line))).toHaveLength(8);
      expect(bodyFetches().some((line) => /UID FETCH 5 /.test(line))).toBe(false);
      expect(await call("mail.conversations.search", { text: "start6end" })).toMatchObject({ cachedMessages: 200, total: 1 });
      expect(notices.list()).toHaveLength(0);

      box.messages[204]!.seen = true;
      expect((await refresh()).message?.readState).toBe("synced");
      expect(bodyFetches()).toHaveLength(200);
      expect(notices.list()).toHaveLength(0);
      expect(nextDelay()).toBe(15 * 60_000);
      const migrated = (await schedule()).plan!;
      await call("mail.sync.setInterval", { minutes: 1 });
      expect(await call("automations.plans.read", { planId: migrated.planId })).toMatchObject({ trigger: { kind: "interval", every: 1, unit: "minutes" } });
      box.messages.push(message(232), message(206), ...Array.from({ length: 25 }, (_, index) => message(index + 207, true)));
      let disconnected = false;
      fault = async (uid) => {
        if (uid === 207 && !disconnected) {
          disconnected = true;
          throw new Error("fixture dropped socket");
        }
      };
      await tick(60_000);
      await expect.poll(() => nextDelay(), waitForImap).toBe(5000);
      expect(disconnected).toBe(true);
      expect(await call("mail.sync.settings")).toMatchObject({ minutes: 1, accounts: [{ accountId, phase: "retrying" }] });
      expect(await call("mail.messages.latest", folder)).toMatchObject({ message: { uid: 205 } });
      expect(notices.list()).toHaveLength(0);

      await tick(5000);
      await expect.poll(() => nextDelay(), waitForImap).toBe(60_000);
      await expect.poll(() => call("mail.sync.settings"), waitForImap).toMatchObject({ accounts: [{ accountId, phase: "ready" }] });
      expect(await call("mail.messages.latest", folder)).toMatchObject({ message: { uid: 232 } });
      expect(notices.list()).toHaveLength(2);
      const targets = await Promise.all(notices.list().map(({ id }) => call<MailLocationTarget>("mail.notifications.target", { id })));
      expect(targets.map((target) => target.source === "imap" && target.uid).sort()).toEqual([206, 232]);
      for (const target of targets) {
        expect(target).toMatchObject({ ...folder, source: "imap", uidValidity: "42" });
        expect(await call("mail.conversations.findMessage", { target, limit: 20 })).toMatchObject({ message: target });
      }
      await refresh();
      expect(published).toHaveLength(2);

      box.messages.push(message(233));
      loseNoticeAcknowledgement = true;
      const started = deferred();
      const release = deferred();
      fault = async () => {
        started.resolve();
        await release.promise;
      };
      const opens = () => imap.commands.filter((command) => command === "EXAMINE").length;
      const before = opens();
      const pending = [refresh(), refresh()];
      const caller = new AbortController();
      const cancelled = request("mail.sync.refresh", folder, caller.signal);
      await started.promise;
      caller.abort();
      expect((await cancelled).ok).toBe(false);
      release.resolve();
      await expect(Promise.all(pending)).resolves.toEqual([expect.objectContaining({ message: expect.objectContaining({ uid: 233 }) }), expect.objectContaining({ message: expect.objectContaining({ uid: 233 }) })]);
      expect(opens() - before).toBe(1);
      expect(published).toHaveLength(3);
      await refresh();
      expect(published).toHaveLength(4);
      expect(published.at(-1)).toBe(published.at(-2));
      expect(notices.list()).toHaveLength(3);

      fault = undefined;
      mailboxOptions.allowIdle = true;
      await tick(60_000);
      await expect.poll(imap.idleCount, waitForImap).toBe(1);
      box.messages.push(message(234, true));
      imap.announceExists(box.messages.length);
      await expect.poll(() => nextDelay(), waitForImap).toBe(1000);
      await tick(1000);
      await expect.poll(imap.idleCount, waitForImap).toBe(1);
      expect(await call("mail.messages.latest", folder)).toMatchObject({ message: { uid: 234 } });
      imap.disconnectIdle();
      await expect.poll(imap.idleCount, waitForImap).toBe(0);
      expect(nextDelay()).toBe(60_000);
      const paused = await changeSchedule({ change: "set-intent", intent: "paused" });
      const whilePaused = opens();
      now += 120_000;
      await injection.periodic?.tick();
      expect(opens()).toBe(whilePaused);
      expect(await schedule()).toMatchObject({ minutes: 0, plan: { planId: paused.planId, intent: "paused" } });
      expect((await refresh()).message?.uid).toBe(234);
      await call("mail.sync.setInterval", { minutes: 1, expectedRevision: (await schedule()).revision });

      const resetting = deferred();
      const blocked = deferred();
      box.uidValidity = 43;
      box.messages = [message(42)];
      fault = async () => {
        resetting.resolve();
        await blocked.promise;
      };
      await tick(60_000);
      await resetting.promise;
      expect(await call("mail.messages.latest", folder)).toEqual({ message: null });
      expect(await call("mail.notifications.target", { id: published[0] })).toBeNull();
      await engine.shutdown();
      engine = undefined;
      blocked.resolve();
      await expect.poll(imap.idleCount, waitForImap).toBe(0);
      fault = undefined;
      engine = await boot({ vaultPath, desktopUserData });
      await changeSchedule({ change: "delete" });
      const deletedAt = opens();
      await engine.shutdown();
      engine = await boot({ vaultPath, desktopUserData });
      now += 120_000;
      await injection.periodic?.tick();
      expect(opens()).toBe(deletedAt);
      expect(await schedule()).toMatchObject({ minutes: 0, plan: { planId: paused.planId, intent: "deleted" } });
      await engine.shutdown();
      engine = undefined;
      const beforeSwitch = opens();
      const otherVault = path.join(root, "other-vault");
      mkdirSync(otherVault);
      engine = await boot({ vaultPath: otherVault, desktopUserData, create: true });
      await injection.periodic?.tick();
      expect(await call("mail.sync.settings")).toMatchObject({ minutes: 0, plan: null });
      expect(await call("mail.notifications.target", { id: published[0] })).toBeNull();
      expect(opens()).toBe(beforeSwitch);
      expect(published).toHaveLength(4);
    } finally {
      injection.options = undefined;
      injection.now = undefined;
      await engine?.shutdown();
      await imap.close();
      if (path.dirname(root) === tmpdir() && path.basename(root).startsWith("huhu-mail-sync-")) rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    }
  },
  120_000,
);

test("notification routing accepts only Mail notices from the mounted Vault and Engine endpoint", async () => {
  const id = `ntf-mail-${"a".repeat(64)}`;
  const scope = { vaultId: "vault-fixture", endpoint: "engine-first" };
  const open = vi.fn();
  const show = vi.fn(() => true);
  expect(await requestMailNotification({ ...scope, id }, show)).toBe(true);
  const wrong = onMailNotificationRequest({ ...scope, endpoint: "engine-second" }, open);
  expect(open).not.toHaveBeenCalled();
  wrong();
  const current = onMailNotificationRequest(scope, open);
  try {
    expect(await requestMailNotification({ ...scope, id }, show)).toBe(true);
    expect(open).toHaveBeenCalledExactlyOnceWith(id);
    expect(await requestMailNotification({ ...scope, id: "ntf-unrelated" }, show)).toBe(false);
  } finally {
    current();
  }
});
