import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { OperationReceipts, type CapabilityContext } from "@huhu/kernel";
import { expect, test, vi } from "vitest";
import { mailIntents } from "../src/engine/tool-intents.js";

const context: CapabilityContext = { caller: "http", subject: "original-session", signal: new AbortController().signal, requestId: "transport-request" };
const name = "mail.ai.chat";
const key = "fixture-mail-intent";
const input = { text: "synthetic selection for a single send" };

test("Mail 回执合并同一主体的在途操作，重启只回放安全投影", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "huhu-mail-intent-"));
  const file = path.join(root, "receipts.ndjson");
  try {
    const deferred = Promise.withResolvers<{ state: "completed"; text?: string }>();
    const apply = vi.fn(() => deferred.promise);
    const project = () => ({ state: "completed" as const });
    const replay = (receipt: ReturnType<typeof project>) => receipt;
    const once = mailIntents(new OperationReceipts(file));
    const first = once(context, name, key, input, apply, project, replay);
    const concurrent = once({ ...context, requestId: "other-transport-request" }, name, key, input, apply, project, replay);
    await expect(once(context, name, key, { text: "different selection" }, apply, project, replay)).rejects.toMatchObject({ code: "IDEMPOTENCY_MISMATCH" });
    const result = { state: "completed" as const, text: "synthetic confidential result" };
    deferred.resolve(result);
    await expect(first).resolves.toEqual(result);
    await expect(concurrent).resolves.toEqual(result);
    const fresh = mailIntents(new OperationReceipts(file));
    await expect(fresh(context, name, key, input, apply, project, replay)).resolves.toEqual({ state: "completed" });
    expect(apply).toHaveBeenCalledOnce();
    const persisted = readFileSync(file, "utf8");
    for (const secret of [result.text, input.text, context.subject]) expect(persisted).not.toContain(secret);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("Mail 回执遇到已受理但未完成的效果时只回报未知", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "huhu-mail-intent-unknown-"));
  const file = path.join(root, "receipts.ndjson");
  try {
    const apply = vi.fn(async () => {
      throw new Error("deliberate missing acknowledgement");
    });
    const project = () => ({});
    const replay = () => {
      throw new Error("unexpected replay");
    };
    await expect(mailIntents(new OperationReceipts(file))(context, name, key, input, apply, project, replay)).rejects.toThrow("deliberate missing acknowledgement");
    await expect(mailIntents(new OperationReceipts(file))(context, name, key, input, apply, project, replay)).rejects.toMatchObject({ code: "RUN_UNKNOWN", details: { outcome: "unknown" } });
    expect(apply).toHaveBeenCalledOnce();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
