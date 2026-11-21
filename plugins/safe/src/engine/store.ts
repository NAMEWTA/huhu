import { createHash, randomUUID } from "node:crypto";
import { lstatSync, mkdirSync, mkdtempSync, readdirSync, renameSync, rmdirSync, rmSync } from "node:fs";
import path from "node:path";
import { HuhuError, errors } from "@huhu/contracts";
import type { HuhuApi } from "@huhu/kernel";
import { z } from "zod";
import { KDF_PARAMS, isSealedSize, open, seal } from "./crypto.js";
import { StoredEntry, TagDirectory, type Tag, type TagFields } from "./personal.js";

export const SAFE_FORMAT = 1;
const KEYRING = "keyring.json";
const MANIFEST = "manifest.json";
const STAGED_ENTRY = "entry.bin";
export const AUTO_LOCK_MINUTES = [1, 5, 15, 30] as const;

function base64(value: string): Buffer | null {
  const bytes = Buffer.from(value, "base64");
  return bytes.toString("base64") === value ? bytes : null;
}

function sealedSize(value: string, size: number): boolean {
  const bytes = base64(value);
  return bytes !== null && isSealedSize(bytes, size);
}

const Kdf = z
  .strictObject({
    name: z.literal("scrypt"),
    N: z
      .number()
      .int()
      .min(2)
      .max(KDF_PARAMS.N)
      .refine((n) => (n & (n - 1)) === 0),
    r: z.number().int().min(1).max(32),
    p: z.number().int().min(1).max(4),
    salt: z.string().refine((s) => base64(s)?.length === 16),
  })
  .refine(({ N, r }) => N * r <= KDF_PARAMS.N * KDF_PARAMS.r);
const Ring = z.strictObject({
  kdf: Kdf,
  wrappedKey: z.string().refine((s) => sealedSize(s, 32)),
  keyCheck: z.string().refine((s) => base64(s)?.length === 32),
  createdAt: z.iso.datetime(),
  autoLockMinutes: z.number().refine((n) => AUTO_LOCK_MINUTES.some((minutes) => minutes === n)),
  lockOnLeave: z.boolean(),
});
const CurrentRing = Ring.extend({ format: z.literal(SAFE_FORMAT), vaultKeyId: z.uuid() });
const Digest = z.string().regex(/^[0-9a-f]{64}$/);
const StoredRing = CurrentRing.extend({ checksum: Digest });
const Manifest = z.strictObject({
  format: z.literal(SAFE_FORMAT),
  vaultKeyId: z.uuid(),
  revision: z.int().nonnegative(),
  entries: z.record(z.uuid(), z.int().positive()),
  tags: z.int().positive().nullable(),
});
const StoredManifest = Manifest.extend({ authentication: z.string().refine((s) => sealedSize(s, 0)), checksum: Digest });

export type SafeFiles = Pick<HuhuApi["vault"]["files"], "root" | "readOnly" | "abs" | "read" | "write" | "assertWritable">;
export type Keyring = z.infer<typeof Ring> | z.infer<typeof CurrentRing>;
export type LoadedSafe = {
  ring: Keyring;
  file: string;
  version: string;
  manifest?: z.infer<typeof StoredManifest>;
};
export type CurrentSafe = LoadedSafe & { manifest: z.infer<typeof StoredManifest> };
export type EntryPrecondition = { kind: "create" | "update"; expectedRevision: number };
type SafeState = { kind: "empty" } | { kind: "corrupt"; file: typeof KEYRING | typeof MANIFEST } | ({ kind: "ready" } & LoadedSafe);
type EntryDraft = Omit<StoredEntry, "revision">;
type PendingFile = { name: string; destination: string; bytes: Buffer };

export function corruptStore(file: string): HuhuError {
  return new HuhuError("INTERNAL", `${file} 文件缺失或损坏，保险箱不可用`, { retryable: false });
}

export function wrappingContext(ring: Keyring | Pick<z.infer<typeof CurrentRing>, "format" | "vaultKeyId">): string {
  return "format" in ring ? `huhu-safe/v${ring.format}/${ring.vaultKeyId}/dk` : "huhu-safe/dk";
}

