import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { CapabilityResultSchema, type CapabilityResult } from "@huhu/contracts";
import { assert, expect, test, vi } from "vitest";
import { MailDrafts } from "../src/engine/drafts.js";
import { MAX_DRAFT_ATTACHMENT_BYTES } from "../src/engine/index.js";
import { boot, type RunningEngine } from "./fixtures/engine.js";

function data<T>(result: CapabilityResult<unknown>): T {
  assert(result.ok, JSON.stringify(result));
  return result.data as T;
}

function call(url: string, headers: Record<string, string>, capability: string, input: unknown = {}) {
  return fetch(`${url}/api/v1/call`, {
    method: "POST",
    headers: { ...headers, "content-type": "application/json" },
    body: JSON.stringify({ capability, input, requestId: randomUUID(), idempotencyKey: randomUUID() }),
  }).then(async (response) => CapabilityResultSchema.parse(await response.json()));
}

async function browserSessions(engine: RunningEngine) {
  const desktop = { authorization: `Bearer ${engine.rendererToken}` };
  const url = `http://127.0.0.1:${engine.port}`;
  const { addresses } = data<{ addresses: { url: string }[] }>(await call(url, desktop, "web.share.start", { mode: "local" }));
  const origin = addresses[0]!.url;
  const invitation = data<{ id: string; links: string[] }>(await call(url, desktop, "web.invitations.create"));
  const invite = new URLSearchParams(new URL(invitation.links[0]!).hash.slice(1)).get("invite");
  return {
    origin,
    invitation,
    async join() {
      const response = await fetch(`${origin}/api/v1/session`, { method: "POST", headers: { origin, authorization: `Bearer ${invite}` } });
      expect(response.status).toBe(204);
      const cookie = response.headers.get("set-cookie")?.split(";")[0];
      assert(cookie);
      return {
        call: (name: string, input?: unknown) => call(origin, { origin, cookie }, name, input),
        upload: (handle: string, body: BodyInit, extra: Record<string, string> = {}, signal?: AbortSignal) =>
          fetch(`${origin}/api/v1/mail/attachments/${handle}`, {
            method: "POST",
            headers: { origin, cookie, "content-type": "application/octet-stream", ...extra },
            body,
            ...(signal && { signal }),
          }),
        uploadStream: (handle: string, body: ReadableStream<Uint8Array>) => {
          const streaming: RequestInit & { duplex: "half" } = {
            method: "POST",
            headers: { origin, cookie, "content-type": "application/octet-stream" },
            body,
            duplex: "half",
          };
          return fetch(`${origin}/api/v1/mail/attachments/${handle}`, streaming);
        },
      };
    },
  };
}

