import { createHash, randomUUID } from "node:crypto";
import { lstatSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import lockfile from "proper-lockfile";
import { z } from "zod";
import { engineControlSocket } from "./engine-endpoint.js";
import { endpointRootBinding } from "./identity.js";

const limit = z.int().min(1).max(256);
const limitsSchema = z.strictObject({ active: limit.optional(), retained: limit.optional() });
type Slots = "active" | "retained";
type Limits = z.infer<typeof limitsSchema>;
const ownerSchema = z.strictObject({ vault: z.string(), id: z.string() });
const digest = (s: string) => createHash("sha256").update(s).digest("hex");
const missing = (error: unknown) => (error as NodeJS.ErrnoException).code === "ENOENT";

/** These reservations belong to one local OS account and are shared by its Vault Engines. */
export class DeviceDispatchBudget {
  constructor(private readonly directory: string, private readonly vault: string, private readonly limits: Limits) {}

  private occupants(kind: Slots) {
    return readdirSync(this.directory).filter((name) => name.startsWith(`${kind}-`) && name.endsWith(".slot")).flatMap((name) => {
      const file = path.join(this.directory, name);
      try {
        return [{ file, ...ownerSchema.parse(JSON.parse(readFileSync(file, "utf8"))) }];
      } catch (error) {
        if (missing(error)) return [];
        throw error;
      }
    });
  }

  status(kind: Slots): { limit: number | null; occupied: number | null } {
    const configured = this.limits[kind];
    return configured === undefined ? { limit: null, occupied: null } : { limit: configured, occupied: this.occupants(kind).length };
  }

  private locked(fn: () => boolean): boolean {
    let release: () => void;
    try {
      release = lockfile.lockSync(this.directory, { stale: 10_000, realpath: false });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ELOCKED") return false;
      throw error;
    }
    try {
      return fn();
    } finally {
      release();
    }
  }

  private publish(kind: Slots, id: string): void {
    const file = path.join(this.directory, `${kind}-${digest(JSON.stringify([this.vault, id]))}.slot`);
    const temporary = path.join(this.directory, `${randomUUID()}.tmp`);
    try {
      writeFileSync(temporary, JSON.stringify({ vault: this.vault, id }), { mode: 0o600, flag: "wx", flush: true });
      renameSync(temporary, file);
    } finally {
      rmSync(temporary, { force: true });
    }
  }

  claim(kind: Slots, id: string): boolean {
    const limit = this.limits[kind];
    if (limit === undefined) return true;
    return this.locked(() => {
      const occupants = this.occupants(kind);
      if (occupants.some(({ vault, id: current }) => vault === this.vault && current === id)) return true;
      if (occupants.length >= limit) return false;
      this.publish(kind, id);
      return true;
    });
  }

  sync(kind: Slots, ids: ReadonlySet<string>, released: ReadonlySet<string>): boolean {
    if (this.limits[kind] === undefined) return true;
    return this.locked(() => {
      const owned = this.occupants(kind).filter(({ vault }) => vault === this.vault);
      for (const entry of owned) if (released.has(entry.id) && !ids.has(entry.id)) rmSync(entry.file, { force: true });
      const observed = new Set(owned.map(({ id }) => id));
      // Live reservations survive lowering a configured limit or re-opening the original Engine.
      for (const id of ids) if (!observed.has(id)) this.publish(kind, id);
      return true;
    });
  }
}

export function loadDeviceDispatchBudget(vaultRoot: string): DeviceDispatchBudget | undefined {
  const configDir = process.env["XDG_CONFIG_HOME"];
  const file = path.join(configDir && path.isAbsolute(configDir) ? configDir : path.join(homedir(), ".config"), "huhu", "dispatch-limits.json");
  let limits: Limits;
  try {
    limits = limitsSchema.parse(JSON.parse(readFileSync(file, "utf8")));
  } catch (error) {
    if (missing(error)) return undefined;
    throw new Error("本机 Agent 派遣资源配置无效", { cause: error });
  }
  if (!limits.active && !limits.retained) return undefined;
  const directory = path.join(path.dirname(engineControlSocket("dispatch-budget", true)), `dispatch-slots-${digest(file).slice(0, 24)}`);
  mkdirSync(directory, { mode: 0o700, recursive: true });
  const info = lstatSync(directory);
  if (!info.isDirectory() || info.uid !== process.getuid?.() || (info.mode & 0o077) !== 0) throw new Error("派遣资源目录不可信");
  return new DeviceDispatchBudget(directory, digest(endpointRootBinding(vaultRoot)), limits);
}