function manifestContext(manifest: z.infer<typeof Manifest>): string {
  return `huhu-safe/v${manifest.format}/${manifest.vaultKeyId}/manifest:${JSON.stringify(manifest)}`;
}

export function authenticateManifest(store: LoadedSafe, dk: Buffer): void {
  if (!store.manifest) return;
  const { authentication, checksum: _, ...manifest } = store.manifest;
  try {
    open(dk, Buffer.from(authentication, "base64"), manifestContext(manifest));
  } catch {
    throw corruptStore(MANIFEST);
  }
}

function checksum(payload: object): string {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

function encode(payload: object): Buffer {
  return Buffer.from(JSON.stringify(payload, null, 2) + "\n");
}

function encodeRing(ring: Keyring): Buffer {
  return encode("format" in ring ? { ...ring, checksum: checksum(CurrentRing.parse(ring)) } : ring);
}

function encodeManifest(manifest: z.infer<typeof Manifest>, dk: Buffer): Buffer {
  const payload = { ...manifest, authentication: seal(dk, Buffer.alloc(0), manifestContext(manifest)).toString("base64") };
  return encode({ ...payload, checksum: checksum(payload) });
}

function entryContext(manifest: CurrentSafe["manifest"], id: string, revision: number): string {
  return `huhu-safe/v${manifest.format}/${manifest.vaultKeyId}/entry:${id}:${revision}`;
}

function tagsContext(manifest: CurrentSafe["manifest"], revision: number): string {
  return `huhu-safe/v${manifest.format}/${manifest.vaultKeyId}/tags:${revision}`;
}

function sealJson(dk: Buffer, payload: object, context: string): Buffer {
  const cleartext = Buffer.from(JSON.stringify(payload));
  try {
    return seal(dk, cleartext, context);
  } finally {
    cleartext.fill(0);
  }
}

function entryAt(file: string) {
  return lstatSync(file, { throwIfNoEntry: false });
}

const pendingSafeIo = new WeakMap<SafeFiles, Promise<void>>();

function withSafeSnapshot<T>(files: SafeFiles, operation: () => Promise<T>): Promise<T> {
  const committed = (pendingSafeIo.get(files) ?? Promise.resolve()).then(operation);
  const tail = committed.then(
    () => undefined,
    () => undefined,
  );
  pendingSafeIo.set(files, tail);
  void tail.then(() => {
    if (pendingSafeIo.get(files) === tail) pendingSafeIo.delete(files);
  });
  return committed;
}

export function withSafePackageSnapshot<T>(files: SafeFiles, read: (required: ReadonlyMap<string, string>) => Promise<T>): Promise<T> {
  return withSafeSnapshot(files, () => read(new SafeStore(files, path.join(files.root, ".huhu", "safe")).packageFiles()));
}

export class SafeStore {
  private readonly relativeDir: string;

  constructor(
    private readonly files: SafeFiles,
    dir: string,
  ) {
    this.relativeDir = path.relative(files.root, dir).split(path.sep).join("/");
  }

  load(): SafeState {
    let checkedFile: typeof KEYRING | typeof MANIFEST = KEYRING;
    try {
      const dir = this.files.abs(this.relativeDir);
      const stat = entryAt(dir);
      if (!stat) return { kind: "empty" };
      if (!stat.isDirectory()) return { kind: "corrupt", file: KEYRING };
      const current = entryAt(path.join(dir, "current"));
      const legacyRing = entryAt(path.join(dir, KEYRING));
      if (entryAt(path.join(dir, MANIFEST))) return { kind: "corrupt", file: MANIFEST };
      if (!current && !legacyRing) {
        return readdirSync(dir).length === 0 ? { kind: "empty" } : { kind: "corrupt", file: KEYRING };
      }
      if (current && (!current.isDirectory() || legacyRing)) return { kind: "corrupt", file: KEYRING };
      const base = current ? `${this.relativeDir}/current` : this.relativeDir;
      const file = `${base}/${KEYRING}`;
      const storedRing = this.readJson(file);
      if (!current) return { kind: "ready", ring: Ring.parse(storedRing.value), version: storedRing.version, file };
      const { checksum: digest, ...ring } = StoredRing.parse(storedRing.value);
      if (digest !== checksum(ring)) return { kind: "corrupt", file: KEYRING };
      checkedFile = MANIFEST;
      const manifest = StoredManifest.parse(this.readJson(`${base}/${MANIFEST}`).value);
      const { checksum: manifestDigest, ...payload } = manifest;
      if (manifest.vaultKeyId !== ring.vaultKeyId || manifestDigest !== checksum(payload)) return { kind: "corrupt", file: MANIFEST };
      return { kind: "ready", ring, manifest, version: storedRing.version, file };
    } catch {
      return { kind: "corrupt", file: checkedFile };
    }
  }

  private readJson(file: string): { value: unknown; version: string } {
    if (!entryAt(this.files.abs(file))?.isFile()) throw new Error("Missing Safe file");
    const stored = this.files.read(file);
    if (!stored) throw new Error("Missing Safe file");
    return { value: JSON.parse(stored.bytes.toString("utf8")) as unknown, version: stored.version };
  }

  async initialize(ring: z.infer<typeof CurrentRing>, dk: Buffer, guard: () => void): Promise<void> {
    const manifest = { format: SAFE_FORMAT, vaultKeyId: ring.vaultKeyId, revision: 0, entries: {}, tags: null } as const;
    const manifestBytes = encodeManifest(manifest, dk);
    await this.enqueue(() =>
      this.stage(async (dir) => {
        guard();
        await this.files.write(`${dir}/${KEYRING}`, encodeRing(ring), { expectedVersion: null });
        guard();
        await this.files.write(`${dir}/${MANIFEST}`, manifestBytes, { expectedVersion: null });
        guard();
        const state = this.load();
        if (state.kind === "corrupt") throw corruptStore(state.file);
        if (state.kind === "ready") throw errors.invalidInput("保险箱已经设置过");
        const destination = this.files.abs(`${this.relativeDir}/current`);
        mkdirSync(path.dirname(destination), { recursive: true });
        // One rename publishes both files. There is no await between checking the session and publishing.
        renameSync(this.files.abs(dir), destination);
      }),
    );
  }

  async replaceRing(previous: LoadedSafe, ring: Keyring, guard: () => void): Promise<void> {
    await this.enqueue(() =>
      this.stage(async (dir) => {
        guard();
        await this.files.write(`${dir}/${KEYRING}`, encodeRing(ring), { expectedVersion: null });
        guard();
        this.assertVersion(previous);
        renameSync(this.files.abs(`${dir}/${KEYRING}`), this.files.abs(previous.file));
      }),
    );
  }

  readEntry(store: CurrentSafe, dk: Buffer, entryId: string): StoredEntry {
    const revision = store.manifest.entries[entryId];
    if (revision === undefined) throw errors.notFound("条目不存在");
    try {
      const file = this.entryFile(entryId, revision);
      const entry = entryAt(this.files.abs(file))?.isFile() ? this.files.read(file) : null;
      if (!entry) throw corruptStore("条目密文");
      const cleartext = open(dk, entry.bytes, entryContext(store.manifest, entryId, revision));
      try {
        const data = StoredEntry.parse(JSON.parse(cleartext.toString("utf8")) as unknown);
        if (data.entryId !== entryId || data.revision !== revision || new Set(data.accounts.map((account) => account.accountId)).size !== data.accounts.length) throw corruptStore("条目密文");
        return data;
      } finally {
        cleartext.fill(0);
      }
    } catch {
      throw corruptStore("条目密文");
    }
  }

  readTags(store: CurrentSafe, dk: Buffer): Tag[] {
    const revision = store.manifest.tags;
    if (revision === null) return [];
    try {
      const file = this.tagsFile(revision);
      const stored = entryAt(this.files.abs(file))?.isFile() ? this.files.read(file) : null;
      if (!stored) throw new Error("Missing tag directory");
      const cleartext = open(dk, stored.bytes, tagsContext(store.manifest, revision));
      try {
        const directory = TagDirectory.parse(JSON.parse(cleartext.toString("utf8")) as unknown);
        const { tags } = directory;
        if (directory.revision !== revision || new Set(tags.map((tag) => tag.tagId)).size !== tags.length || new Set(tags.map((tag) => tag.name)).size !== tags.length) throw new Error("Invalid tag directory");
        return tags;
      } finally {
        cleartext.fill(0);
      }
    } catch {
      throw corruptStore("标签密文");
    }
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    return withSafeSnapshot(this.files, operation);
  }

  packageFiles(): ReadonlyMap<string, string> {
    const state = this.load();
    if (state.kind === "corrupt") throw corruptStore(state.file);
    if (state.kind === "empty") return new Map();
    if (!state.manifest) throw errors.invalidInput("保险箱是旧格式，无法生成当前格式的备份");
    const files = new Set([state.file, `${this.relativeDir}/current/${MANIFEST}`]);
    for (const [id, revision] of Object.entries(state.manifest.entries)) files.add(this.entryFile(id, revision));
    if (state.manifest.tags !== null) files.add(this.tagsFile(state.manifest.tags));
    const required = new Map<string, string>();
    for (const file of files) {
      if (!entryAt(this.files.abs(file))?.isFile()) throw corruptStore("备份所需的保险箱文件");
      const snapshot = this.files.read(file);
      if (!snapshot) throw corruptStore("备份所需的保险箱文件");
      required.set(file, createHash("sha256").update(snapshot.bytes).digest("hex"));
    }
    this.assertVersion(state);
    return required;
  }

  private current(): CurrentSafe {
    const store = this.load();
    if (store.kind === "corrupt") throw corruptStore(store.file);
    if (store.kind !== "ready" || !store.manifest) throw corruptStore(MANIFEST);
    return { ...store, manifest: store.manifest };
  }

  commitEntry(dk: Buffer, draft: EntryDraft, precondition: EntryPrecondition, guard: () => void, newTags: TagFields[] = []): Promise<number> {
    return this.enqueue(async () => {
      guard();
      const store = this.current();
      const currentRevision = store.manifest.entries[draft.entryId];
      if (precondition.kind === "create") {
        if (store.manifest.revision !== precondition.expectedRevision) throw errors.versionConflict(String(store.manifest.revision));
        if (currentRevision !== undefined) throw errors.nameConflict(draft.entryId);
      } else {
        if (currentRevision === undefined) throw errors.notFound("条目不存在");
        if (currentRevision !== precondition.expectedRevision) throw errors.versionConflict(String(currentRevision));
      }
      const tagIds = new Set(draft.tagIds);
      let changedTags: Tag[] | undefined;
      if (draft.tagIds.length || newTags.length) {
        const tags = this.readTags(store, dk);
        const available = new Set(tags.map((tag) => tag.tagId));
        if (draft.tagIds.some((id) => !available.has(id))) throw errors.notFound("所选标签已被删除");
        const byName = new Map(tags.map((tag) => [tag.name, tag]));
        for (const input of newTags) {
          const existing = byName.get(input.name);
          if (existing) {
            tagIds.add(existing.tagId);
          } else {
            const tag = { ...input, tagId: randomUUID() };
            tags.push(tag);
            byName.set(tag.name, tag);
            tagIds.add(tag.tagId);
            changedTags = tags;
          }
        }
      }
      const published = await this.publish(store, dk, [{ ...draft, tagIds: [...tagIds] }], changedTags, guard);
      return published.entries[draft.entryId]!;
    });
  }

  commitTags(dk: Buffer, store: CurrentSafe, tags: Tag[], entries: EntryDraft[], guard: () => void): Promise<number> {
    return this.enqueue(async () => {
      guard();
      this.assertVersion(store);
      return (await this.publish(store, dk, entries, tags, guard)).revision;
    });
  }

  deleteEntry(dk: Buffer, entryId: string, expectedRevision: number, guard: () => void): Promise<void> {
    return this.enqueue(async () => {
      guard();
      const store = this.current();
      const revision = store.manifest.entries[entryId];
      if (revision === undefined) throw errors.notFound("条目不存在");
      if (revision !== expectedRevision) throw errors.versionConflict(String(revision));
      await this.publish(store, dk, [], undefined, guard, entryId);
    });
  }

  private async publish(store: CurrentSafe, dk: Buffer, drafts: EntryDraft[], tags: Tag[] | undefined, guard: () => void, removeEntryId?: string) {
    const { authentication: _auth, checksum: _sum, ...previous } = store.manifest;
    const next = { ...previous, revision: previous.revision + 1, entries: { ...previous.entries } };
    if (removeEntryId) delete next.entries[removeEntryId];
    if (!Number.isSafeInteger(next.revision)) throw errors.invalidInput("保险箱版本已达上限");
    const pending: PendingFile[] = drafts.map((draft, index) => {
      const { entryId } = draft;
      const file = (revision: number) => this.entryFile(entryId, revision);
      const revision = this.nextRevision(previous.entries[entryId] ?? 0, file);
      next.entries[entryId] = revision;
      return { name: index ? `${index}-${STAGED_ENTRY}` : STAGED_ENTRY, destination: file(revision), bytes: sealJson(dk, { ...draft, revision }, entryContext(store.manifest, entryId, revision)) };
    });
    if (tags) {
      const revision = this.nextRevision(previous.tags ?? 0, (version) => this.tagsFile(version));
      next.tags = revision;
      pending.push({ name: "tags.bin", destination: this.tagsFile(revision), bytes: sealJson(dk, { revision, tags }, tagsContext(store.manifest, revision)) });
    }
    const manifest: PendingFile = { name: MANIFEST, destination: `${this.relativeDir}/current/${MANIFEST}`, bytes: encodeManifest(next, dk) };
    const files = [...pending, manifest];
    await this.stage(async (dir) => {
      for (const file of files) {
        await this.files.write(`${dir}/${file.name}`, file.bytes, { expectedVersion: null });
        guard();
      }
      this.assertVersion(store);
      for (const file of files) {
        if (!this.files.read(`${dir}/${file.name}`)?.bytes.equals(file.bytes)) throw corruptStore("暂存文件");
      }
      const installed: string[] = [];
      try {
        for (const file of pending) {
          const destination = this.files.abs(file.destination);
          if (entryAt(destination)) throw errors.versionConflict(String(previous.revision));
          mkdirSync(path.dirname(destination), { recursive: true });
          renameSync(this.files.abs(`${dir}/${file.name}`), destination);
          installed.push(destination);
        }
        // The manifest publishes the tag directory and every entry revision together.
        renameSync(this.files.abs(`${dir}/${manifest.name}`), this.files.abs(manifest.destination));
      } catch (error) {
        for (const file of installed) {
          try {
            rmSync(file, { force: true });
          } catch {
            // Failed cleanup leaves immutable ciphertext outside the active manifest.
          }
        }
        throw error;
      }
    });
    return next;
  }

  private nextRevision(previous: number, file: (revision: number) => string): number {
    // Unpublished ciphertext can remain after an interrupted publish.
    let revision = previous + 1;
    while (Number.isSafeInteger(revision) && entryAt(this.files.abs(file(revision)))) revision++;
    if (!Number.isSafeInteger(revision)) throw errors.invalidInput("保险箱版本已达上限");
    return revision;
  }

  private entryFile(id: string, revision: number): string {
    return `${this.relativeDir}/current/entries/${id}-${revision}.bin`;
  }

  private tagsFile(revision: number): string {
    return `${this.relativeDir}/current/tags/${revision}.bin`;
  }

  assertVersion(previous: LoadedSafe): void {
    const state = this.load();
    if (state.kind === "corrupt") throw corruptStore(state.file);
    if (state.kind !== "ready") throw corruptStore(KEYRING);
    if (state.file !== previous.file || state.version !== previous.version) throw errors.versionConflict(state.version);
    if (state.manifest?.checksum !== previous.manifest?.checksum) throw errors.versionConflict(String(state.manifest?.revision ?? state.version));
  }

  private async stage(operation: (dir: string) => Promise<void>): Promise<void> {
    this.files.assertWritable();
    // Vault ZIP and Git omit cache. An interrupted prepare leaves only unpublished files there.
    const prefix = this.files.abs(".huhu/cache/safe-write-");
    mkdirSync(path.dirname(prefix), { recursive: true });
    const local = mkdtempSync(prefix);
    const relative = path.relative(this.files.root, local).split(path.sep).join("/");
    try {
      await operation(relative);
    } finally {
      try {
        if (entryAt(local)) {
          for (const file of readdirSync(local)) rmSync(path.join(local, file), { force: true });
          rmdirSync(local);
        }
      } catch {
        // Cleanup cannot change the result of an already published operation.
      }
    }
  }
}
