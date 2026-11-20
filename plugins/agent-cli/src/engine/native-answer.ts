import { readFileSync } from "node:fs";
import { errors, ExecutionBindingSchema } from "@huhu/contracts";
import { z } from "zod";
import { putReceiptFile } from "./execution-receipts.js";
import { launchHash } from "./launch-binding.js";

const Id = z.string().min(1).max(256).regex(/\S/);
export const NativeAnswer = z.strictObject({
  execution: ExecutionBindingSchema,
  requestId: Id,
  requestVersion: z.number().int().positive(),
  nativeRequestId: Id,
  replyId: Id,
  answer: z
    .string()
    .min(1)
    .max(512)
    .regex(/\S/)
    .refine((answer) => Buffer.from(answer).toString("utf8") === answer),
});
export type NativeAnswer = z.infer<typeof NativeAnswer>;
export const NativeAnswerStatus = z.enum(["accepted", "not_sent", "unknown", "stale", "unsupported"]);
export type NativeAnswerStatus = z.infer<typeof NativeAnswerStatus>;

export function answerFingerprint({ execution, requestId, requestVersion, nativeRequestId, replyId, answer }: NativeAnswer): string {
  const { vaultId, taskId, runId, attempt, dispatchId, sessionBinding: b } = execution;
  return launchHash([vaultId, taskId, runId, attempt, dispatchId, b.machineId, b.sessionId, b.coreId, b.coreAddress, b.processGeneration, b.provider, b.nativeSessionId, requestId, requestVersion, nativeRequestId, replyId, answer]);
}

const Digest = z.string().regex(/^[a-f0-9]{64}$/);
const Journal = z.array(z.strictObject({ question: Digest, replyId: Id, fingerprint: Digest }));
type Journal = z.infer<typeof Journal>;

/** Put the immutable send intent under the same Vault writer that owns dispatch. */
export class NativeAnswerIntents {
  constructor(private readonly file: string) {}

  private read(): Journal {
    try {
      return Journal.parse(JSON.parse(readFileSync(this.file, "utf8")));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
  }

  lookup(input: NativeAnswer) {
    return this.find(this.read(), input).state;
  }

  claim(input: NativeAnswer): boolean {
    const journal = this.read();
    const found = this.find(journal, input);
    if (found.state !== "new") return false;
    putReceiptFile(this.file, [...journal, found.entry], true);
    return this.lookup(input) === "original";
  }

  private find(journal: Journal, input: NativeAnswer) {
    const fingerprint = answerFingerprint(input);
    const question = launchHash([input.execution, input.nativeRequestId]);
    const reply = journal.find((entry) => entry.replyId === input.replyId);
    if (reply && reply.fingerprint !== fingerprint) throw errors.idempotencyMismatch();
    if (reply) return { state: "original" as const };
    if (journal.some((entry) => entry.question === question)) return { state: "occupied" as const };
    return { state: "new" as const, entry: { question, replyId: input.replyId, fingerprint } };
  }
}
