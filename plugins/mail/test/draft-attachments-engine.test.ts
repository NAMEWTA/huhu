import { createHash, randomUUID } from "node:crypto";
import fs, { createReadStream, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { CapabilityResultSchema } from "@huhu/contracts";
import { importPackage } from "@huhu/vault";
import { assert, expect, test, vi } from "vitest";
import { boot, type RunningEngine } from "../../../apps/engine/src/boot.js";
import { MAIL_DRAFT_ATTACHMENTS_SERVICE, MAX_DRAFT_ATTACHMENT_BYTES, type MailAttachmentSource, type MailDraftAttachments } from "../src/engine/index.js";

const shared = vi.hoisted(() => ({ services: new Map<string, MailDraftAttachments>() }));
vi.mock("@huhu/plugin-mail/engine", async (original) => {
  const mail = await original<typeof import("../src/engine/index.js")>();
  return {
    ...mail,
    apply: ((ctx, api, owner) =>
      mail.apply(
        ctx,
        {
          ...api,
          provide(name, service) {
            api.provide(name, service);
            if (name === mail.MAIL_DRAFT_ATTACHMENTS_SERVICE) shared.services.set(api.vault.files.root, service as MailDraftAttachments);
          },
        },
        owner,
      )) satisfies typeof mail.apply,
  };
});

const testWindows = test.skipIf(process.platform !== "win32" || process.arch !== "x64");
const content = { accountId: null, subject: "合成附件", to: [], cc: [], bcc: [], body: { type: "doc" } };
const draftsFile = ".huhu/mail/drafts.json";
const objects = ".huhu/mail/attachments";
const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

async function fixture(run: (root: string, vaultPath: string, open: (options?: Partial<Parameters<typeof boot>[0]>) => Promise<RunningEngine>) => Promise<void>) {
  const root = mkdtempSync(path.join(tmpdir(), "huhu-mail-attachments-"));
  const vaultPath = path.join(root, "vault");
  const engines: RunningEngine[] = [];
  try {
    mkdirSync(vaultPath);
    await run(root, vaultPath, async (options) => {
      const engine = await boot({ vaultPath, ...options });
      engines.push(engine);
      return engine;
    });
  } finally {
    try {
      await Promise.all(engines.map((engine) => engine.shutdown()));
    } finally {
      shared.services.clear();
      rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 });
      expect(existsSync(root)).toBe(false);
    }
  }
}

function service(engine: RunningEngine): MailDraftAttachments {
  const attachments = shared.services.get(engine.vault.root);
  assert(attachments);
  expect(MAIL_DRAFT_ATTACHMENTS_SERVICE).toBe("mail.draftAttachments");
  return attachments;
}

async function call(engine: RunningEngine, capability: string, input: unknown) {
  const response = await fetch(`http://127.0.0.1:${engine.port}/api/v1/call`, {
    method: "POST",
    headers: { authorization: `Bearer ${engine.rendererToken}`, "content-type": "application/json" },
    body: JSON.stringify({ capability, input, requestId: randomUUID(), idempotencyKey: randomUUID() }),
  });
  expect(response.status).toBe(200);
  return CapabilityResultSchema.parse(await response.json());
}

async function newDraft(engine: RunningEngine) {
  const draftId = randomUUID();
  const result = await call(engine, "mail.drafts.save", { draftId, expectedRevision: null, draft: content });
  assert(result.ok);
  return result.data as { draftId: string; revision: string };
}

function source(name: string, bytes: Buffer): MailAttachmentSource {
  return {
    name,
    size: bytes.length,
    async *read() {
      yield bytes;
    },
  };
}

