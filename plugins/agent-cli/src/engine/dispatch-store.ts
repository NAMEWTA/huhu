import { mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { ExecutionBindingSchema, ExecutionSessionBindingSchema, HuhuError, TaskHistorySelectionSchema, TaskRunAttemptSchema } from "@huhu/contracts";
import type { VaultFiles } from "@huhu/vault";
import { z } from "zod";
import { putReceiptFile } from "./execution-receipts.js";
import { launchHash } from "./launch-binding.js";
import { NativeStopIntent, type NativeStop } from "./native-stop.js";

const Id = z.string().trim().min(1).max(256);
const Fingerprint = z.string().regex(/^[a-f0-9]{64}$/);
const provider = z.enum(["claude", "codex", "pi"]);
export const DispatchLookup = z.strictObject({
  vaultId: Id,
  machineId: Id,
  taskId: Id,
  runId: Id,
  attempt: TaskRunAttemptSchema,
  dispatchId: Id,
});
export const LaunchOptions = z.strictObject({
  cwd: z.string().min(1).optional(),
  model: z.string().min(1).optional(),
  effort: z.string().min(1).optional(),
  fast: z.boolean().optional(),
});
export const DispatchTarget = z.discriminatedUnion("mode", [
  LaunchOptions.extend({ mode: z.literal("new"), spaceId: Id, spaceRevision: z.number().int().positive(), provider, configurationId: Fingerprint }),
  z.strictObject({ mode: z.literal("existing"), spaceId: Id, spaceRevision: z.number().int().positive().optional(), binding: ExecutionSessionBindingSchema }),
  z.strictObject({ mode: z.literal("resume"), spaceId: Id, provider, nativeSessionId: Id, history: TaskHistorySelectionSchema.optional(), spaceRevision: z.number().int().positive().optional(), configurationId: Fingerprint.optional() }),
]);

function isInputText(text: string): boolean {
  if (!/\S/.test(text)) return false;
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index);
    if ((code < 0x20 && code !== 0x09 && code !== 0x0a) || (code >= 0x7f && code <= 0x9f)) return false;
  }
  return true;
}

export const DispatchInput = DispatchLookup.extend({
  eventIds: z
    .array(Id)
    .min(1)
    .max(128)
    .refine((ids) => new Set(ids).size === ids.length),
  inputSnapshotRef: Id,
  inputSnapshotHash: Fingerprint,
  input: z.string().min(1).max(64_000).refine(isInputText),
  resultMode: z.literal("allow_no_update").optional(),
  target: DispatchTarget,
});
export type DispatchLookup = z.infer<typeof DispatchLookup>;
export type DispatchInput = z.infer<typeof DispatchInput>;
export const ResumePrepareInput = DispatchInput.omit({ input: true }).extend({ inputSha256: Fingerprint });
export type ResumePrepareInput = z.infer<typeof ResumePrepareInput>;

export const ProviderAcceptance = z.strictObject({
  id: Id,
  execution: ExecutionBindingSchema,
  inputSha256: Fingerprint,
  nativeTurnId: Id.optional(),
});
export type ProviderAcceptance = z.infer<typeof ProviderAcceptance>;
const StoredDispatch = z
  .strictObject({
    schema: z.literal(1),
    key: DispatchLookup,
    fingerprint: Fingerprint,
    inputSha256: Fingerprint,
    adapterId: Id,
    transport: z.literal("native").optional(),
    resultMode: DispatchInput.shape.resultMode,
    acceptedAt: z.iso.datetime(),
    execution: ExecutionBindingSchema.nullable(),
    ownerActive: z.boolean(),
    write: z.enum(["not_sent", "sending", "core_written", "unknown"]),
    providerAcceptance: ProviderAcceptance.nullable(),
    resumeWriterRetry: z.strictObject({ count: z.int().positive(), after: z.int().positive() }).optional(),
  })
  .refine(({ key, execution, write, ownerActive, providerAcceptance, inputSha256, transport }) => {
    if (transport === "native" && write === "core_written") return false;
    if (!execution) return write === "not_sent" && !ownerActive && !providerAcceptance;
    const { machineId, ...expected } = key;
    const { sessionBinding, ...actual } = execution;
    if (sessionBinding.machineId !== machineId || launchHash(expected) !== launchHash(actual)) return false;
    if (transport === "native" && (sessionBinding.provider !== "codex" || !sessionBinding.nativeSessionId || (providerAcceptance && !providerAcceptance.nativeTurnId))) return false;
    if (write === "not_sent" && (ownerActive || providerAcceptance)) return false;
    return !providerAcceptance || (providerAcceptance.inputSha256 === inputSha256 && launchHash(providerAcceptance.execution) === launchHash(execution));
  }, "The dispatch facts must refer to the same execution");
export type StoredDispatch = z.infer<typeof StoredDispatch>;
const WriteIntent = z.strictObject({ key: DispatchLookup, fingerprint: Fingerprint, sessionId: Id, executionHash: Fingerprint });
type WriteIntent = z.infer<typeof WriteIntent>;

/** Keeps the claim and write intent in one atomic Vault file. The request body belongs to Tasks. */
export class AgentDispatchStore {
  private readonly directory: string;
  private readonly intents: string;
  private readonly stops: string;

