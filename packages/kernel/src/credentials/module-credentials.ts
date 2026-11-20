import { randomUUID } from "node:crypto";
import { lstatSync, realpathSync } from "node:fs";
import type { Vault } from "@huhu/vault";
import { z } from "zod";
import { CredentialError, type LocalCredentialProtection } from "./protection.js";
import { generation, identityHash, LocalVersions, purpose, readJson, type Snapshot } from "./versions.js";

const entityIdSchema = z.string().min(1);
const actionSchema = z.discriminatedUnion("action", [
  z.strictObject({ purpose, action: z.literal("keep") }),
  z.strictObject({ purpose, action: z.literal("clear") }),
  z.strictObject({ purpose, action: z.literal("replace"), value: z.string().min(1), reconfigure: z.literal(true).optional() }),
]);

export type CredentialAction = z.input<typeof actionSchema>;
export type CredentialState = "unconfigured" | "configured" | "temporarily-unavailable" | "needs-reconfiguration" | "corrupt";
export interface CredentialSummary {
  entityId: string;
  revision: string;
  authState: Readonly<Record<string, CredentialState>>;
}

export interface CredentialOwner<T> {
  vault: Vault;
  /** Canonical, app-private directory outside the Vault, shared by this Engine's owners. */
  localRoot: string;
  /** Assigned by the host to this local Vault instance, independently of its portable Vault ID. */
  localVaultInstanceId: string;
  pluginId: string;
  protection: LocalCredentialProtection;
  /** Schema for portable, non-secret data. The owner admits only fields safe to persist and export. */
  definition: z.ZodType<T>;
  /** Applicable purposes and their canonical authentication targets. Use "" for a target-free purpose. */
  targets(definition: T): Readonly<Record<string, string>>;
}

interface Definition<T> {
  entityId: string;
  revision: string;
  definition: T;
  configured: string[];
}

interface Pin {
  directory: string;
  snapshot: Snapshot;
}

interface OwnerQueue {
  tail: Promise<void>;
  pins: Set<Pin>;
}

const queues = new Map<string, OwnerQueue>();

function parse<T>(schema: z.ZodType<T>, input: unknown, code: "invalid-input" | "corrupt"): T {
  const result = schema.safeParse(input);
  if (!result.success) throw new CredentialError(code);
  return result.data;
}

function assertUnique(values: readonly string[], code: "invalid-input" | "corrupt"): void {
  if (new Set(values).size !== values.length) throw new CredentialError(code);
}

const definitionFile = (pluginId: string) => `.huhu/module-credentials/${identityHash(pluginId)}.json`;
type DefinitionFiles = Pick<Vault["files"], "abs" | "read">;

function loadDefinitions<T>(files: DefinitionFiles, path: string, definition: z.ZodType<T>): { entries: Definition<T>[]; version: string | null } {
  const stats = lstatSync(files.abs(path), { throwIfNoEntry: false });
  if (stats && !stats.isFile()) throw new CredentialError("corrupt");
  const file = files.read(path);
  if (file === null) return { entries: [], version: null };
  const schema = z.strictObject({
    format: z.literal(1),
    entries: z.array(z.strictObject({ entityId: entityIdSchema, revision: generation, definition, configured: z.array(purpose) })),
  });
  const { entries } = parse(schema, readJson(file.bytes), "corrupt");
  assertUnique(
    entries.map((entry) => entry.entityId),
    "corrupt",
  );
  assertUnique(
    entries.map((entry) => entry.revision),
    "corrupt",
  );
  for (const entry of entries) assertUnique(entry.configured, "corrupt");
  return { entries, version: file.version };
}

/**
 * One private owner per plugin and open Vault. Local material is accessed only by the Vault writer.
 * Callers authorize before entry and keep the writer open through use.
 */
