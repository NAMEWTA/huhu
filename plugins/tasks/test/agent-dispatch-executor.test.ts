import { createHash } from "node:crypto";
import type { HuhuApi } from "@huhu/kernel";
import { expect, test, vi } from "vitest";
import { createAgentDispatchExecutor } from "../src/engine/agent-dispatch-executor.js";
import { fingerprint } from "../src/engine/dispatch-store.js";
import type { TaskDispatchWork } from "../src/engine/dispatch.js";

test("the bound input uses the frozen body and requires a matching provider ACK", async () => {
  const call = vi.fn<HuhuApi["call"]>();
  const executor = createAgentDispatchExecutor({ vault: { vaultId: "vault-fixture" }, call }, "machine-fixture");
  const snapshot: TaskDispatchWork["snapshot"] = {
    taskId: "task-fixture",
    expectedVersion: "before",
    taskVersion: "before",
    inputRevision: 1,
    inputHash: "a".repeat(16),
    body: "Frozen body\r\nSecond line",
    references: ["Notes/"],
    execution: { spaceId: "original-space", provider: "claude", model: "opus", effort: "high", fast: true },
    source: { kind: "automation", ruleId: "rule-fixture", ruleVersion: "v1", occurrenceId: "once", instructions: "Frozen supplement\r\nNext line" },
  };
  const work: TaskDispatchWork = {
    eventId: "event-fixture",
    dispatchId: "dispatch-fixture",
    runId: "run-fixture",
    attempt: 1,
    snapshot,
    snapshotHash: fingerprint(snapshot),
    agentTarget: { mode: "new", spaceId: "original-space", spaceRevision: 3, provider: "claude", model: "opus", effort: "high", fast: true, configurationId: "b".repeat(64) },
  };
  const signal = new AbortController().signal;
  const { taskId } = snapshot;
  const { runId, dispatchId, attempt } = work;
  const key = { vaultId: "vault-fixture", taskId, runId, dispatchId, attempt };
  const execution = { ...key, sessionBinding: { machineId: "machine-fixture", sessionId: "session-fixture", coreId: "core-fixture", coreAddress: "t1", processGeneration: "original", provider: "claude", nativeSessionId: null } };
  const input = "Frozen body\nSecond line\n\nFrozen supplement\nNext line";
  const receipt = { status: "accepted", reason: null, acceptedAt: null, execution, ownerActive: true, coreWrite: "core_written" };
  call.mockResolvedValueOnce([{ ...work.agentTarget, binding: null, available: true, reason: null, structuredReply: false, structuredResult: false, cancel: false }]);
  expect(await executor.ready(work, signal)).toEqual({ state: "ready", target: work.agentTarget });
  expect(call).toHaveBeenCalledExactlyOnceWith("agent.targets.list", { vaultId: key.vaultId, machineId: "machine-fixture", spaceId: "original-space", options: { model: "opus", effort: "high", fast: true } }, { signal });
  call.mockClear();
  call.mockResolvedValueOnce({ ...receipt, providerAcceptance: { id: "fixture-ack", execution, inputSha256: "0".repeat(64) } });
  expect(await executor.dispatch(work, signal)).toBe("unknown");
  expect(call).toHaveBeenCalledExactlyOnceWith(
    "agent.runs.dispatch",
    { ...key, machineId: "machine-fixture", input, eventIds: [work.eventId], inputSnapshotRef: work.eventId, inputSnapshotHash: work.snapshotHash, target: work.agentTarget },
    { signal, idempotencyKey: dispatchId },
  );
  expect(snapshot.body).toBe("Frozen body\r\nSecond line");
  call.mockResolvedValueOnce({ ...receipt, providerAcceptance: { id: "fixture-ack", execution, inputSha256: createHash("sha256").update(input).digest("hex") } });
  expect(await executor.inspect(work, signal)).toBe("accepted");
  expect(call).toHaveBeenLastCalledWith("agent.runs.inspect", { ...key, machineId: "machine-fixture" }, { signal });
});