testWindows(
  "Windows Engine 重开与 ZIP 恢复后按摘要读回独立受管字节，回收遵守共享引用与导出队列",
  async () => {
    await fixture(async (root, vaultPath, open) => {
      let engine = await open({ create: true });
      let managed = service(engine);
      const first = await newDraft(engine);
      const second = await newDraft(engine);
      const bytes = Buffer.from([0, 255, 65, 0, 194, 128]);
      const digest = hash(bytes);
      const firstFile = path.join(root, "first.bin");
      const secondFile = path.join(root, "duplicate.bin");
      writeFileSync(firstFile, bytes);
      writeFileSync(secondFile, bytes);
      const hostRead = vi.fn((file: string, signal: AbortSignal) => createReadStream(file, { signal, highWaterMark: 2 }));
      const fromSelection = (file: string): MailAttachmentSource => ({ name: path.basename(file), size: bytes.length, read: (signal) => hostRead(file, signal) });
      const firstAdded = await managed.addAttachment({ draftId: first.draftId, expectedRevision: first.revision }, fromSelection(firstFile));
      const firstRef = { digest, name: "first.bin", size: bytes.length, state: "ready" };
      expect(firstAdded).toMatchObject({ deduped: false, draft: { attachments: [firstRef] } });
      expect(firstAdded.draft.revision).not.toBe(first.revision);
      const duplicate = await managed.addAttachment({ draftId: first.draftId, expectedRevision: firstAdded.draft.revision }, fromSelection(secondFile));
      expect(duplicate).toEqual({ draft: firstAdded.draft, deduped: true });
      const secondAdded = await managed.addAttachment({ draftId: second.draftId, expectedRevision: second.revision }, fromSelection(secondFile));
      expect(secondAdded).toMatchObject({ deduped: false, draft: { attachments: [{ ...firstRef, name: "duplicate.bin" }] } });
      expect(hostRead).toHaveBeenCalledTimes(3);
      expect(readdirSync(path.join(vaultPath, objects))).toEqual([digest]);
      const otherBytes = Buffer.from("same name with different bytes");
      const otherDigest = hash(otherBytes);
      const withOther = await managed.addAttachment({ draftId: first.draftId, expectedRevision: firstAdded.draft.revision }, source("first.bin", otherBytes));
      expect(withOther.draft.attachments?.map((ref) => ref.digest)).toEqual([digest, otherDigest]);
      renameSync(firstFile, `${firstFile}.moved`);
      rmSync(secondFile);
      const beforeClose = await call(engine, "mail.drafts.save", { draftId: first.draftId, expectedRevision: withOther.draft.revision, draft: { ...content, subject: "保留附件" } });
      assert(beforeClose.ok);
      await engine.shutdown();
      expect(() => managed.readAttachment({ draftId: first.draftId, digest })).toThrow();
      engine = await open();
      managed = service(engine);
      expect(await call(engine, "mail.drafts.get", { draftId: first.draftId })).toEqual({ ok: true, data: { draft: beforeClose.data } });
      expect(managed.readAttachment({ draftId: first.draftId, digest })).toEqual({ ...firstRef, bytes });
      expect(hostRead).toHaveBeenCalledTimes(3);

      const archive = path.join(root, "fixture.zip");
      const destination = path.join(root, "restored");
      const started = Promise.withResolvers<void>();
      const release = Promise.withResolvers<void>();
      const snapshot = managed.withSnapshot;
      const guarded = vi.spyOn(managed, "withSnapshot").mockImplementation(<T>(read: (signal: AbortSignal) => Promise<T>, requestSignal?: AbortSignal) =>
        snapshot(async (signal) => {
          started.resolve();
          await release.promise;
          return read(signal);
        }, requestSignal),
      );
      const exportInput = { dest: archive, includeAttachments: false };
      expect(await engine.dispatcher.call("web:fixture", { capability: "vault.exportPackage", input: exportInput, requestId: randomUUID(), idempotencyKey: randomUUID() })).toMatchObject({
        ok: false,
        error: { code: "PERMISSION_DENIED" },
      });
      const exported = call(engine, "vault.exportPackage", exportInput);
      await Promise.race([
        started.promise,
        exported.then(() => {
          throw new Error("桌面数据包导出未取得 Mail 快照");
        }),
      ]);
      const revision = (beforeClose.data as { revision: string }).revision;
      const removeInput = { draftId: first.draftId, expectedRevision: revision, digest };
      for (const caller of ["web:fixture", "cli"] as const) {
        expect(await engine.dispatcher.call(caller, { capability: "mail.drafts.removeAttachment", input: removeInput, requestId: randomUUID(), idempotencyKey: randomUUID() })).toMatchObject({
          ok: false,
          error: { code: caller === "cli" ? "CAPABILITY_NOT_EXPOSED" : "PERMISSION_DENIED" },
        });
      }
      expect(await call(engine, "mail.drafts.removeAttachment", { ...removeInput, path: firstFile })).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
      const removing = call(engine, "mail.drafts.removeAttachment", removeInput);
      const sweeping = managed.sweepUnreferenced();
      let settled = false;
      void sweeping.then(() => {
        settled = true;
      });
      await new Promise((resolve) => setImmediate(resolve));
      release.resolve();
      guarded.mockRestore();
      expect(settled).toBe(false);
      const exportedZip = await exported;
      expect(exportedZip).toMatchObject({ ok: true, data: { path: archive, sha256: hash(readFileSync(archive)), vaultId: engine.vault.id } });
      expect(await removing).toMatchObject({ ok: true, data: { attachments: [{ digest: otherDigest }] } });
      expect(await call(engine, "mail.drafts.removeAttachment", removeInput)).toMatchObject({ ok: false, error: { code: "VERSION_CONFLICT" } });
      expect(await sweeping).toEqual({ removed: [], failed: [] });
      expect(importPackage(archive, destination).vaultId).toBe(engine.vault.id);
      const restored = await open({ vaultPath: destination, readOnly: true });
      const restoredAttachments = service(restored);
      expect(await call(restored, "mail.drafts.get", { draftId: first.draftId })).toEqual({ ok: true, data: { draft: beforeClose.data } });
      expect(restoredAttachments.readAttachment({ draftId: first.draftId, digest })).toEqual({ ...firstRef, bytes });
      await expect(restoredAttachments.addAttachment({ draftId: first.draftId, expectedRevision: revision }, source("a.bin", bytes))).rejects.toMatchObject({ code: "READ_ONLY_VAULT" });
      expect(await call(restored, "mail.drafts.removeAttachment", removeInput)).toMatchObject({ ok: false, error: { code: "READ_ONLY_VAULT" } });
      expect(() => restoredAttachments.sweepUnreferenced()).toThrow(expect.objectContaining({ code: "READ_ONLY_VAULT" }));
      expect(() => managed.readAttachment({ draftId: first.draftId, digest })).toThrow(expect.objectContaining({ code: "NOT_FOUND" }));
      expect(managed.readAttachment({ draftId: second.draftId, digest })).toMatchObject({ state: "ready", bytes });

      expect(await call(engine, "mail.drafts.discard", { draftId: second.draftId, expectedRevision: secondAdded.draft.revision })).toMatchObject({ ok: true });
      expect(await managed.sweepUnreferenced()).toEqual({ removed: [digest], failed: [] });
      expect(readdirSync(path.join(vaultPath, objects))).toEqual([otherDigest]);
    });
  },
  120_000,
);