export class ModuleCredentials<T> {
  static readPortableDefinition<T>(files: DefinitionFiles, pluginId: string, definition: z.ZodType<T>, entityId: string): Definition<T> | undefined {
    return loadDefinitions(files, definitionFile(pluginId), definition).entries.find((entry) => entry.entityId === entityId);
  }

  readonly #vault: Vault;
  readonly #file: string;
  readonly #queueKey: string;
  readonly #versions: LocalVersions;
  readonly #definition: z.ZodType<T>;
  readonly #deriveTargets: CredentialOwner<T>["targets"];

  constructor(owner: CredentialOwner<T>) {
    this.#vault = owner.vault;
    this.#definition = owner.definition;
    this.#deriveTargets = owner.targets.bind(owner);
    const vaultRoot = realpathSync.native(this.#vault.root);
    this.#file = definitionFile(owner.pluginId);
    this.#queueKey = `${vaultRoot}/${this.#file}`;
    this.#versions = new LocalVersions(vaultRoot, owner.localRoot, owner.localVaultInstanceId, owner.pluginId, owner.protection);
  }

  async #serial<R>(operation: (queue: OwnerQueue) => Promise<R>): Promise<R> {
    const queue = queues.get(this.#queueKey) ?? { tail: Promise.resolve(), pins: new Set<Pin>() };
    const result = queue.tail.then(() => operation(queue));
    const tail = result.then(
      () => {},
      () => {},
    );
    queue.tail = tail;
    queues.set(this.#queueKey, queue);
    try {
      return await result;
    } catch (error) {
      if (error instanceof CredentialError) throw error;
      throw new CredentialError("storage-failed");
    } finally {
      if (queue.tail === tail && queue.pins.size === 0) queues.delete(this.#queueKey);
    }
  }

  #load(): { entries: Definition<T>[]; version: string | null } {
    return loadDefinitions(this.#vault.files, this.#file, this.#definition);
  }

  #targets(definition: T): Map<string, string> {
    return new Map(Object.entries(this.#deriveTargets(definition)));
  }

  #snapshot(entry: Definition<T>, targets = this.#targets(entry.definition)): Snapshot | null {
    const snapshot = this.#versions.readSnapshot(entry.entityId, entry.revision);
    if (snapshot?.references.some((ref) => !entry.configured.includes(ref.purpose) || !targets.has(ref.purpose) || targets.get(ref.purpose) !== ref.target)) {
      throw new CredentialError("corrupt");
    }
    return snapshot;
  }

  async #summarize(entry: Definition<T>, snapshot: Snapshot | null | "corrupt" | "read-only", verified?: ReadonlySet<string>): Promise<CredentialSummary> {
    const states = await Promise.all(
      [...this.#targets(entry.definition)].map(async ([name]): Promise<[string, CredentialState]> => {
        if (!entry.configured.includes(name)) return [name, "unconfigured"];
        if (snapshot === "read-only") return [name, "temporarily-unavailable"];
        if (snapshot === "corrupt") return [name, "corrupt"];
        if (verified?.has(name)) return [name, "configured"];
        const ref = snapshot?.references.find((ref) => ref.purpose === name);
        if (!ref) return [name, "needs-reconfiguration"];
        try {
          await this.#versions.read(entry.entityId, ref);
          return [name, "configured"];
        } catch (error) {
          if (error instanceof CredentialError && error.code === "missing-key") return [name, "needs-reconfiguration"];
          if (error instanceof CredentialError && error.code === "corrupt") return [name, "corrupt"];
          return [name, "temporarily-unavailable"];
        }
      }),
    );
    return { entityId: entry.entityId, revision: entry.revision, authState: Object.fromEntries(states) };
  }

  list(): Promise<Array<CredentialSummary & { definition: T }>> {
    return this.#serial(async () =>
      Promise.all(
        this.#load().entries.map(async (entry) => {
          let snapshot: Snapshot | null | "corrupt" | "read-only" = "read-only";
          if (!this.#vault.readOnly) {
            try {
              snapshot = this.#snapshot(entry);
            } catch (error) {
              if (!(error instanceof CredentialError && error.code === "corrupt")) throw error;
              snapshot = "corrupt";
            }
          }
          return { ...(await this.#summarize(entry, snapshot)), definition: entry.definition };
        }),
      ),
    );
  }

