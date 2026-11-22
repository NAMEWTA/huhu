import { createHash, createHmac, randomBytes } from "node:crypto";
import { errors, HuhuError, type CapabilityResult } from "@huhu/contracts";
import type { CapabilityContext, OperationReceipts } from "@huhu/kernel";
import type { z } from "zod";
import type { ConfigureHost } from "./auth-profile.js";
import type { SshCredentialHost } from "./host-configurations.js";
import { assertSshHosts, externalSshOwner } from "./public-resources.js";

const resourceGroup = "ssh.hosts";

/** Uses the same protected storage as SSH credentials so receipt hashes cannot verify password guesses. */
export function sealCredentialPatches(patches: ConfigureHost["credentials"], host: SshCredentialHost | undefined) {
  if (!patches.some(({ action }) => action === "replace")) return patches;
  return withIntentSeal(host, (seal) =>
    patches.map((patch) => {
      if (patch.action !== "replace") return patch;
      const { value, ...metadata } = patch;
      return { ...metadata, digest: seal([patch.purpose, value]) };
    }),
  );
}

export async function withIntentSeal<T>(host: SshCredentialHost | undefined, run: (seal: (value: unknown) => string) => T): Promise<T> {
  if (!host) throw errors.permissionDenied("SSH 本机凭据保护不可用");
  const keyId = createHash("sha256")
    .update(JSON.stringify(["ssh-host-intents-v1", host.localVaultInstanceId]))
    .digest("hex");
  const protection = host.protection;
  let key: Buffer | null = null;
  try {
    key = await protection.read(keyId);
    if (!key) {
      const created = randomBytes(32);
      try {
        await protection.create(keyId, created);
        key = created;
      } catch (error) {
        created.fill(0);
        key = await protection.read(keyId);
        if (!key) throw error;
      }
    }
    const secretKey = key;
    return run((value) => createHmac("sha256", secretKey).update(JSON.stringify(value)).digest("hex"));
  } catch {
    throw new HuhuError("SSH_AUTH_FAILED", "SSH 本机凭据保护不可用");
  } finally {
    key?.fill(0);
  }
}

type Mutation<T> = {
  hosts: readonly string[];
  intentKey: string;
  input: unknown;
  output: z.ZodType<T>;
  authorize(): readonly string[];
  run(assertCurrent: () => void): Promise<T>;
};

export class HostIntents {
  private readonly active = new Map<string, Promise<CapabilityResult<unknown>>>();

  constructor(
    private readonly receipts: OperationReceipts,
    private readonly vaultInstance: string,
  ) {}

  async run<T>(context: CapabilityContext, capability: string, mutation: Mutation<T>): Promise<T> {
    const owner = JSON.stringify([this.vaultInstance, externalSshOwner(context)]);
    context.signal.throwIfAborted();
    assertSshHosts(context, mutation.hosts);
    const lookup = { capability, intentKey: mutation.intentKey };
    const previous = this.receipts.lookup(owner, lookup);
    const hosts = previous?.resources?.[resourceGroup] ?? [...new Set(mutation.authorize())];
    assertSshHosts(context, hosts);
    const { entry, mismatch, fresh } = this.receipts.claim(owner, capability, mutation.intentKey, mutation.input, { [resourceGroup]: hosts });
    if (mismatch) throw errors.idempotencyMismatch();
    let result: CapabilityResult<unknown>;
    if (fresh && entry.phase === "accepted") {
      const task: Promise<CapabilityResult<unknown>> = Promise.resolve()
        .then(async () => {
          const assertCurrent = () => {
            context.signal.throwIfAborted();
            context.assertCapabilityCurrent?.();
            assertSshHosts(context, hosts);
            mutation.authorize();
          };
          assertCurrent();
          const data = mutation.output.parse(await mutation.run(assertCurrent));
          return this.receipts.complete(entry, "completed", { ok: true, data }).result;
        })
        .catch((error: unknown) => {
          if (!(error instanceof HuhuError) || error.code === "INTERNAL" || error.details?.["outcome"] === "unknown") return this.unknown(entry.operationId);
          return this.receipts.complete(entry, "failed", { ok: false, error: error.toJSON() }).result;
        });
      this.active.set(entry.operationId, task);
      try {
        result = await task;
      } finally {
        this.active.delete(entry.operationId);
      }
    } else if (entry.phase === "completed" || entry.phase === "failed") {
      result = entry.result;
    } else {
      const pending = this.active.get(entry.operationId);
      if (!pending) return this.unknown(entry.operationId);
      result = await pending;
    }
    assertSshHosts(context, hosts);
    if (!result.ok) throw new HuhuError(result.error.code, result.error.message, { retryable: result.error.retryable, ...(result.error.details && { details: result.error.details }) });
    return mutation.output.parse(result.data);
  }

  private unknown(operationId: string): never {
    throw new HuhuError("INTERNAL", "SSH 操作结果待核实", { retryable: false, details: { outcome: "unknown", operationId } });
  }
}