test("Web 流上传超过 JSON 上限，句柄限定会话、Vault、用途、时限和已登记字节数", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "huhu-web-mail-"));
  const webAssetsDir = path.join(root, "web");
  mkdirSync(webAssetsDir);
  writeFileSync(path.join(webAssetsDir, "index.html"), "<!doctype html><title>Fixture</title>");
  const vaultPath = path.join(root, "vault");
  const otherVault = path.join(root, "other");
  mkdirSync(vaultPath);
  mkdirSync(otherVault);
  const engines: RunningEngine[] = [];
  try {
    const engine = await boot({ vaultPath, webAssetsDir, create: true });
    engines.push(engine);
    const other = await boot({ vaultPath: otherVault, webAssetsDir, create: true });
    engines.push(other);
    const sharing = await browserSessions(engine);
    const crossVault = await (await browserSessions(other)).join();
    const [owner, stranger] = await Promise.all([sharing.join(), sharing.join()]);
    const draftId = randomUUID();
    const { revision } = data<{ revision: string }>(
      await owner.call("mail.drafts.save", {
        draftId,
        expectedRevision: null,
        draft: { accountId: null, subject: "Synthetic Web draft", to: [], cc: [], bcc: [], body: { type: "doc" } },
      }),
    );
    const bytes = new Uint8Array(9 * 1024 * 1024).fill(0x77);
    const digest = createHash("sha256").update(bytes).digest("hex");
    const begin = "mail.drafts.beginAttachmentUpload";
    const cancel = "mail.drafts.cancelAttachmentUpload";
    const input = { draftId, expectedRevision: revision, name: "fixture.bin", size: bytes.byteLength };
    const beginUpload = async (overrides: Partial<typeof input> = {}) => data<{ handle: string }>(await owner.call(begin, { ...input, ...overrides })).handle;
    expect(await owner.call(begin, { ...input, path: "/etc/hostname" })).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
    expect(await owner.call(begin, { ...input, size: MAX_DRAFT_ATTACHMENT_BYTES + 1 })).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
    expect(await owner.call(begin, { ...input, name: "../fixture.bin" })).toMatchObject({ ok: false });
    expect(await owner.call(cancel, { handle: await beginUpload() })).toMatchObject({ ok: true, data: { cancelled: true } });
    const wrongSize = await beginUpload({ size: 2 });
    expect((await owner.upload(wrongSize, "three")).status).toBe(400);
    expect((await owner.upload(wrongSize, "ok")).status).toBe(404);

    const streaming = await beginUpload({ size: 2 });
    const reading = Promise.withResolvers<void>();
    const realUpload = MailDrafts.prototype.addUploadedAttachment;
    const spy = vi.spyOn(MailDrafts.prototype, "addUploadedAttachment").mockImplementationOnce(function (this: MailDrafts, ...args) {
      reading.resolve();
      return realUpload.apply(this, args);
    });
    const stop = Promise.withResolvers<void>();
    const inFlight = owner
      .uploadStream(
        streaming,
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(Uint8Array.of(1));
          },
          async pull(controller) {
            await stop.promise;
            controller.close();
          },
        }),
      )
      .then(
        (response) => response.status,
        () => "interrupted",
      );
    try {
      await reading.promise;
      expect(await owner.call(cancel, { handle: streaming })).toMatchObject({ ok: true, data: { cancelled: true } });
    } finally {
      stop.resolve();
      spy.mockRestore();
    }
    expect(await inFlight).not.toBe(200);
    expect((await owner.upload(streaming, "ok")).status).toBe(404);

    const temporary = Buffer.from("interrupted before draft commit");
    const temporaryDigest = createHash("sha256").update(temporary).digest("hex");
    const temporaryPath = `.huhu/mail/attachments/${temporaryDigest}`;
    const published = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const originalWrite = engine.vault.files.write.bind(engine.vault.files);
    const write = vi.spyOn(engine.vault.files, "write").mockImplementation(async (...args) => {
      const result = await originalWrite(...args);
      if (args[0] === temporaryPath) {
        published.resolve();
        await release.promise;
      }
      return result;
    });
    const beforeCommit = await beginUpload({ size: temporary.length });
    const interruptedCommit = owner.upload(beforeCommit, temporary);
    try {
      await published.promise;
      expect(await owner.call(cancel, { handle: beforeCommit })).toMatchObject({ ok: true, data: { cancelled: true } });
    } finally {
      release.resolve();
      write.mockRestore();
    }
    expect((await interruptedCommit).status).toBe(400);
    expect(engine.vault.files.read(temporaryPath)).toBeNull();

    const timeout = globalThis.setTimeout;
    const expire = Promise.withResolvers<void>();
    const timer = vi.spyOn(globalThis, "setTimeout").mockImplementation(((fn: () => void, delay?: number, ...args: unknown[]) => {
      if (delay !== 90_000) return timeout(fn, delay, ...args);
      return timeout(() => {
        fn();
        expire.resolve();
      }, 10);
    }) as typeof setTimeout);
    let expired: string;
    try {
      expired = await beginUpload({ size: 1 });
    } finally {
      timer.mockRestore();
    }
    await expire.promise;
    expect((await owner.upload(expired, "x")).status).toBe(404);
    const handle = await beginUpload();
    expect(await stranger.call(cancel, { handle })).toMatchObject({ ok: true, data: { cancelled: false } });
    expect((await stranger.upload(handle, "x")).status).toBe(404);
    expect((await crossVault.upload(handle, "x")).status).toBe(404);
    expect((await owner.upload(handle, "x", { origin: "http://untrusted.example" })).status).toBe(403);
    expect((await owner.upload(handle, "x", { "x-forwarded-for": "127.0.0.1" })).status).toBe(403);
    expect((await owner.upload(handle, "x", { cookie: "" })).status).toBe(401);
    expect((await owner.upload(handle, "x", { "content-type": "application/json" })).status).toBe(415);
    expect(await owner.call("mail.drafts.get", { draftId })).toMatchObject({ ok: true, data: { draft: { revision } } });
    const result = await owner.upload(handle, bytes);
    expect(result.status).toBe(200);
    expect(await result.json()).toMatchObject({ ok: true, data: { status: "attached", draft: { attachments: [{ digest, size: bytes.byteLength, state: "ready" }] } } });
    expect((await owner.upload(handle, "x")).status).toBe(404);
    const managed = ".huhu/mail/attachments";
    expect(readdirSync(path.join(vaultPath, managed))).toEqual([digest]);
    expect(
      createHash("sha256")
        .update(engine.vault.files.read(`${managed}/${digest}`)!.bytes)
        .digest("hex"),
    ).toBe(digest);
    const reopened = await sharing.join();
    const restored = await reopened.call("mail.drafts.get", { draftId });
    expect(restored).toMatchObject({ ok: true, data: { draft: { attachments: [{ digest, name: "fixture.bin", size: bytes.byteLength }] } } });
    const current = data<{ draft: { revision: string } }>(restored).draft;
    expect(await reopened.call("mail.drafts.removeAttachment", { draftId, expectedRevision: current.revision, digest })).toMatchObject({ ok: true, data: { draftId } });
    expect(readdirSync(path.join(vaultPath, managed))).toEqual([]);
  } finally {
    await Promise.all(engines.map((engine) => engine.shutdown()));
    rmSync(root, { recursive: true, force: true });
  }
}, 25_000);
