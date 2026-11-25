import { mailTool, requireMailCaller } from "./tool-access.js";
import { errors, isWorkbenchCaller, PERIODIC_PLANS_SERVICE, PlanSummarySchema, periodicPlanSourceService, type PeriodicPlanControl, type PeriodicPlanSource, type PeriodicPlanSpec, type PeriodicRunContext, type PeriodicRunOutcome } from "@huhu/contracts";
import { bindCapability, defineCapabilityDescriptor, type HuhuApi } from "@huhu/kernel";
import { z } from "zod";
import type { openMailAccounts } from "./accounts.js";
import { MailAccountError } from "./discovery.js";
import type { MailNotificationSink, registerMessageCache } from "./message-cache.js";

import type { MailIntents } from "./tool-intents.js";

const settingsVersion = z.string().nullable().optional();
const settingsFile = ".huhu/mail/sync-settings.json";
const planId = "periodic-mail-sync";
const interval = z.int().min(0).max(1440);
const settings = z.strictObject({ minutes: interval });
const state = z.strictObject({ accountId: z.string(), phase: z.enum(["refreshing", "ready", "retrying"]), at: z.iso.datetime(), retryAt: z.iso.datetime().optional() });
type State = z.infer<typeof state>;

export interface MailSyncOptions {
  notify?: MailNotificationSink;
  now?: () => number;
}

function spec(minutes: number, previousSeconds = 900): PeriodicPlanSpec {
  const object = { kind: "mail-accounts", id: "selected-folders" };
  return {
    planId, title: "邮件周期同步", source: { plugin: "mail", object },
    everySeconds: minutes > 0 ? minutes * 60 : previousSeconds,
    bounds: { min: 60, max: 86_400, step: 60 },
    action: { capability: "mail.sync.refresh", object, summary: "同步已配置邮箱的所选文件夹" },
    intent: minutes > 0 ? "enabled" : "paused",
  };
}

