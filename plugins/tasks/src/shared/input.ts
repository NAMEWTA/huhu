import { createHash } from "node:crypto";

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const o = value as Record<string, unknown>;
    return `{${Object.keys(o)
      .sort()
      .filter((k) => o[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${canonicalJson(o[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

export interface TaskInput {
  /** `<task>` 区段的内容。 */
  body: string;
  execution: unknown;
}

/** inputHash = sha256(canonical([`<task>` 内容, execution])) 前 16 位。标题、评论、标签与其他 frontmatter 字段都不计入（spec §4.4）。 */
export function inputHash(i: TaskInput): string {
  return createHash("sha256")
    .update(canonicalJson([i.body, i.execution]))
    .digest("hex")
    .slice(0, 16);
}

export function processingKey(taskId: string, inputRevision: number, hash: string): string {
  return `${taskId}:${inputRevision}:${hash}`;
}

export function inputChanged(a: TaskInput, b: TaskInput): boolean {
  return inputHash(a) !== inputHash(b);
}
