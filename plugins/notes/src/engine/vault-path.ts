import { errors, KINDS } from "@huhu/contracts";
import { normalizeRelPath, protectedKindOf, type VaultFiles } from "@huhu/vault";
import { lstatSync } from "node:fs";
import path from "node:path";

const managedRoots = new Set(["archives", ...Object.values(KINDS).map(({ dir }) => dir.toLowerCase())]);

/** Reject links in existing parents too, even when the destination does not exist yet. */
export function assertUnlinkedPath(files: VaultFiles, rel: string): void {
  let entry = files.root;
  const segments = normalizeRelPath(rel).split("/");
  for (const [index, segment] of segments.entries()) {
    entry = path.join(entry, segment);
    const info = lstatSync(entry, { throwIfNoEntry: false });
    if (!info) return;
    if (info.isSymbolicLink()) throw errors.permissionDenied(rel);
    if (index < segments.length - 1 && !info.isDirectory()) throw errors.invalidInput(`不是文件夹：${segment}`);
  }
}

export function ordinaryNotePath(files: VaultFiles, rel: string): string {
  const normalized = normalizeRelPath(rel);
  if (protectedKindOf(normalized) || managedRoots.has(normalized.split("/")[0]!.toLowerCase())) throw errors.permissionDenied(normalized);
  assertUnlinkedPath(files, normalized);
  return normalized;
}