  constructor(
    stateDir: string,
    private readonly vaultFiles: VaultFiles,
    private readonly scope: { vaultId: string; machineId: string },
  ) {
    this.directory = path.join(stateDir, "agent-cli", "dispatches");
    this.intents = path.join(stateDir, "agent-cli", "dispatch-input-intents");
    this.stops = path.join(stateDir, "agent-cli", "dispatch-stop-intents");
  }

  private file(id: string): string {
    return path.join(this.directory, launchHash(id) + ".json");
  }

  private unavailable(id: string): HuhuError {
    return new HuhuError("RUN_UNKNOWN", "派遣的输入凭据待核实", { retryable: true, details: { dispatchId: id, reason: "dispatch_receipt_unavailable" } });
  }

  private readFile(file: string): StoredDispatch {
    const record = StoredDispatch.parse(JSON.parse(readFileSync(file, "utf8")));
    if (this.file(record.key.dispatchId) !== file) throw new Error("Agent dispatch record has the wrong file identity");
    return record;
  }

  private intentFile(id: string): string {
    return path.join(this.intents, launchHash(id) + ".json");
  }

  private readIntent(file: string): WriteIntent {
    const intent = WriteIntent.parse(JSON.parse(readFileSync(file, "utf8")));
    if (this.intentFile(intent.key.dispatchId) !== file) throw new Error("Agent input intent has the wrong file identity");
    return intent;
  }

  private intent(id: string): WriteIntent | null {
    try {
      return this.readIntent(this.intentFile(id));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw this.unavailable(id);
    }
  }

  private stopFile(id: string): string {
    return path.join(this.stops, launchHash(id) + ".json");
  }

  stopIntent(execution: NativeStop["execution"]): string | null {
    const { dispatchId } = execution;
    try {
      const intent = NativeStopIntent.parse(JSON.parse(readFileSync(this.stopFile(dispatchId), "utf8")));
      if (intent.executionHash !== launchHash(execution)) throw this.unavailable(dispatchId);
      return intent.stopId;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw this.unavailable(dispatchId);
    }
  }

  claimStop({ execution, stopId }: NativeStop): boolean {
    this.vaultFiles.assertWritable();
    if (this.stopIntent(execution) !== null) return false;
    putReceiptFile(this.stopFile(execution.dispatchId), { executionHash: launchHash(execution), stopId });
    return this.stopIntent(execution) === stopId;
  }

  read(id: string): StoredDispatch | null {
    const intent = this.intent(id);
    let record: StoredDispatch;
    try {
      record = this.readFile(this.file(id));
    } catch (error) {
      if (!intent && (error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw this.unavailable(id);
    }
    if (
      intent &&
      (record.fingerprint !== intent.fingerprint || record.execution?.sessionBinding.sessionId !== intent.sessionId || launchHash(record.execution) !== intent.executionHash || launchHash(intent.key) !== launchHash(record.key))
    ) {
      throw this.unavailable(id);
    }
    return record;
  }

  private jsonFiles(directory: string): string[] {
    try {
      return readdirSync(directory)
        .filter((name) => /^[a-f0-9]{64}\.json$/.test(name))
        .map((name) => path.join(directory, name));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
  }

  private local(key: DispatchLookup): boolean {
    return key.vaultId === this.scope.vaultId && key.machineId === this.scope.machineId;
  }

  *nativeInputs() {
    for (const file of this.jsonFiles(this.directory)) {
      try {
        const entry = this.readFile(file);
        if (!this.local(entry.key) || entry.transport !== "native" || entry.write === "not_sent") continue;
        const record = this.read(entry.key.dispatchId);
        if (record?.execution) yield { execution: record.execution, inputSha256: record.inputSha256, resultMode: record.resultMode };
      } catch {
        // Unverified input records cannot authorize reports.
      }
    }
  }

  owner(sessionId: string): string | undefined {
    for (const file of this.jsonFiles(this.intents)) {
      const intent = this.readIntent(file);
      if (intent.sessionId !== sessionId || !this.local(intent.key)) continue;
      try {
        if (this.read(intent.key.dispatchId)?.ownerActive) return intent.key.dispatchId;
      } catch {
        // The separate intent fences this session even when its latest dispatch receipt cannot be read.
        return intent.key.dispatchId;
      }
    }
    for (const file of this.jsonFiles(this.directory)) {
      const record = this.readFile(file);
      if (this.local(record.key) && record.ownerActive && record.execution?.sessionBinding.sessionId === sessionId) return record.key.dispatchId;
    }
    return undefined;
  }

  private protectInput(record: StoredDispatch, execution: NonNullable<StoredDispatch["execution"]>): void {
    const id = record.key.dispatchId;
    const next: WriteIntent = { key: record.key, fingerprint: record.fingerprint, sessionId: execution.sessionBinding.sessionId, executionHash: launchHash(execution) };
    const previous = this.intent(id);
    if (previous) {
      if (launchHash(previous) !== launchHash(next)) throw this.unavailable(id);
      return;
    }
    mkdirSync(this.intents, { recursive: true });
    writeFileSync(this.intentFile(id), JSON.stringify(next), { flag: "wx", flush: true });
  }

  save(record: StoredDispatch): void {
    this.vaultFiles.assertWritable();
    const safe = StoredDispatch.parse(record);
    if (safe.write === "sending" && safe.execution) this.protectInput(safe, safe.execution);
    mkdirSync(this.directory, { recursive: true });
    const file = this.file(record.key.dispatchId);
    const temporary = file + ".tmp";
    writeFileSync(temporary, JSON.stringify(safe), { flush: true });
    renameSync(temporary, file);
  }
}
