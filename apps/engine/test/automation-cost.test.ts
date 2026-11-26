import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { PlanSummary } from "@huhu/contracts";
import { HerdrClient } from "@huhu/herdr-client";
import { NotificationStore } from "@huhu/kernel";
import type { HerdrCore } from "@huhu/plugin-agent-cli/engine";
import { AutomationsService } from "@huhu/plugin-automations/engine";
import { expect, test, vi } from "vitest";
import { WebSocket } from "ws";
import { ObservationPlans } from "../../../plugins/automations/src/engine/observations.js";
import { boot, type RunningEngine } from "../src/boot.js";

const fixture = vi.hoisted(() => ({
  now: new Date("2030-02-01T01:00:00.000Z"),
  core: undefined as HerdrCore | undefined,
}));

vi.mock("@huhu/plugin-automations/engine", async (original) => {
  const plugin = await original<typeof import("@huhu/plugin-automations/engine")>();
  return { ...plugin, apply: ((ctx, api, options) => plugin.apply(ctx, api, { ...options, now: () => fixture.now })) satisfies typeof plugin.apply };
});

vi.mock("@huhu/plugin-agent-cli/engine", async (original) => {
  const plugin = await original<typeof import("@huhu/plugin-agent-cli/engine")>();
  return { ...plugin, apply: ((ctx, api, options) => {
    const applied = plugin.apply(ctx, api, options);
    fixture.core = applied.core;
    return applied;
  }) satisfies typeof plugin.apply };
});

const bin = process.env["HUHU_HERDR_BIN"] ?? path.resolve(import.meta.dirname, "../../desktop/resources/herdr/linux-x64/herdr-core");
const title = "AU18 固定活动观察";
const fixtureCore = () => fixture.core;

async function call<T>(engine: RunningEngine, capability: string, input: object, intentKey?: string) {
  const response = await fetch(`http://127.0.0.1:${engine.port}/api/v1/call`, {
    method: "POST",
    headers: { authorization: `Bearer ${engine.rendererToken}`, "content-type": "application/json" },
    body: JSON.stringify({ capability, input, requestId: randomUUID(), idempotencyKey: intentKey ?? randomUUID(), intentKey }),
  });
  const body = await response.text();
  const parsed = JSON.parse(body) as { ok: boolean; data: T };
  expect(parsed, capability).toMatchObject({ ok: true });
  return { data: parsed.data, bytes: Buffer.byteLength(body) };
}

function subscribe(engine: RunningEngine) {
  const socket = new WebSocket(`ws://127.0.0.1:${engine.port}/ws/events`, [`bearer.${engine.rendererToken}`]);
  const notices: { id: string; bytes: number }[] = [];
  const ready = new Promise<void>((resolve, reject) => {
    socket.once("message", (raw) => {
      const hello = JSON.parse(raw.toString()) as { type: string };
      if (hello.type === "hello") resolve();
      else reject(new Error("缺少工作台事件握手"));
    });
    socket.once("error", reject);
  });
  socket.on("message", (raw) => {
    const text = raw.toString();
    const frame = JSON.parse(text) as { type: string; payload?: { id: string; title: string } };
    if (frame.type === "notification.created" && frame.payload?.title.startsWith(title)) {
      notices.push({ id: frame.payload.id, bytes: Buffer.byteLength(text) });
    }
  });
  return { ready, notices, close: () => socket.terminate() };
}

