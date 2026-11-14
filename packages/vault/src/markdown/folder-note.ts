/** 文件夹笔记：某个文件夹（非 Vault 根）里的 `index.md`。打开文件夹即打开它。 */
export function folderNoteDir(rel: string): string | null {
  const m = /^(.+)\/index\.md$/i.exec(rel);
  return m ? (m[1] as string) : null;
}

/** 指向某个文件夹笔记的链接目标写法：`[[目录/]]`、`[[目录]]`、`[[目录/index.md]]`、`[[目录/index]]`（裸 `[[index]]` 不算）。 */
export function folderNoteLinkTargets(rel: string): string[] | null {
  const dir = folderNoteDir(rel);
  if (dir === null) return null;
  const file = rel.slice(dir.length + 1);
  return [`${dir}/`, dir, rel, `${dir}/${file.replace(/\.md$/i, "")}`];
}

/** `[[目录/]]` 链接解析成该目录的 index.md（存在时），其余原样返回；`exists` 判断 Vault 内文件是否存在。 */
export function resolveFolderLink(target: string, exists: (rel: string) => boolean): string | null {
  if (!target.endsWith("/")) return null;
  const dir = target.replace(/\/+$/, "");
  if (!dir) return null;
  for (const name of ["index.md", "Index.md", "INDEX.md"]) if (exists(`${dir}/${name}`)) return `${dir}/${name}`;
  return null;
}
