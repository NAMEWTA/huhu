import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { HuhuError, newVaultId, errors } from "@huhu/contracts";
import lockfile from "proper-lockfile";
import { z } from "zod";
import { ReceiptLog } from "./receipts.js";
import { VaultFiles } from "./write.js";

export const VaultJsonSchema = z.object({
  kind: z.literal("huhu-vault"),
  id: z.string().regex(/^vault-[0-9a-z]+$/),
  name: z.string().min(1),
  description: z.string().default(""),
  formatVersion: z.number().int(),
  createdAt: z.string(),
});
export type VaultJson = z.infer<typeof VaultJsonSchema>;

export const FORMAT_VERSION = 1;
export const HUHU_DIR = ".huhu";

/** 本机标识：用于 runtime/<machineId>/ 目录名，同一台机器稳定。 */
export function machineId(): string {
  return createHash("sha256").update(`${os.hostname()}|${os.userInfo().username}`).digest("hex").slice(0, 12);
}

/** 持锁进程的 pid 记录：获取锁之后立即写入，释放时删除。 */
function ownerFile(root: string): string {
  return path.join(root, HUHU_DIR, "writer.pid");
}

/** 锁文件的持有者已确认死亡（pid 不存在）。pid 存活或记录缺失时保守地返回 false。 */
function ownerIsDead(root: string): boolean {
  try {
    const pid = Number(readFileSync(ownerFile(root), "utf8").trim());
    if (!Number.isInteger(pid) || pid <= 0) return false;
    process.kill(pid, 0);
    return false;
  } catch (e) {
    return (e as { code?: string }).code === "ESRCH";
  }
}

/** 锁最近仍被刷新（持有者刚刚存活过）。 */
function lockIsFresh(lockPath: string, ms: number): boolean {
  try {
    return Date.now() - statSync(lockPath).mtimeMs < ms;
  } catch {
    return false;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface OpenOptions {
  /** 目录不含 .huhu/vault.json 时创建它（只创建 .huhu，不动已有文件）。 */
  create?: boolean;
  name?: string;
  /** 只读打开：不取写者锁，所有写入返回 READ_ONLY_VAULT。 */
  readOnly?: boolean;
}

/** 已打开的 Vault：持有写者锁，提供受守卫的文件访问。 */
export class Vault {
  private constructor(
    readonly root: string,
    readonly info: VaultJson,
    readonly readOnly: boolean,
    readonly files: VaultFiles,
    private readonly release: (() => Promise<void>) | null,
  ) {}

  get id(): string {
    return this.info.id;
  }

  get runtimeDir(): string {
    return path.join(this.root, HUHU_DIR, "runtime", machineId());
  }

  assertWritable(): void {
    if (this.readOnly) throw errors.readOnlyVault();
  }

  static async open(root: string, opts: OpenOptions = {}): Promise<Vault> {
    if (!existsSync(root) || !statSync(root).isDirectory()) throw errors.notFound(`目录不存在：${root}`);
    const real = path.resolve(root);
    const metaPath = path.join(real, HUHU_DIR, "vault.json");
    let info: VaultJson;
    if (existsSync(metaPath)) {
      const parsed = VaultJsonSchema.safeParse(JSON.parse(readFileSync(metaPath, "utf8")));
      if (!parsed.success) throw errors.invalidInput("vault.json 格式不正确", parsed.error.issues);
      if (parsed.data.formatVersion > FORMAT_VERSION && !opts.readOnly) throw new HuhuError("READ_ONLY_VAULT", "该 Vault 由更新版本的 HUHU 创建，只能只读打开");
      info = parsed.data;
    } else if (opts.create) {
      if (opts.readOnly) throw errors.readOnlyVault();
      mkdirSync(path.join(real, HUHU_DIR), { recursive: true });
      info = { kind: "huhu-vault", id: newVaultId(), name: opts.name ?? path.basename(real), description: "", formatVersion: FORMAT_VERSION, createdAt: new Date().toISOString() };
      writeFileSync(metaPath, JSON.stringify(info, null, 2) + "\n");
    } else {
      throw errors.notFound(`不是 HUHU Vault：${real}`);
    }

    let release: (() => Promise<void>) | null = null;
    if (!opts.readOnly) {
      mkdirSync(path.join(real, HUHU_DIR), { recursive: true });
      const lockOpts = { lockfilePath: path.join(real, HUHU_DIR, "writer.lock"), stale: 15_000, update: 5_000, realpath: false };
      const acquire = () => lockfile.lock(path.join(real, HUHU_DIR), lockOpts);
      try {
        try {
          release = await acquire();
        } catch (e) {
          // 持锁的 Engine 已崩溃（pid 不存在）：回收陈旧锁，而不是等 15 秒。
          // 锁刚被刷新过时先等待（最多 3 秒），避免与"刚刚获取锁、尚未写 pid 文件"的新写者竞争。
          if ((e as { code?: string }).code !== "ELOCKED" || !ownerIsDead(real)) throw e;
          const deadline = Date.now() + 3_000;
          while (lockIsFresh(lockOpts.lockfilePath, 2_000) && Date.now() < deadline) await sleep(200);
          if (!ownerIsDead(real)) throw e;
          rmSync(lockOpts.lockfilePath, { recursive: true, force: true });
          release = await acquire();
        }
        writeFileSync(ownerFile(real), String(process.pid));
      } catch (e) {
        if ((e as { code?: string }).code === "ELOCKED") {
          throw new HuhuError("READ_ONLY_VAULT", "Vault 正被另一个 HUHU 实例使用，可以只读打开", { recovery: [{ action: "open-readonly", label: "只读打开" }] });
        }
        throw e;
      }
    }
    return new Vault(real, info, opts.readOnly === true, new VaultFiles(real, new ReceiptLog(), opts.readOnly === true), release);
  }

  async close(): Promise<void> {
    if (this.release) rmSync(ownerFile(this.root), { force: true });
    await this.release?.();
  }
}

/** 从目录向上查找含 .huhu/vault.json 的 Vault 根。 */
export function findVaultRoot(start: string): string | null {
  let dir = path.resolve(start);
  for (;;) {
    if (existsSync(path.join(dir, HUHU_DIR, "vault.json"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/** 顶层非隐藏条目数（启动页展示用）。 */
export function countEntries(root: string): number {
  return readdirSync(root).filter((n) => !n.startsWith(".")).length;
}
