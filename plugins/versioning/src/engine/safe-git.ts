import { errors } from "@huhu/contracts";
import type { Stage } from "./conflicts/session.js";
import type { GitRunner } from "./git.js";

export interface SafeGitSnapshots {
  withLock<T>(operation: () => Promise<T>): Promise<T>;
  capture(): ReadonlyMap<string, Buffer>;
  requiredPaths(read: (file: string) => Promise<Buffer>): Promise<readonly string[]>;
}

export function isSafePath(file: string): boolean {
  const lower = file.toLowerCase();
  return lower === ".huhu/safe" || lower.startsWith(".huhu/safe/");
}

type Tree = ReadonlyMap<string, Stage>;

export async function gitTree(git: GitRunner, tree: string | null): Promise<Tree> {
  const entries = new Map<string, Stage>();
  if (!tree) return entries;
  const { stdout } = await git.run(["ls-tree", "-rz", tree]);
  for (const row of stdout.split("\0").filter(Boolean)) {
    const tab = row.indexOf("\t");
    const [mode, , oid] = row.slice(0, tab).split(" ");
    if (!mode || !oid || tab < 0) throw errors.invalidInput("无法读取同步候选的 Git 树");
    entries.set(row.slice(tab + 1), { mode, oid });
  }
  return entries;
}

export function safeTree(tree: Tree): Tree {
  return new Map([...tree].filter(([file]) => isSafePath(file)));
}

export function differentSafePaths(before: Tree, after: Tree): string[] {
  return [...new Set([...before.keys(), ...after.keys()])].filter((file) => {
    const a = before.get(file);
    const b = after.get(file);
    return a?.oid !== b?.oid || a?.mode !== b?.mode;
  });
}

const ordinaryBlob = (entry?: Stage): entry is Stage => entry?.mode === "100644" || entry?.mode === "100755";

export class SafeGit {
  constructor(
    private readonly git: GitRunner,
    private readonly snapshots?: SafeGitSnapshots,
  ) {}

  withLock<T>(operation: () => Promise<T>): Promise<T> {
    return this.snapshots ? this.snapshots.withLock(operation) : operation();
  }

  capture() {
    return this.snapshots?.capture() ?? new Map<string, Buffer>();
  }

  private blob(entry: Stage): Promise<Buffer> {
    return this.git.runBuffer(["cat-file", "blob", entry.oid]);
  }

  async matches(tree: Tree, snapshot: ReadonlyMap<string, Buffer>): Promise<boolean> {
    if (tree.size !== snapshot.size) return false;
    for (const [file, bytes] of snapshot) {
      const entry = tree.get(file);
      if (!ordinaryBlob(entry) || !(await this.blob(entry)).equals(bytes)) return false;
    }
    return true;
  }

  async validate(tree: Tree): Promise<void> {
    if (tree.size === 0) return;
    if (!this.snapshots) throw errors.invalidInput("保险箱整代快照未接入，无法同步保险箱文件");
    try {
      const paths = await this.snapshots.requiredPaths(async (file) => {
        const entry = tree.get(file);
        if (!ordinaryBlob(entry)) throw errors.invalidInput("保险箱所需的 Git 文件缺失或不是普通文件");
        return this.blob(entry);
      });
      if (paths.length === tree.size && paths.every((file) => ordinaryBlob(tree.get(file)))) return;
    } catch {
      // Treat malformed metadata and missing objects as an incomplete generation.
    }
    throw errors.invalidInput("Git 树必须恰好包含同一代保险箱清单、keyring 与引用密文，请检查旧提交或手工暂存");
  }

  async stage(previous: Tree, snapshot: ReadonlyMap<string, Buffer>, env: NodeJS.ProcessEnv): Promise<void> {
    const records: string[] = [];
    for (const [file, { oid }] of previous) records.push(`0 ${"0".repeat(oid.length)}\t${file}\0`);
    for (const [file, bytes] of snapshot) {
      const { stdout } = await this.git.run(["hash-object", "--no-filters", "-w", "--stdin"], { input: bytes });
      records.push(`100644 ${stdout.trim()}\t${file}\0`);
    }
    if (records.length) await this.git.run(["update-index", "-z", "--index-info"], { env, input: records.join("") });
  }

  async verifyCheckout(target: string, paths: string[]): Promise<void> {
    const attrs = ["filter", "text", "eol", "working-tree-encoding", "ident", "crlf"];
    const input = paths.map((file) => `${file}\0`).join("");
    for (const source of [[], [`--source=${target}`]]) {
      const { stdout } = await this.git.run(["check-attr", ...source, "-z", "--stdin", ...attrs], { input });
      const fields = stdout.split("\0").slice(0, -1);
      if (fields.some((value, index) => index % 3 === 2 && value !== "unspecified" && value !== "unset")) {
        throw errors.invalidInput("Git 属性会转换保险箱文件，无法安全拉取该代资料");
      }
    }
  }
}