  async save(input: { entityId: string; expectedRevision: string | null; definition: T; actions: readonly CredentialAction[]; signal?: AbortSignal }): Promise<CredentialSummary> {
    this.#vault.assertWritable();
    const { entityId, expectedRevision, signal } = input;
    parse(entityIdSchema, entityId, "invalid-input");
    parse(generation.nullable(), expectedRevision, "invalid-input");
    const definition = parse(this.#definition, input.definition, "invalid-input");
    parse(z.json(), definition, "invalid-input");
    const actions = parse(z.array(actionSchema), input.actions, "invalid-input");
    assertUnique(
      actions.map((action) => action.purpose),
      "invalid-input",
    );
    return this.#serial(async (queue) => {
      if (signal?.aborted) throw new CredentialError("cancelled");
      const { entries, version } = this.#load();
      const current = entries.find((entry) => entry.entityId === entityId);
      if ((current?.revision ?? null) !== expectedRevision) throw new CredentialError("conflict");
      const previous = current ? this.#snapshot(current) : null;
      const next: Definition<T> = { entityId, revision: randomUUID(), definition, configured: [] };
      const snapshot: Snapshot = { format: 1, entityId, revision: next.revision, references: [] };
      const targets = this.#targets(definition);
      const required = new Set([...targets.keys(), ...(current?.configured ?? [])]);
      if (required.size !== actions.length || actions.some((action) => !required.has(action.purpose) || (!targets.has(action.purpose) && action.action !== "clear"))) {
        throw new CredentialError("invalid-input");
      }
      try {
        this.#versions.recordInitiallyUnbound(entries.filter((entry) => entry.configured.length > 0));
        let newKey: string | undefined;
        const verified = new Set<string>();
        for (const action of actions) {
          if (action.action === "clear") continue;
          const target = targets.get(action.purpose)!;
          const old = previous?.references.find((ref) => ref.purpose === action.purpose);
          if (action.action === "keep") {
            if (current?.configured.includes(action.purpose)) next.configured.push(action.purpose);
            if (old?.target === target) snapshot.references.push(old);
            continue;
          }
          let key: string | undefined;
          if (old) {
            try {
              await this.#versions.read(entityId, old);
              key = old.key;
            } catch (error) {
              if (!(error instanceof CredentialError && error.code === "missing-key" && action.reconfigure)) throw error;
              key = newKey ??= await this.#versions.createKey();
            }
          }
          key ??= newKey ?? (await this.#existingKey(entries, action.reconfigure === true));
          if (key === undefined) {
            newKey = await this.#versions.createKey();
            key = newKey;
          }
          const ref = { purpose: action.purpose, target, key, version: randomUUID() };
          await this.#versions.stage(entityId, ref, action.value);
          verified.add(action.purpose);
          snapshot.references.push(ref);
          next.configured.push(action.purpose);
        }
        if (next.configured.length) this.#versions.stageSnapshot(snapshot);
        const summary = await this.#summarize(next, snapshot, verified);
        if (signal?.aborted) throw new CredentialError("cancelled");
        const updated = current ? entries.map((entry) => (entry === current ? next : entry)) : [...entries, next];
        await this.#publish(updated, version);
        return summary;
      } finally {
        await this.#collect(queue);
      }
    });
  }