test.skipIf(process.platform !== "linux" || !existsSync(bin))("AU18 a shared Engine observes and delivers once across history sizes and subscriber counts", async () => {
  vi.stubEnv("HUHU_HERDR_BIN", bin);
  const realTick = ObservationPlans.prototype.tick;
  let observations: ObservationPlans | undefined;
  const tick = vi.spyOn(ObservationPlans.prototype, "tick").mockImplementation(function (this: ObservationPlans) {
    // Keep the instance the Engine scheduled so the sample can drive its real tick.
    observations = tick.mock.contexts.at(-1) as ObservationPlans | undefined;
    return Promise.resolve();
  });
  const rpc = vi.spyOn(HerdrClient.prototype, "call");
  const notify = vi.spyOn(NotificationStore.prototype, "create");
  const history = vi.spyOn(AutomationsService.prototype, "activations");
  const samples = [];
  try {
    for (const historyCount of [0, 1_000, 10_000]) {
      fixture.now = new Date("2030-02-01T01:00:00.000Z");
      fixture.core = undefined;
      observations = undefined;
      const dir = mkdtempSync(path.join(tmpdir(), "huhu-au18-"));
      let engine: RunningEngine | undefined;
      const sockets: ReturnType<typeof subscribe>[] = [];
      try {
        const running = engine = await boot({ vaultPath: dir, create: true });
        const [space] = (await call<{ id: string; revision: number }[]>(running, "agent.spaces.list", {})).data;
        const session = (await call<{ id: string }>(running, "agent.sessions.launch", {
          provider: "shell", spaceId: space!.id, spaceRevision: space!.revision, command: "sleep 90", requestId: randomUUID(),
        })).data;
        const intentId = randomUUID();
        const plan = (await call<PlanSummary>(running, "automations.plans.createObservation", {
          title, target: { kind: "agent-session", id: session.id }, everySeconds: 1,
          condition: { kind: "threshold", status: "running", seconds: 1 },
          stopAtTerminal: false, effect: "notification", repeat: true, intentId,
        }, intentId)).data;
        const journal = path.join(running.vault.stateDir, "automations", "activations");
        mkdirSync(journal, { recursive: true });
        const recorded = "2030-01-01T00:00:00.000Z";
        const seeded = Array.from({ length: historyCount }, (_, index) => JSON.stringify({
          activationId: `act-fixture-${index}`, ruleId: plan.planId, trigger: "schedule", scheduledFor: recorded,
          startedAt: recorded, finishedAt: recorded, summary: { state: "succeeded" },
        })).join("\n");
        writeFileSync(path.join(journal, "2030-01.ndjson"), seeded);

        expect(observations).toBeDefined();
        await realTick.call(observations);
        const sample = async (clients: number, priorOccurrences: number) => {
          const viewers = Array.from({ length: clients }, () => subscribe(running));
          sockets.push(...viewers);
          await Promise.all(viewers.map((viewer) => viewer.ready));
          rpc.mockClear();
          notify.mockClear();
          history.mockClear();
          fixture.now = new Date(fixture.now.getTime() + 2_000);
          await realTick.call(observations);
          if (clients) await expect.poll(() => viewers.map(({ notices }) => notices.length)).toEqual(viewers.map(() => 1));
          const results = await Promise.all(viewers.map(async ({ notices }) => {
            const [catalogue, page] = await Promise.all([
              call<{ plans: PlanSummary[] }>(running, "automations.plans.list", {}),
              call<{ rows: { id: string; planId: string }[]; next: object | null }>(running, "automations.plans.history", { limit: 5 }),
            ]);
            expect(catalogue.data.plans).toMatchObject([{ planId: plan.planId, revision: plan.revision, lastOccurrence: { state: "completed" } }]);
            expect(page.data.rows[0]?.id).toBe(catalogue.data.plans[0]?.lastOccurrence?.occurrenceId);
            expect(page.data.rows).toHaveLength(Math.min(5, historyCount + priorOccurrences + 1));
            expect(Boolean(page.data.next)).toBe(historyCount + priorOccurrences + 1 > 5);
            return { historyRows: page.data.rows.length, responseBytes: catalogue.bytes + page.bytes, notificationFrameBytes: notices[0]!.bytes };
          }));
          const terminalLists = rpc.mock.calls.filter(([method]) => method === "terminal.list").length;
          const notifications = notify.mock.calls.filter(([entry]) => entry.title.startsWith(title)).length;
          expect(terminalLists).toBeGreaterThan(0);
          expect(notifications).toBe(1);
          expect(history.mock.calls).toHaveLength(clients ? 1 : 0);
          expect(new Set(viewers.flatMap(({ notices }) => notices.map(({ id }) => id))).size).toBe(Number(clients > 0));
          viewers.forEach(({ close }) => close());
          return { historyCount, clients, terminalLists, notifications, historyReads: history.mock.calls.length, results };
        };
        const one = await sample(1, 0);
        const three = await sample(3, 1);
        expect(three.terminalLists).toBe(one.terminalLists);
        expect(three.historyReads).toBe(one.historyReads);
        const closed = await sample(0, 2);
        expect(closed.terminalLists).toBe(one.terminalLists);
        samples.push(one, three, closed);
      } finally {
        sockets.forEach(({ close }) => close());
        try {
          await fixtureCore()?.stop();
        } finally {
          await engine?.shutdown();
          rmSync(dir, { recursive: true, force: true });
        }
      }
    }
    const out = process.env["HUHU_AUTOMATION_COST_OUTPUT"];
    if (out) {
      mkdirSync(path.dirname(out), { recursive: true });
      writeFileSync(out, JSON.stringify({ node: process.version, samples }, null, 2) + "\n");
    }
  } finally {
    tick.mockRestore();
    rpc.mockRestore();
    notify.mockRestore();
    history.mockRestore();
    vi.unstubAllEnvs();
  }
}, 45_000);
