import { createHash } from "node:crypto";

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const o = value as Record<string, unknown>;
    return `{${Object.keys(o).sort().filter((k) => o[k] !== undefined).map((k) => `${JSON.stringify(k)}:${canonicalJson(o[k])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

export interface TaskInput {
  title: string;
  body: string;
  resources: unknown;
  execution: unknown;
}

/** inputHash = sha256(title + body + canonical(resources) + canonical(execution)) 前 16 位。 */
export function inputHash(i: TaskInput): string {
  return createHash("sha256").update(i.title + i.body + canonicalJson(i.resources) + canonicalJson(i.execution)).digest("hex").slice(0, 16);
}

export function processingKey(taskId: string, inputRevision: number, hash: string): string {
  return `${taskId}:${inputRevision}:${hash}`;
}

export function inputChanged(a: TaskInput, b: TaskInput): boolean {
  return inputHash(a) !== inputHash(b);
}
