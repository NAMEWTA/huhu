import { errors } from "@huhu/contracts";

export function archiveJson(files: ReadonlyMap<string, Uint8Array>, name: string, preserveNumbers?: ReadonlySet<string>): unknown {
  const bytes = files.get(name);
  if (!bytes) throw errors.invalidInput("备份缺少文件：" + name);
  try {
    const input = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    if (!preserveNumbers) return JSON.parse(input) as unknown;
    return JSON.parse(input, (key: string, value: unknown, context?: { source?: string }) =>
      typeof value === "number" && preserveNumbers.has(key) ? context?.source ?? String(value) : value) as unknown;
  } catch {
    throw errors.invalidInput("备份的 JSON 文件损坏：" + name);
  }
}
