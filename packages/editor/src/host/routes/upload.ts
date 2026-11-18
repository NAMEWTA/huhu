// POST /api/upload（design §4）：编辑器粘贴 / 拖入（带 parentDocName）与文件树拖入（带 dir）共用。
// 文件落盘由宿主注入（plugins/notes 的 notes.attach）；本文件只做表单解析与响应形状（上游 UploadAssetSuccessSchema）。
import type { HostRoutes } from "../host-fetch";

export interface UploadRequest {
  file: File;
  /** 目标目录（文件树拖入）；编辑器上传时为空串，由 notePath 决定落点 */
  dir: string;
  name: string;
  /** 编辑器上传：当前笔记的 Vault 相对路径（如 `docs/说明.md`） */
  notePath?: string;
}

export type UploadProvider = (input: UploadRequest) => Promise<{ path: string; deduped?: boolean }>;

const dirOf = (p: string): string => (p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "");

/** 上游约定：`path` 是 Vault 相对的内容路径（客户端据此算最短引用），`src` 是相对笔记所在目录的写法。 */
export function uploadResponse(path: string, notePath: string | undefined, deduped: boolean | undefined): { src: string; path: string; deduped?: boolean } {
  const base = notePath ? dirOf(notePath) : "";
  const src = base && path.startsWith(`${base}/`) ? path.slice(base.length + 1) : path;
  return { src, path, ...(deduped ? { deduped: true } : {}) };
}

export async function handleUploadForm(upload: UploadProvider | undefined, form: FormData): Promise<{ src: string; path: string; deduped?: boolean }> {
  if (!upload) throw new Error("宿主未提供上传能力");
  const file = form.get("file");
  if (!(file instanceof File)) throw new Error("缺少 file");
  const parent = form.get("parentDocName");
  const parentName = typeof parent === "string" && parent !== "" ? parent : undefined;
  // 文件树拖入（上游 appendSidebarUploadFields）：parentDocName = `<目标目录>/<文件名>`，placement = parent-dir → 直接落在该目录
  const folderDrop = form.get("placement") === "parent-dir" && parentName !== undefined;
  const notePath = folderDrop ? undefined : parentName;
  const dir = folderDrop ? dirOf(parentName) : String(form.get("dir") ?? form.get("parentDir") ?? "");
  const r = await upload({ file, dir, name: file.name, ...(notePath ? { notePath } : {}) });
  return uploadResponse(r.path, notePath, r.deduped);
}

export function uploadRoutes(upload: UploadProvider): HostRoutes {
  return { "POST /api/upload": ({ body }) => handleUploadForm(upload, body as FormData) };
}