testWindows(
  "Windows Engine 报告丢失、损坏、超限与中断，失败保全草稿和已提交字节",
  async () => {
    await fixture(async (root, vaultPath, open) => {
      const engine = await open({ create: true });
      const managed = service(engine);
      const initial = await newDraft(engine);
      const good = Buffer.from("valid attachment bytes");
      const digest = hash(good);
      const attached = await managed.addAttachment({ draftId: initial.draftId, expectedRevision: initial.revision }, source("keep.bin", good));
      const input = { draftId: initial.draftId, expectedRevision: attached.draft.revision };
      const snapshot = path.join(vaultPath, draftsFile);
      const blob = path.join(vaultPath, objects, digest);
      const original = readFileSync(snapshot);
      const assertUnchanged = () => {
        expect(readFileSync(snapshot)).toEqual(original);
        expect(readFileSync(blob)).toEqual(good);
        expect(readdirSync(path.join(vaultPath, objects))).toEqual([digest]);
      };
      const neverRead = vi.fn(source("over.bin", Buffer.alloc(0)).read);
      await expect(managed.addAttachment(input, { name: "over.bin", size: MAX_DRAFT_ATTACHMENT_BYTES + 1, read: neverRead })).rejects.toMatchObject({ details: { reason: "attachment-too-large", maxBytes: MAX_DRAFT_ATTACHMENT_BYTES } });
      expect(neverRead).not.toHaveBeenCalled();
      const notChosen = new AbortController();
      notChosen.abort();
      await expect(managed.addAttachment(input, { name: "cancelled.bin", size: 0, read: neverRead }, notChosen.signal)).rejects.toMatchObject({ details: { reason: "attachment-import-interrupted" } });
      expect(neverRead).not.toHaveBeenCalled();
      await expect(managed.addAttachment(input, { name: "absent.bin", size: 2, read: (signal) => createReadStream(path.join(root, "absent.bin"), { signal }) })).rejects.toMatchObject({
        code: "NOT_FOUND",
        details: { reason: "attachment-source-missing" },
      });
      const abort = new AbortController();
      await expect(
        managed.addAttachment(
          input,
          {
            name: "cancel.bin",
            size: 4,
            async *read() {
              yield Buffer.from([1, 2]);
              abort.abort();
              yield Buffer.from([3, 4]);
            },
          },
          abort.signal,
        ),
      ).rejects.toMatchObject({ details: { reason: "attachment-import-interrupted" } });
      await expect(managed.addAttachment(input, { ...source("short.bin", Buffer.from([1])), size: 2 })).rejects.toMatchObject({ details: { reason: "attachment-import-interrupted", receivedBytes: 1, expectedBytes: 2 } });
      await expect(managed.addAttachment(input, { ...source("grown.bin", Buffer.from([1, 2])), size: 1 })).rejects.toMatchObject({ details: { reason: "attachment-size-mismatch" } });
      assertUnchanged();

      const candidate = Buffer.from("new bytes during interrupted commit");
      const candidateDigest = hash(candidate);
      const candidateBlob = path.join(vaultPath, objects, candidateDigest);
      const atomicRename = fs.rename;
      let failTarget = candidateBlob;
      const failure = vi.spyOn(fs, "rename").mockImplementation((from, to, callback) => {
        if (to !== failTarget) return atomicRename(from, to, callback);
        expect(existsSync(from)).toBe(true);
        callback(Object.assign(new Error("synthetic atomic failure"), { code: "EIO" }));
      });
      try {
        await expect(managed.addAttachment(input, source("fail.bin", candidate))).rejects.toMatchObject({ details: { reason: "attachment-write-failed", digest: candidateDigest } });
        assertUnchanged();
        failTarget = snapshot;
        await expect(managed.addAttachment(input, source("fail.bin", candidate))).rejects.toMatchObject({ details: { reason: "draft-write-failed" } });
        expect(readFileSync(snapshot)).toEqual(original);
        expect(readFileSync(blob)).toEqual(good);
        expect(await call(engine, "mail.drafts.get", { draftId: initial.draftId })).toEqual({ ok: true, data: { draft: attached.draft } });
        expect(() => managed.readAttachment({ draftId: initial.draftId, digest: candidateDigest })).toThrow(expect.objectContaining({ code: "NOT_FOUND" }));
        expect(readFileSync(candidateBlob)).toEqual(candidate);
        expect(await managed.sweepUnreferenced()).toEqual({ removed: [candidateDigest], failed: [] });
        assertUnchanged();
      } finally {
        failure.mockRestore();
      }

      renameSync(snapshot, `${snapshot}.moved`);
      try {
        expect(await managed.sweepUnreferenced()).toEqual({ removed: [], failed: [] });
        expect(readFileSync(blob)).toEqual(good);
      } finally {
        renameSync(`${snapshot}.moved`, snapshot);
      }

      rmSync(blob);
      expect(managed.readAttachment({ draftId: initial.draftId, digest })).toMatchObject({ state: "missing" });
      expect(await call(engine, "mail.drafts.get", { draftId: initial.draftId })).toMatchObject({ ok: true, data: { draft: { revision: input.expectedRevision, attachments: [{ digest, state: "missing" }] } } });
      writeFileSync(blob, Buffer.alloc(good.length, 1));
      expect(managed.readAttachment({ draftId: initial.draftId, digest })).toMatchObject({ state: "corrupt" });
      expect(await call(engine, "mail.drafts.get", { draftId: initial.draftId })).toMatchObject({ ok: true, data: { draft: { revision: input.expectedRevision, attachments: [{ digest, state: "corrupt" }] } } });
      expect(await managed.addAttachment(input, source("repair.bin", good))).toEqual({ deduped: true, draft: attached.draft });
      assertUnchanged();
    });
  },
  120_000,
);

