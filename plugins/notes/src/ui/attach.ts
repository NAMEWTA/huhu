import { isAllowedAttachment, MAX_ATTACH_BYTES, sanitizeAttachmentName } from "../shared/attachments.js";

/** 与 explorer/filesDeps.ts 的 EngineLike 同构（编辑器与文件树共用，不互相依赖）。 */
interface AttachEngine {
  call<T>(capability: string, input?: unknown, opts?: { write?: boolean }): Promise<T>;
}

export interface AttachInput {
  file: File;
  /** 编辑器粘贴 / 拖入：落在该笔记旁的 attachments/ */
  notePath?: string;
  /** 文件树拖入：直接落在该目录 */
  dir?: string;
  name?: string;
}

export interface AttachResult {
  path: string;
  size: number;
  deduped: boolean;
}

/** 分块转 base64：避免一次性 `String.fromCharCode(...bytes)` 在大文件上爆栈。 */
export function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** 上传前的本地检查：和引擎一致的类型 / 大小规则，失败时给出可读原因（不发请求）。 */
export function checkAttachable(file: Pick<File, "name" | "size">): string | null {
  const name = sanitizeAttachmentName(file.name);
  if (file.size === 0) return "附件是空文件";
  if (file.size > MAX_ATTACH_BYTES) return `附件超过 ${MAX_ATTACH_BYTES / 1024 / 1024} MiB 上限`;
  if (!isAllowedAttachment(name)) return `不支持的附件类型：${name}`;
  return null;
}

/** 把浏览器 File 交给引擎的 notes.attach（原子写 + OperationLog，同内容去重）。 */
export async function attachFile(engine: AttachEngine, input: AttachInput): Promise<AttachResult> {
  const problem = checkAttachable(input.file);
  if (problem) throw new Error(problem);
  const bytes = new Uint8Array(await input.file.arrayBuffer());
  return engine.call<AttachResult>(
    "notes.attach",
    {
      ...(input.notePath ? { notePath: input.notePath } : {}),
      ...(input.dir !== undefined ? { dir: input.dir } : {}),
      name: input.name ?? input.file.name,
      dataBase64: bytesToBase64(bytes),
    },
    { write: true },
  );
}
