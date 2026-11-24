import { realpathSync } from "node:fs";
import path from "node:path";
import { HuhuError } from "@huhu/contracts";

type Commit = { paths: readonly string[]; released: Promise<void> };
const pending = new Set<Commit>();

function pathKey(absolute: string): string {
  return absolute.normalize("NFC").toLowerCase();
}

function commitPaths(paths: readonly string[]): string[] {
  const keys = new Set<string>();
  for (const absolute of paths) {
    keys.add(pathKey(absolute));
    // A write through a Vault-local symlink must also contend with its real path.
    let parent = absolute;
    for (;;) {
      try {
        keys.add(pathKey(path.resolve(realpathSync(parent), path.relative(parent, absolute))));
        break;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        const next = path.dirname(parent);
        if (next === parent) throw error;
        parent = next;
      }
    }
  }
  return [...keys].sort();
}

function overlaps(a: string, b: string): boolean {
  return a === b || a.startsWith(b + path.sep) || b.startsWith(a + path.sep);
}

function conflicts(paths: readonly string[], commit: Commit): boolean {
  return paths.some((a) => commit.paths.some((b) => overlaps(a, b)));
}

export async function queueCommit<T>(paths: readonly string[], work: () => T | Promise<T>): Promise<T> {
  const keys = commitPaths(paths);
  const predecessors = [...pending].filter((commit) => conflicts(keys, commit));
  // Reserve all paths together so a later move cannot overtake any part of this commit.
  let resolve!: () => void;
  const promise = new Promise<void>((release) => {
    resolve = release;
  });
  const entry = { paths: keys, released: promise };
  pending.add(entry);
  try {
    await Promise.all(predecessors.map((commit) => commit.released));
    return await work();
  } finally {
    pending.delete(entry);
    resolve();
  }
}

export function guardSynchronousCommit(paths: readonly string[]): void {
  const keys = commitPaths(paths);
  if ([...pending].some((commit) => conflicts(keys, commit))) {
    throw new HuhuError("VERSION_CONFLICT", "路径正在提交，请重新读取后再试");
  }
}
