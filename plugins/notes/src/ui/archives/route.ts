/** 档案在笔记模块中的路由：只看路径（`Archives/` → 首页，`Archives/<类型>` → 类型视图，`Archives/<类型>/<名称>[/index.md]` → 档案视图）。 */
export const ARCHIVE_ROOT = "Archives";

export type ArchiveRoute = { kind: "home" } | { kind: "type"; path: string } | { kind: "archive"; path: string };

const trim = (p: string): string => p.replace(/\/+$/, "");

/** 文件夹路径（文件树里点击的文件夹）对应的档案视图；不是档案相关的文件夹返回 null。 */
export function archiveFolderRoute(folder: string): ArchiveRoute | null {
  const parts = trim(folder).split("/");
  if (parts[0] !== ARCHIVE_ROOT) return null;
  if (parts.length === 1) return { kind: "home" };
  if (parts.length === 2) return { kind: "type", path: `${parts.join("/")}/` };
  if (parts.length === 3) return { kind: "archive", path: `${parts.join("/")}/` };
  return null;
}

/** 打开的笔记路径对应的档案视图：`Archives/<类型>/<名称>/index.md` 就是该档案（其余文件是普通笔记）。 */
export function archiveNoteRoute(file: string): ArchiveRoute | null {
  const m = /^Archives\/([^/]+)\/([^/]+)\/index\.md$/i.exec(file);
  return m ? { kind: "archive", path: `${ARCHIVE_ROOT}/${m[1]}/${m[2]}/` } : null;
}

/** 档案文件夹里的其他文件（不含 index.md）所属的档案路径，用于面包屑。 */
export function archiveOfFile(file: string): string | null {
  const m = /^(Archives\/[^/]+\/[^/]+)\/(?!index\.md$)[^/]+/i.exec(file);
  return m ? `${m[1]}/` : null;
}

export const folderName = (p: string): string => trim(p).split("/").at(-1) ?? p;
