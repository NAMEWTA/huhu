import { openMcpSession } from "../../../packages/kernel/test/fixtures/mcp-http.js";
import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { CapabilityResultSchema } from "@huhu/contracts";
import { exportPackage, importPackage } from "@huhu/vault";
import { assert, expect, test } from "vitest";
import { boot, type RunningEngine } from "../../../apps/engine/src/boot.js";
import type { MailAiApproval } from "../src/engine/ai-settings.js";
import { TestProtection } from "../../../packages/kernel/test/fixtures/credentials.js";
import { aiFixture } from "./fixtures/ai.js";

test("邮件 AI 仅使用当次确认，拒绝重放、换 Vault 和旧目的地，且取消中止在途响应", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "huhu-mail-ai-selection-"));
  const vaultPath = path.join(root, "original");
  const desktopUserData = path.join(root, "user-data");
  mkdirSync(vaultPath);
  mkdirSync(desktopUserData);
  const first = await aiFixture();
  const second = await aiFixture();
  const hold = Promise.withResolvers<void>();
  const moduleCredentialProtection = new TestProtection(desktopUserData);
  const engine = await boot({
    vaultPath,
    desktopUserData,
    moduleCredentialProtection,
    create: true,
  });
  let restored: RunningEngine | undefined;
  const prepare = "mail.ai.prepare";
  const chat = "mail.ai.chat";
  const excerpt = "  Only this synthetic excerpt.\nKeep these line breaks.  ";
  const input = {
    approvalId: randomUUID(),
    confirmed: true,
    mode: "summary",
    excerpt,
  };
  const resultText = "<svg onload=alert(1)>仅作为文字返回</svg>";
  first.behavior.toolCalls = [
    {
      type: "function",
      function: { name: "mail.outbox.submit", arguments: "{}" },
    },
  ];

  async function call(capability: string, input: unknown = {}, { client = engine, token = client.rendererToken, signal, session }: { client?: RunningEngine; token?: string; signal?: AbortSignal; session?: string } = {}) {
    const response = await fetch(`http://127.0.0.1:${client.port}/api/v1/call`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        ...(session && { "mcp-session-id": session }),
        "content-type": "application/json",
      },
      body: JSON.stringify({
        capability,
        input,
        requestId: randomUUID(),
        idempotencyKey: randomUUID(),
      }),
      ...(signal && { signal }),
    });
    expect(response.headers.get("cache-control")).toBe("no-store");
    return CapabilityResultSchema.parse(await response.json());
  }
  async function data<T>(capability: string, input?: unknown): Promise<T> {
    const result = await call(capability, input);
    assert(result.ok, result.ok ? undefined : result.error.message);
    return result.data as T;
  }

  try {
    expect(await call(prepare)).toMatchObject({ ok: false });
    expect(await call(chat, input)).toMatchObject({ ok: false });
    expect(first.requests).toHaveLength(0);
    const save = "mail.ai.saveSettings";
    const settings = {
      expectedRevision: null,
      enabled: true,
      endpoint: first.url,
      model: "model-a",
    };
    const initial = await data<{ revision: string }>(save, settings);
    expect(first.requests).toHaveLength(1);
    await data("gateway.mcp.update", { enabled: true, transport: "stdio" });
    const session = await openMcpSession(`http://127.0.0.1:${engine.port}/api/v1/mcp`, engine.mcpToken);
    expect(await call(prepare, {}, { token: engine.mcpToken, session })).toMatchObject({
      ok: false,
      error: { code: "CAPABILITY_NOT_EXPOSED" },
    });
    const approval = await data<MailAiApproval>(prepare);
    expect(approval).toMatchObject({
      endpoint: `${first.url}/chat/completions`,
      model: "model-a",
    });
    const approved = { ...input, approvalId: approval.approvalId };
    expect(await call(chat, { ...approved, confirmed: false })).toMatchObject({
      ok: false,
    });
    expect(await call(chat, { ...approved, excerpt: "   " })).toMatchObject({
      ok: false,
    });
    expect(first.requests).toHaveLength(1);
    first.behavior.text = resultText;
    expect(await call(chat, approved)).toEqual({
      ok: true,
      data: { text: resultText },
    });
    expect(await call(chat, approved)).toMatchObject({ ok: false });
    expect(first.requests[1]).toEqual({
      path: "/v1/chat/completions",
      authorization: undefined,
      body: {
        model: "model-a",
        stream: false,
        messages: [
          { role: "system", content: expect.stringContaining("总结") },
          { role: "user", content: excerpt },
        ],
      },
    });
    expect(await data("mail.outbox.list")).toEqual({ operations: [] });
    expect(await data("mail.drafts.list")).toEqual({ drafts: [] });

    const next = await data<MailAiApproval>(prepare);
    const packagePath = path.join(root, "vault.zip");
    const restoredPath = path.join(root, "restored");
    await exportPackage(vaultPath, packagePath);
    importPackage(packagePath, restoredPath);
    restored = await boot({
      vaultPath: restoredPath,
      desktopUserData,
      moduleCredentialProtection,
    });
    expect(restored.vault.id).toBe(engine.vault.id);
    expect(await call(chat, { ...input, approvalId: next.approvalId }, { client: restored })).toMatchObject({ ok: false });
    expect(first.requests).toHaveLength(2);

    const replacement = await data<{ revision: string }>(save, {
      ...settings,
      expectedRevision: initial.revision,
      endpoint: second.url,
      model: "model-b",
    });
    expect(await call(chat, { ...input, approvalId: next.approvalId })).toMatchObject({ ok: false });
    expect(first.requests).toHaveLength(2);
    expect(second.requests).toHaveLength(1);

    const ready = await data<MailAiApproval>(prepare);
    const question = " Which task is described? ";
    second.behavior.wait = hold.promise;
    const controller = new AbortController();
    const waiting = call(chat, { ...input, approvalId: ready.approvalId, mode: "chat", question }, { signal: controller.signal });
    const canceled = expect(waiting).rejects.toMatchObject({
      name: "AbortError",
    });
    await expect.poll(() => second.requests.length).toBe(2);
    controller.abort();
    await canceled;
    await expect.poll(() => second.interrupted, { timeout: 4_000 }).toBe(1);
    expect(second.requests[1]?.body).toEqual({
      model: "model-b",
      stream: false,
      messages: [
        { role: "system", content: expect.stringContaining("回答") },
        { role: "user", content: excerpt },
        { role: "user", content: question },
      ],
    });
    hold.resolve();
    delete second.behavior.wait;
    await data(save, {
      ...settings,
      expectedRevision: replacement.revision,
      endpoint: second.url,
      enabled: false,
    });
    expect(await call(prepare)).toMatchObject({ ok: false });
    expect(second.requests).toHaveLength(2);
    for (const file of readdirSync(engine.vault.runtimeDir, {
      recursive: true,
      withFileTypes: true,
    }).filter((file) => file.isFile())) {
      const bytes = readFileSync(path.join(file.parentPath, file.name));
      expect(bytes.includes("Only this synthetic excerpt.")).toBe(false);
      expect(bytes.includes("Which task is described?")).toBe(false);
    }
  } finally {
    hold.resolve();
    await Promise.all([first.close(), second.close(), restored?.shutdown(), engine.shutdown()]);
    rmSync(root, { recursive: true, force: true, maxRetries: 5 });
  }
}, 25_000);