export const syncScheduleDescriptors = {
  syncSettings: defineCapabilityDescriptor({
    ...mailTool,
    name: "mail.sync.settings",
    title: "查看邮件同步周期",
    description: "读取保存的同步周期和现有状态。",
    risk: "normal",
    scope: "read",
    input: z.strictObject({}),
    output: settings.extend({ accounts: z.array(state), revision: z.string().nullable(), plan: PlanSummarySchema.nullable(), available: z.boolean() }),
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
  const states = new Map<string, State>();
  const failures = new Map<string, { count: number; next: number }>();
  const watchers = new Map<string, AbortController>();
  const waiting = new Set<Promise<unknown>>();
  let planSignal: AbortSignal | undefined;
  let active: Promise<PeriodicRunOutcome | void> | undefined;
  const control = () => api.service<PeriodicPlanControl>(PERIODIC_PLANS_SERVICE);
  const readLegacy = () => {
    const file = files.read(settingsFile);
    if (!file) return [];
    try {
      const legacy = settings.extend({ revision: z.uuidv4().optional() }).safeParse(JSON.parse(file.bytes.toString("utf8")));
      return legacy.success ? [spec(legacy.data.minutes)] : [];
    } catch {
      return [];
    }
  };
  const changed = () => {
    if (!stopped.aborted) api.events.publish("entity.changed", { kind: "mail-sync", id: "schedule", op: "updated" });
  };

  function stopWatcher(accountId: string) {
    watchers.get(accountId)?.abort();
    watchers.delete(accountId);
  }

  function watchInbox(accountId: string, revision: string, cursor: { folder: string; uidValidity: string; through: number }, plan: PeriodicRunContext) {
    if (!accounts || watchers.size >= 2 || !plan.isCurrent()) return;
    const controller = new AbortController();
    const signal = AbortSignal.any([plan.signal, stopped, controller.signal, accounts.signal(accountId), messages.signal()]);
    watchers.set(accountId, controller);
    const wake = () => {
      if (signal.aborted) return;
      stopWatcher(accountId);
      if (accounts.readDefinition(accountId)?.revision !== revision) return;
      failures.set(accountId, { count: 0, next: now() });
      plan.wake(1_000);
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

  async function sweep(period: number, plan: PeriodicRunContext): Promise<PeriodicRunOutcome | void> {
    const signal = AbortSignal.any([plan.signal, stopped, messages.signal()]);
    const rows = (await accounts?.list()) ?? [];
    const available = new Set(rows.map(({ accountId }) => accountId));
    let attempted = false;
    let failed = false;
    for (const id of states.keys()) if (!available.has(id)) states.delete(id);
    for (const id of failures.keys()) if (!available.has(id)) failures.delete(id);
    for (const id of watchers.keys()) if (!available.has(id)) stopWatcher(id);
    for (const account of rows) {
      if (signal.aborted || !plan.isCurrent()) return attempted ? undefined : "skipped";
      const { accountId, definition, authState } = account;
      let folders = definition.folders;
      if (authState["account-password"] !== "configured") continue;
      const failure = failures.get(accountId);
      if (failure && failure.next > now()) continue;
      stopWatcher(accountId);
      states.set(accountId, { accountId, phase: "refreshing", at: new Date(now()).toISOString() });
      changed();
      let revision = account.revision;
      attempted = true;
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
        if (!plan.isCurrent() || accounts!.readDefinition(accountId)?.revision !== revision) continue;
        const follow = more ? 1_000 : period;
        failures.set(accountId, { count: 0, next: now() + follow });
        if (more) plan.wake(follow);
        states.set(accountId, { accountId, phase: "ready", at: new Date(now()).toISOString() });
        if (idle && !more) watchInbox(accountId, revision, idle, plan);
      } catch (error) {
        if (signal.aborted) return;
        if (accounts!.readDefinition(accountId)?.revision !== revision) continue;
        failed = true;
        if (error instanceof MailAccountError && error.code === "oauth-reauthorize") {
          failures.delete(accountId);
          states.delete(accountId);
          api.events.publish("entity.changed", { kind: "mail-account", id: accountId, op: "updated" });
          changed();
          continue;
        }
        const count = Math.min((failure?.count ?? 0) + 1, 10);
        const delay = Math.min(period, 5_000 * 2 ** (count - 1));
        const next = now() + delay;
        plan.wake(delay);
        failures.set(accountId, { count, next });
        states.set(accountId, { accountId, phase: "retrying", at: new Date(now()).toISOString(), retryAt: new Date(next).toISOString() });
      }
      changed();
    }
    if (failed) return "failed";
    if (!attempted) return "skipped";
  }

  function clearProjection() {
    failures.clear();
    states.clear();
    for (const id of watchers.keys()) stopWatcher(id);
    changed();
  }

  api.provide(periodicPlanSourceService("mail"), {
    signal: stopped,
    legacy: readLegacy,
    availability: () => accounts ? { state: "ready" } : { state: "blocked", reason: "credentials-unavailable" },
    async run(plan, context) {
      if (planSignal !== context.signal) {
        clearProjection();
        planSignal = context.signal;
        context.signal.addEventListener("abort", () => {
          if (planSignal === context.signal) clearProjection();
        }, { once: true });
      }
      active = sweep(plan.everySeconds * 1_000, context);
      try {
        return await active;
      } finally {
        active = undefined;
      }
    },
  } satisfies PeriodicPlanSource);

  const authorize = (caller: string, name: string) => {
    requireMailCaller(caller, name);
  };
  api.defineCapability(
    bindCapability(syncScheduleDescriptors.syncSettings, async ({ caller, signal }) => {
      authorize(caller, "mail.sync.settings");
      const service = control();
      await service?.importSource("mail");
      signal.throwIfAborted();
      const plan = service?.read(planId) ?? null;
      const minutes = plan?.intent === "enabled" && plan.trigger.kind === "interval"
        ? (plan.trigger.unit === "minutes" ? plan.trigger.every : plan.trigger.every / 60) : 0;
      return { minutes, accounts: [...states.values()], revision: plan?.revision ?? null, plan, available: Boolean(service && accounts) };
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
          const service = control();
          if (!service) throw errors.pluginDisabled("automations");
          await service.importSource("mail");
          const previous = service.read(planId);
          const current = previous?.revision ?? null;
          if (expectedRevision !== undefined && expectedRevision !== current) throw errors.versionConflict(current ?? "");
          const trigger = previous?.trigger;
          const period = trigger?.kind === "interval" ? trigger.every * (trigger.unit === "minutes" ? 60 : 1) : 900;
          await service.configure([{ ...spec(minutes, period), expectedRevision: current }], AbortSignal.any([signal, stopped]));
          return input;
        },
        (data) => data,
        (data) => data,
      );
    }),
  );
  const off = api.events.subscribe((event) => {
    if (event.type !== "entity.changed" || !("kind" in event.payload) || event.payload.kind !== "mail-cache") return;
    clearProjection();
  });
  return async () => {
    off();
    clearProjection();
    await active;
    await Promise.allSettled(waiting);
  };
}
