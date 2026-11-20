import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, rmdirSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { CredentialError, LocalProtectionError, newDataKey, open, seal, type LocalCredentialProtection } from "./protection.js";

export const generation = z.uuidv4().refine((id) => id === id.toLowerCase());
export const purpose = z.string().min(1);
const reference = z.strictObject({ purpose, target: z.string(), key: generation, version: generation });
const snapshotSchema = z.strictObject({ format: z.literal(1), entityId: z.string().min(1), revision: generation, references: z.array(reference) });
export type Reference = z.infer<typeof reference>;
export type Snapshot = z.infer<typeof snapshotSchema>;
const scopeHash = z.string().regex(/^[0-9a-f]{64}$/);
const unboundSchema = z.strictObject({ format: z.literal(1), scope: scopeHash, entries: z.array(scopeHash) });
const unboundFile = "initially-unbound.json";
const keyFingerprintFile = "fingerprint";
const keyFingerprint = (key: Uint8Array): string => createHash("sha256").update(key).digest("hex");

export function identityHash(...parts: string[]): string {
  return createHash("sha256").update(JSON.stringify(parts)).digest("hex");
}

function existsAs(file: string, kind: "directory" | "file"): boolean {
  try {
    const stats = lstatSync(file);
    if (kind === "directory" ? !stats.isDirectory() : !stats.isFile()) throw new CredentialError("corrupt");
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

export function readJson(bytes: Buffer): unknown {
  try {
    return JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new CredentialError("corrupt");
  }
}

export class LocalVersions {
  readonly #directory: string;
  readonly #scope: string;

  constructor(
    vaultRoot: string,
    localRoot: string,
    localVaultInstanceId: string,
    pluginId: string,
    private readonly protection: LocalCredentialProtection,
  ) {
    if (!path.isAbsolute(localRoot) || !localVaultInstanceId || !pluginId) throw new CredentialError("invalid-input");
    const root = realpathSync.native(localRoot);
    const relative = path.relative(vaultRoot, root);
    if (!relative || (!path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`))) {
      throw new CredentialError("invalid-input");
    }
    this.#scope = identityHash("huhu/module-credentials/v1", localVaultInstanceId, pluginId);
    this.#directory = path.join(root, this.#scope);
  }

  get directory(): string {
    return this.#directory;
  }

  recordInitiallyUnbound(entries: readonly Pick<Snapshot, "entityId" | "revision">[]): void {
    if (existsAs(this.#directory, "directory")) return;
    const staging = `${this.#directory}.initializing`;
    const file = path.join(staging, unboundFile);
    // The Vault writer can discard an unpublished attempt and rebuild the proof from current definitions.
    if (existsAs(staging, "directory")) {
      if (existsAs(file, "file")) unlinkSync(file);
      rmdirSync(staging);
    }
    if (entries.length === 0) return;

    const record = { format: 1, scope: this.#scope, entries: entries.map(({ entityId, revision }) => identityHash(entityId, revision)) };
    const bytes = Buffer.from(JSON.stringify(record));
    mkdirSync(staging, { mode: 0o700 });
    writeFileSync(file, bytes, { flag: "wx", mode: 0o600, flush: true });
    if (!readFileSync(file).equals(bytes)) throw new CredentialError("corrupt");
    // Publish the scope and its proof together before creating any local credential material.
    renameSync(staging, this.#directory);
  }

  initiallyUnbound(): ReadonlySet<string> {
    if (!existsAs(this.#directory, "directory")) return new Set();
    const file = path.join(this.#directory, unboundFile);
    if (!existsAs(file, "file")) return new Set();
    const record = unboundSchema.safeParse(readJson(readFileSync(file)));
    if (!record.success || record.data.scope !== this.#scope) throw new CredentialError("corrupt");
    return new Set(record.data.entries);
  }

  #subdir(name: "snapshots" | "keys", create = false): string | null {
    if (!existsAs(this.#directory, "directory")) {
      if (!create) return null;
      mkdirSync(this.#directory, { mode: 0o700 });
    }
    const directory = path.join(this.#directory, name);
    if (!existsAs(directory, "directory")) {
      if (!create) return null;
      mkdirSync(directory, { mode: 0o700 });
    }
    return directory;
  }

  readSnapshot(entityId: string, revision: string): Snapshot | null {
    const dir = this.#subdir("snapshots");
    if (dir === null) return null;
    const file = path.join(dir, `${revision}.json`);
    if (!existsAs(file, "file")) return null;
    const parsed = snapshotSchema.safeParse(readJson(readFileSync(file)));
    if (!parsed.success || parsed.data.entityId !== entityId || parsed.data.revision !== revision || new Set(parsed.data.references.map((ref) => ref.purpose)).size !== parsed.data.references.length) {
      throw new CredentialError("corrupt");
    }
    return parsed.data;
  }

  stageSnapshot(snapshot: Snapshot): void {
    const directory = this.#subdir("snapshots", true)!;
    const file = path.join(directory, `${snapshot.revision}.json`);
    const bytes = Buffer.from(JSON.stringify(snapshot));
    writeFileSync(file, bytes, { flag: "wx", mode: 0o600, flush: true });
    if (!readFileSync(file).equals(bytes)) throw new CredentialError("corrupt");
  }

  #keyId(key: string): string {
    return `huhu/credentials/v1/${this.#scope}/${key}`;
  }

  async #protect<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      throw new CredentialError(error instanceof LocalProtectionError ? error.reason : "unavailable");
    }
  }

  async #readKey(id: string): Promise<Buffer> {
    const key = await this.#protect(() => this.protection.read(this.#keyId(id)));
    if (key === null) throw new CredentialError("missing-key");
    if (key.length !== 32) {
      key.fill(0);
      throw new CredentialError("corrupt");
    }
    return key;
  }

  async createKey(): Promise<string> {
    const id = randomUUID();
    const keyDir = path.join(this.#subdir("keys", true)!, id);
    const key = newDataKey();
    try {
      mkdirSync(keyDir, { mode: 0o700 });
      // Link recovery to this generated key before asking the OS to publish it.
      writeFileSync(path.join(keyDir, keyFingerprintFile), keyFingerprint(key), { flag: "wx", mode: 0o600, flush: true });
      await this.#protect(() => this.protection.create(this.#keyId(id), key));
      const verified = await this.#readKey(id);
      try {
        if (!timingSafeEqual(key, verified)) throw new CredentialError("corrupt");
      } finally {
        verified.fill(0);
      }
    } finally {
      key.fill(0);
    }
    return id;
  }

  #aad(entityId: string, ref: Reference): string {
    return JSON.stringify(["huhu/module-credentials/v1", this.#scope, entityId, ref.purpose, ref.target, ref.key, ref.version]);
  }

  #versionFile(ref: Reference): string {
    const keys = this.#subdir("keys");
    const key = keys === null ? null : path.join(keys, ref.key);
    if (key === null || !existsAs(key, "directory")) throw new CredentialError("corrupt");
    return path.join(key, `${ref.version}.bin`);
  }

  async read(entityId: string, ref: Reference): Promise<string> {
    const file = this.#versionFile(ref);
    if (!existsAs(file, "file")) throw new CredentialError("corrupt");
    const envelope = readFileSync(file);
    const key = await this.#readKey(ref.key);
    try {
      return open(key, envelope, this.#aad(entityId, ref));
    } finally {
      key.fill(0);
    }
  }

  async stage(entityId: string, ref: Reference, value: string): Promise<void> {
    const file = this.#versionFile(ref);
    const key = await this.#readKey(ref.key);
    try {
      const envelope = seal(key, value, this.#aad(entityId, ref));
      writeFileSync(file, envelope, { flag: "wx", mode: 0o600, flush: true });
      if (open(key, readFileSync(file), this.#aad(entityId, ref)) !== value) throw new CredentialError("corrupt");
    } finally {
      key.fill(0);
    }
  }

  async collect(snapshots: readonly Snapshot[]): Promise<void> {
    const liveSnapshots = new Set(snapshots.map((snapshot) => `${snapshot.revision}.json`));
    const liveKeys = new Map<string, Set<string>>();
    for (const snapshot of snapshots) {
      for (const { key, version } of snapshot.references) {
        const versions = liveKeys.get(key) ?? new Set<string>();
        versions.add(`${version}.bin`);
        liveKeys.set(key, versions);
      }
    }
    const snapshotDir = this.#subdir("snapshots");
    if (snapshotDir !== null) {
      for (const file of managedFiles(snapshotDir, ".json")) {
        if (!liveSnapshots.has(file)) unlinkSync(path.join(snapshotDir, file));
      }
    }
    const keysDir = this.#subdir("keys");
    if (keysDir === null) return;
    for (const key of readdirSync(keysDir)) {
      if (!generation.safeParse(key).success) continue;
      const keyDir = path.join(keysDir, key);
      if (!existsAs(keyDir, "directory")) continue;
      const liveVersions = liveKeys.get(key);
      for (const file of managedFiles(keyDir, ".bin")) {
        if (!liveVersions?.has(file)) unlinkSync(path.join(keyDir, file));
      }
      if (!liveVersions) await this.#collectKey(keyDir, key);
    }
  }

  async #collectKey(directory: string, key: string): Promise<void> {
    const files = readdirSync(directory);
    if (files.some((name) => name !== keyFingerprintFile)) return;
    const record = path.join(directory, keyFingerprintFile);
    if (existsAs(record, "file")) {
      const expected = readFileSync(record, "utf8");
      if (scopeHash.safeParse(expected).success) {
        const id = this.#keyId(key);
        const current = await this.#protect(() => this.protection.read(id));
        try {
          if (current && keyFingerprint(current) === expected) await this.#protect(() => this.protection.remove(id));
        } finally {
          current?.fill(0);
        }
      }
      unlinkSync(record);
    }
    rmdirSync(directory);
  }
}

function managedFiles(dir: string, suffix: string): string[] {
  return readdirSync(dir).filter((name) => name.endsWith(suffix) && generation.safeParse(name.slice(0, -suffix.length)).success && existsAs(path.join(dir, name), "file"));
}