testWindows(
  "Windows Engine 草稿正文和附件共用条件写，败者不打开源且 RPC 拒绝路径与伪造引用",
  async () => {
    await fixture(async (_root, vaultPath, open) => {
      const engine = await open({ create: true });
      const managed = service(engine);
      const initial = await newDraft(engine);
      const input = { draftId: initial.draftId, expectedRevision: initial.revision };
      const readyToRace = Promise.withResolvers<void>();
      const release = Promise.withResolvers<void>();
      const bytes = Buffer.from("winner");
      const digest = hash(bytes);
      const attach = managed.addAttachment(input, {
        name: "winner.bin",
        size: bytes.length,
        async *read() {
          readyToRace.resolve();
          await release.promise;
          yield bytes;
        },
      });
      await readyToRace.promise;
      const other = source("other.bin", Buffer.from("other"));
      const otherRead = vi.fn(other.read);
      const second = managed.addAttachment(input, { ...other, read: otherRead });
      const settledSecond = second.catch((error) => error);
      const textEdit = call(engine, "mail.drafts.save", { ...input, draft: { ...content, subject: "stale" } });
      release.resolve();
      const winner = await attach;
      const conflict = { code: "VERSION_CONFLICT", details: { currentVersion: winner.draft.revision } };
      expect(await settledSecond).toMatchObject(conflict);
      expect(await textEdit).toMatchObject({ ok: false, error: conflict });
      await expect(managed.removeAttachment({ ...input, digest })).rejects.toMatchObject(conflict);
      expect(otherRead).not.toHaveBeenCalled();
      expect(readdirSync(path.join(vaultPath, objects))).toEqual([digest]);
      expect(await call(engine, "mail.drafts.save", { draftId: input.draftId, expectedRevision: winner.draft.revision, draft: { ...content, attachments: [{ digest, path: "C:\\fake.bin" }] } })).toMatchObject({
        ok: false,
        error: { code: "INVALID_INPUT" },
      });
      expect(await call(engine, "mail.drafts.addAttachment", { ...input, path: "C:\\fake.bin" })).toMatchObject({ ok: false, error: { code: "CAPABILITY_NOT_FOUND" } });
      expect(await call(engine, "vault.readBinary", { path: `${objects}/${digest}` })).toMatchObject({ ok: false, error: { code: "PERMISSION_DENIED" } });
      expect(await call(engine, "mail.drafts.get", { draftId: input.draftId })).toEqual({ ok: true, data: { draft: winner.draft } });

      const reading = Promise.withResolvers<void>();
      let closedSource = false;
      const running = managed.addAttachment(
        { ...input, expectedRevision: winner.draft.revision },
        {
          name: "closing.bin",
          size: 1,
          async *read(signal) {
            try {
              await new Promise<void>((resolve) => {
                signal.addEventListener("abort", () => resolve(), { once: true });
                reading.resolve();
              });
              await new Promise((resolve) => setImmediate(resolve));
              yield Buffer.from([1]);
            } finally {
              closedSource = true;
            }
          },
        },
      );
      const stopped = running.catch((error) => error);
      await reading.promise;
      await engine.shutdown();
      expect(closedSource).toBe(true);
      expect(await stopped).toMatchObject({ details: { reason: "attachment-import-interrupted" } });
      const reopened = await open();
      expect(await call(reopened, "mail.drafts.get", { draftId: input.draftId })).toEqual({ ok: true, data: { draft: winner.draft } });
      expect(readdirSync(path.join(vaultPath, objects))).toEqual([digest]);
    });
  },
  120_000,
);
