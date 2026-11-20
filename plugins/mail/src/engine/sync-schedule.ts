import { errors, isWorkbenchCaller } from "@huhu/contracts";
import { defineCapability, type HuhuApi } from "@huhu/kernel";
import { z } from "zod";
import type { openMailAccounts } from "./accounts.js";
import { MailAccountError } from "./discovery.js";
import type { MailNotificationSink, registerMessageCache } from "./message-cache.js";

const settingsFile = ".huhu/mail/sync-settings.json";
const interval = z.int().min(0).max(1440);
const settings = z.strictObject({ minutes: interval });
const state = z.strictObject({ accountId: z.string(), phase: z.enum(["refreshing", "ready", "retrying"]), at: z.iso.datetime(), retryAt: z.iso.datetime().optional() });
type State = z.infer<typeof state>;

export interface MailSyncOptions {
  notify?: MailNotificationSink;
  now?: () => number;
  schedule?: (run: () => void, delay: number) => () => void;
}

function scheduleTimer(run: () => void, delay: number) {
  const timer = setTimeout(run, delay);
  timer.unref();
  return () => clearTimeout(timer);
}

/** One Vault-owned timer reconciles the selected folders. Network failures only delay their account. */
export function registerMailSyncSchedule(api: HuhuApi, accounts: ReturnType<typeof openMailAccounts> | undefined, messages: Pick<ReturnType<typeof registerMessageCache>, "refresh">, stopped: AbortSignal, options: MailSyncOptions) {
  const { files } = api.vault;
  const now = options.now ?? Date.now;
  const schedule = options.schedule ?? scheduleTimer;
  const states = new Map<string, State>();
  const failures = new Map<string, { count: number; next: number }>();
  const watchers = new Map<string, AbortController>();
  const waiting = new Set<Promise<unknown>>();
  let stopTimer: (() => void) | undefined;
  let active: Promise<void> | undefined;
  let version = 0;
  const read = () => {
    const file = files.read(settingsFile);
    if (file) {
      try {
        return settings.parse(JSON.parse(file.bytes.toString("utf8")));
      } catch {
        // A later explicit settings save replaces an unreadable file.
      }
    }
    return { minutes: 15 };
  };
  const changed = () => {
    if (!stopped.aborted) api.events.publish("entity.changed", { kind: "mail-sync", id: "schedule", op: "updated" });
  };

  function stopWatcher(accountId: string) {
    watchers.get(accountId)?.abort();
    watchers.delete(accountId);
  }

  function watchInbox(accountId: string, revision: string, cursor: { folder: string; uidValidity: string; through: number }) {
    if (!accounts || watchers.size >= 2 || stopped.aborted || !read().minutes) return;
    const controller = new AbortController();
    const signal = AbortSignal.any([stopped, controller.signal, accounts.signal(accountId)]);
    watchers.set(accountId, controller);
    const wake = () => {
      if (signal.aborted) return;
      stopWatcher(accountId);
      if (accounts.readDefinition(accountId)?.revision !== revision) return;
      failures.set(accountId, { count: 0, next: now() });
      arm();
    };
    const task = accounts
      .waitForInbox(accountId, cursor.folder, cursor, wake, signal)
      .catch(() => undefined)
      .finally(() => {
        if (watchers.get(accountId) === controller) watchers.delete(accountId);
        waiting.delete(task);
      });
    waiting.add(task);
  }

  async function sweep(minutes: number) {
    const rows = (await accounts?.list()) ?? [];
    const available = new Set(rows.map(({ accountId }) => accountId));
    for (const id of states.keys()) if (!available.has(id)) states.delete(id);
    for (const id of failures.keys()) if (!available.has(id)) failures.delete(id);
    for (const id of watchers.keys()) if (!available.has(id)) stopWatcher(id);
    for (const account of rows) {
      if (stopped.aborted || !read().minutes) return;
      const { accountId, definition, authState } = account;
      if (authState["account-password"] !== "configured") continue;
      const failure = failures.get(accountId);
      if (failure && failure.next > now()) continue;
      stopWatcher(accountId);
      states.set(accountId, { accountId, phase: "refreshing", at: new Date(now()).toISOString() });
      changed();
      let revision = account.revision;
      try {
        if (definition.oauth) {
          await accounts!.ensureOAuthAccess(accountId, stopped);
          const current = accounts!.readDefinition(accountId);
          if (!current || JSON.stringify(current.definition) !== JSON.stringify(definition)) continue;
          revision = current.revision;
        }
        let more = false;
        let idle: Awaited<ReturnType<typeof messages.refresh>>["idle"];
        for (const folder of definition.folders) {
          stopped.throwIfAborted();
          if (accounts!.readDefinition(accountId)?.revision !== revision) break;
          const result = await messages.refresh({ accountId, folder: folder.path }, stopped);
          more ||= result.more;
          idle ??= result.idle;
        }
        if (stopped.aborted) return;
        if (!read().minutes || accounts!.readDefinition(accountId)?.revision !== revision) continue;
        failures.set(accountId, { count: 0, next: now() + (more ? 1000 : minutes * 60_000) });
        states.set(accountId, { accountId, phase: "ready", at: new Date(now()).toISOString() });
        if (idle && !more) watchInbox(accountId, revision, idle);
      } catch (error) {
        if (stopped.aborted) return;
        if (accounts!.readDefinition(accountId)?.revision !== revision) continue;
        if (error instanceof MailAccountError && error.code === "oauth-reauthorize") {
          failures.delete(accountId);
          states.delete(accountId);
          api.events.publish("entity.changed", { kind: "mail-account", id: accountId, op: "updated" });
          changed();
          continue;
        }
        const count = Math.min((failure?.count ?? 0) + 1, 10);
        const next = now() + Math.min(minutes * 60_000, 5000 * 2 ** (count - 1));
        failures.set(accountId, { count, next });
        states.set(accountId, { accountId, phase: "retrying", at: new Date(now()).toISOString(), retryAt: new Date(next).toISOString() });
      }
      changed();
    }
  }

  function arm(includeRetry = true) {
    stopTimer?.();
    stopTimer = undefined;
    const { minutes } = read();
    if (!accounts || files.readOnly || stopped.aborted || !minutes || active) return;
    const current = version;
    const retry = includeRetry ? Math.min(...[...failures.values()].map(({ next }) => next - now())) : Infinity;
    stopTimer = schedule(
      () => {
        stopTimer = undefined;
        if (stopped.aborted || current !== version || active) return;
        active = sweep(minutes)
          .catch(() => undefined)
          .finally(() => {
            active = undefined;
            if (current !== version) failures.clear();
            arm(current === version);
          });
      },
      Math.max(1000, Math.min(minutes * 60_000, retry)),
    );
  }

  const authorize = (caller: string, name: string) => {
    if (!isWorkbenchCaller(caller)) throw errors.permissionDenied(name);
  };
  const base = { plugin: "mail", exposable: false, defaultExposed: false } as const;
  api.defineCapability(
    defineCapability({
      ...base,
      name: "mail.sync.settings",
      scope: "read",
      input: z.strictObject({}),
      output: settings.extend({ accounts: z.array(state) }),
      handler({ caller }) {
        authorize(caller, "mail.sync.settings");
        return { ...read(), accounts: [...states.values()] };
      },
    }),
  );
  api.defineCapability(
    defineCapability({
      ...base,
      name: "mail.sync.setInterval",
      scope: "write",
      input: settings,
      output: settings,
      async handler({ caller, signal }, input) {
        authorize(caller, "mail.sync.setInterval");
        signal.throwIfAborted();
        stopped.throwIfAborted();
        await files.write(settingsFile, Buffer.from(JSON.stringify(input) + "\n"), { expectedVersion: files.currentVersion(settingsFile) });
        version++;
        failures.clear();
        for (const id of watchers.keys()) stopWatcher(id);
        if (!input.minutes) states.clear();
        arm(false);
        changed();
        return input;
      },
    }),
  );
  arm();
  return async () => {
    stopTimer?.();
    for (const id of watchers.keys()) stopWatcher(id);
    await active;
    await Promise.allSettled(waiting);
  };
}