  async #existingKey(entries: readonly Definition<T>[], reconfigure: boolean): Promise<string | undefined> {
    let missing = false;
    const tried = new Set<string>();
    for (const entry of entries) {
      for (const ref of this.#snapshot(entry)?.references ?? []) {
        if (tried.has(ref.key)) continue;
        tried.add(ref.key);
        try {
          await this.#versions.read(entry.entityId, ref);
          return ref.key;
        } catch (error) {
          if (!(error instanceof CredentialError && error.code === "missing-key")) throw error;
          missing = true;
        }
      }
    }
    if (missing && !reconfigure) throw new CredentialError("missing-key");
    return undefined;
  }

  async delete(entityId: string, expectedRevision: string, signal?: AbortSignal): Promise<void> {
    this.#vault.assertWritable();
    parse(entityIdSchema, entityId, "invalid-input");
    parse(generation, expectedRevision, "invalid-input");
    return this.#serial(async (queue) => {
      if (signal?.aborted) throw new CredentialError("cancelled");
      const { entries, version } = this.#load();
      const current = entries.find((entry) => entry.entityId === entityId);
      if (current?.revision !== expectedRevision) throw new CredentialError("conflict");
      await this.#publish(
        entries.filter((entry) => entry !== current),
        version,
      );
      await this.#collect(queue);
    });
  }

  async #publish(entries: Definition<T>[], expectedVersion: string | null): Promise<void> {
    try {
      await this.#vault.files.write(this.#file, Buffer.from(JSON.stringify({ format: 1, entries }) + "\n"), { expectedVersion });
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === "VERSION_CONFLICT" || code === "NAME_CONFLICT" || code === "NOT_FOUND") throw new CredentialError("conflict");
      throw error;
    }
  }

  /** The Vault writer holds one committed definition and its versions for trusted authentication. */
  async use<R>(entityId: string, purposes: readonly string[], operation: (definition: T, values: ReadonlyMap<string, string>) => Promise<R>): Promise<R> {
    this.#vault.assertWritable();
    parse(entityIdSchema, entityId, "invalid-input");
    const requested = parse(z.array(purpose), purposes, "invalid-input");
    assertUnique(requested, "invalid-input");
    const { definition, values, pin } = await this.#serial(async (queue) => {
      const entry = this.#load().entries.find((item) => item.entityId === entityId);
      if (!entry) throw new CredentialError("not-found");
      const snapshot = this.#snapshot(entry);
      const values = new Map<string, string>();
      for (const name of requested) {
        if (!entry.configured.includes(name)) throw new CredentialError("unconfigured");
        const ref = snapshot?.references.find((binding) => binding.purpose === name);
        if (!ref) throw new CredentialError("unbound");
        values.set(name, await this.#versions.read(entityId, ref));
      }
      const pin = snapshot && { directory: this.#versions.directory, snapshot };
      if (pin) queue.pins.add(pin);
      return { definition: entry.definition, values, pin };
    });
    try {
      return await operation(definition, values);
    } catch {
      throw new CredentialError("operation-failed");
    } finally {
      values.clear();
      if (pin)
        await this.#serial(async (queue) => {
          queue.pins.delete(pin);
          await this.#collect(queue);
        });
    }
  }

  /** Retry scope-local collection on writer open or after a deferred cleanup. */
  async recover(): Promise<boolean> {
    this.#vault.assertWritable();
    return this.#serial((queue) => this.#collect(queue));
  }

  async #collect(queue: OwnerQueue): Promise<boolean> {
    if (this.#vault.readOnly) return false;
    try {
      const snapshots = [...queue.pins].filter((pin) => pin.directory === this.#versions.directory).map((pin) => pin.snapshot);
      let initiallyUnbound: ReadonlySet<string> | undefined;
      for (const entry of this.#load().entries) {
        if (!entry.configured.length) continue;
        const snapshot = this.#snapshot(entry);
        if (snapshot !== null) {
          snapshots.push(snapshot);
        } else {
          initiallyUnbound ??= this.#versions.initiallyUnbound();
          if (!initiallyUnbound.has(identityHash(entry.entityId, entry.revision))) return false;
        }
      }
      await this.#versions.collect(snapshots);
      return true;
    } catch {
      return false;
    }
  }
}
