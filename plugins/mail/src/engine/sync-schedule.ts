import { randomUUID } from "node:crypto";
import { mailTool, requireMailCaller } from "./tool-access.js";
import { errors, isWorkbenchCaller } from "@huhu/contracts";
import { bindCapability, defineCapabilityDescriptor, type HuhuApi } from "@huhu/kernel";
import { z } from "zod";
import type { openMailAccounts } from "./accounts.js";
import { MailAccountError } from "./discovery.js";
import type { MailNotificationSink, registerMessageCache } from "./message-cache.js";

import type { MailIntents } from "./tool-intents.js";

const settingsVersion = z.string().nullable().optional();
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
export const syncScheduleDescriptors = {
  syncSettings: defineCapabilityDescriptor({
    ...mailTool,
    name: "mail.sync.settings",
    title: "查看邮件同步周期",
    description: "读取保存的同步周期和现有状态。",
    risk: "normal",
    scope: "read",
    input: z.strictObject({}),
    output: settings.extend({ accounts: z.array(state), revision: settingsVersion }),
  }),
  syncSetInterval: defineCapabilityDescriptor({
    ...mailTool,
    name: "mail.sync.setInterval",
    title: "设置邮件同步周期",
    description: "保存周期并重新安排同步。",
    risk: "normal",
    scope: "admin",
    idempotency: "handler",
    input: settings.extend({ expectedRevision: settingsVersion }),
    output: settings,
  }),
};

export function registerMailSyncSchedule(
  api: HuhuApi,
  accounts: ReturnType<typeof openMailAccounts> | undefined,
  messages: Pick<ReturnType<typeof registerMessageCache>, "refresh" | "signal">,
  stopped: AbortSignal,
  options: MailSyncOptions,
  once: MailIntents,
) {
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
        const { minutes } = settings.extend({ revision: z.uuidv4().optional() }).parse(JSON.parse(file.bytes.toString("utf8")));
        return { minutes };
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
    const signal = AbortSignal.any([stopped, controller.signal, accounts.signal(accountId), messages.signal()]);
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
    const signal = AbortSignal.any([stopped, messages.signal()]);
    const rows = (await accounts?.list()) ?? [];
    const available = new Set(rows.map(({ accountId }) => accountId));
    for (const id of states.keys()) if (!available.has(id)) states.delete(id);
    for (const id of failures.keys()) if (!available.has(id)) failures.delete(id);
    for (const id of watchers.keys()) if (!available.has(id)) stopWatcher(id);
    for (const account of rows) {
      if (signal.aborted || !read().minutes) return;
      const { accountId, definition, authState } = account;
      let folders = definition.folders;
      if (authState["account-password"] !== "configured") continue;
      const failure = failures.get(accountId);
      if (failure && failure.next > now()) continue;
      stopWatcher(accountId);
      states.set(accountId, { accountId, phase: "refreshing", at: new Date(now()).toISOString() });
      changed();
      let revision = account.revision;
      try {
        if (definition.oauth) {
          await accounts!.ensureOAuthAccess(accountId, signal);
          const current = accounts!.readDefinition(accountId);
          if (!current) continue;
          revision = current.revision;
          folders = current.definition.folders;
        }
        let more = false;
        let idle: Awaited<ReturnType<typeof messages.refresh>>["idle"];
        for (const folder of folders) {
          signal.throwIfAborted();
          if (accounts!.readDefinition(accountId)?.revision !== revision) break;
          const result = await messages.refresh({ accountId, folder: folder.path }, signal);
          more ||= result.more;
          idle ??= result.idle;
        }
        if (signal.aborted) return;
        if (!read().minutes || accounts!.readDefinition(accountId)?.revision !== revision) continue;
        failures.set(accountId, { count: 0, next: now() + (more ? 1000 : minutes * 60_000) });
        states.set(accountId, { accountId, phase: "ready", at: new Date(now()).toISOString() });
        if (idle && !more) watchInbox(accountId, revision, idle);
      } catch (error) {
        if (signal.aborted) return;
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
    requireMailCaller(caller, name);
  };
  api.defineCapability(
    bindCapability(syncScheduleDescriptors.syncSettings, ({ caller }) => {
      authorize(caller, "mail.sync.settings");
      return { ...read(), accounts: [...states.values()], ...(!isWorkbenchCaller(caller) && { revision: files.currentVersion(settingsFile) }) };
    }),
  );
  api.defineCapability(
    bindCapability(syncScheduleDescriptors.syncSetInterval, (context, { expectedRevision, minutes }) => {
      const { caller, signal } = context;
      const name = syncScheduleDescriptors.syncSetInterval.name;
      authorize(caller, name);
      if (!isWorkbenchCaller(caller) && expectedRevision === undefined) throw errors.invalidInput("请先读取邮件同步设置版本。");
      const input = { minutes };
      return once(
        context,
        name,
        JSON.stringify(expectedRevision),
        { ...input, expectedRevision },
        async () => {
          signal.throwIfAborted();
          stopped.throwIfAborted();
          const current = files.currentVersion(settingsFile);
          if (expectedRevision !== undefined && expectedRevision !== current) throw errors.versionConflict(current ?? "");
          await files.write(settingsFile, Buffer.from(JSON.stringify({ ...input, revision: randomUUID() }) + "\n"), { expectedVersion: current });
          version++;
          failures.clear();
          for (const id of watchers.keys()) stopWatcher(id);
          if (!input.minutes) states.clear();
          arm(false);
          changed();
          return input;
        },
        (data) => data,
        (data) => data,
      );
    }),
  );
  const off = api.events.subscribe((event) => {
    if (event.type !== "entity.changed" || !("kind" in event.payload) || event.payload.kind !== "mail-cache") return;
    version++;
    failures.clear();
    states.clear();
    for (const id of watchers.keys()) stopWatcher(id);
    arm(false);
    changed();
  });
  arm();
  return async () => {
    off();
    stopTimer?.();
    for (const id of watchers.keys()) stopWatcher(id);
    await active;
    await Promise.allSettled(waiting);
  };
}
