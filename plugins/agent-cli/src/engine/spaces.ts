import { randomUUID } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { HuhuError, errors, newId } from "@huhu/contracts";
import { filesystemIdentity, normalizeRelPath, protectedKindOf } from "@huhu/vault";
import { z } from "zod";
import { spaceCanLaunch, type Space } from "../shared/space.js";
import { launchHash } from "./launch-binding.js";

export type { Space } from "../shared/space.js";

const metadata = {
  id: z.string().regex(/^space-[a-z0-9]+$/),
  name: z.string().trim().min(1),
  createdAt: z.string(),
  revision: z.int().positive(),
};
const directorySchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("vault") }),
  z.strictObject({ kind: z.literal("relative"), path: z.string() }),
  z.strictObject({ kind: z.literal("external"), bindingId: z.uuid() }),
  z.strictObject({ kind: z.literal("legacy") }),
]);
const portableRecord = z.strictObject({ format: z.literal(2), ...metadata, directory: directorySchema });
const legacyRecord = z.strictObject({ ...metadata, root: z.string(), machineId: z.string() });
const recordSchema = z.union([portableRecord, legacyRecord]);
const localBinding = z.strictObject({ vault: z.string(), vaultStamp: z.string(), spaceId: metadata.id, root: z.string(), rootStamp: z.string() });
type PortableRecord = z.infer<typeof portableRecord>;
type StoredSpace = z.infer<typeof recordSchema>;
type Directory = z.infer<typeof directorySchema>;
type Binding = z.infer<typeof localBinding>;
type SaveInput = { id?: string; name: string; root: string; expectedRevision?: number };
export type PortableSpaceOptions = { vaultRoot: string; readOnly?: boolean };

function canonicalDirectory(root: string) {
  const real = realpathSync(root);
  if (!statSync(real).isDirectory()) throw errors.invalidInput("工作目录不是文件夹");
  return real;
}

function directoryStamp(root: string) {
  const stat = statSync(root, { bigint: true });
  return JSON.stringify([filesystemIdentity(stat), String(stat.birthtimeNs)]);
}

function relativeWithin(root: string, absolute: string): string | null {
  const relative = path.relative(root, absolute);
  if (path.isAbsolute(relative) || relative === ".." || relative.startsWith(`..${path.sep}`)) return null;
  return relative;
}

function relativeUnder(root: string, absolute: string): string | null {
  const relative = relativeWithin(root, absolute);
  return relative !== null && path.join(root, relative) === absolute ? relative : null;
}

type Anchor = { requested: string; root: string; stamp: string; bindings: string; readOnly: boolean };

/** Space 配置可移植，绝对外部路径只在本地 runtime 保存。 */
export class SpaceStore {
  private readonly dir: string;
  private readonly anchor?: Anchor;

  constructor(
    dir: string,
    readonly machineId: string,
    private readonly now: () => Date = () => new Date(),
    options?: PortableSpaceOptions,
  ) {
    this.dir = dir;
    if (options) {
      const requested = path.resolve(options.vaultRoot);
      const root = canonicalDirectory(requested);
      const relative = path.relative(requested, path.resolve(dir));
      if (!relative || relativeUnder(requested, path.resolve(dir)) === null || !/^[a-z0-9_-]+$/i.test(machineId)) throw errors.invalidInput("Space 存储目录无效");
      this.dir = path.join(root, relative);
      this.anchor = { requested, root, stamp: directoryStamp(root), bindings: path.join(root, ".huhu", "runtime", machineId, "agent-cli", "space-bindings"), readOnly: options.readOnly ?? false };
    }
  }

  private anchorIsCurrent(anchor: Anchor) {
    try {
      return canonicalDirectory(anchor.requested) === anchor.root && directoryStamp(anchor.root) === anchor.stamp;
    } catch {
      return false;
    }
  }

  /** Do not open member directories through a symlink or Windows junction. Missing members may be created. */
  private safeDirectory(directory: string) {
    const anchor = this.anchor;
    if (!anchor) return true;
    const relative = relativeUnder(anchor.root, directory);
    if (relative === null || !this.anchorIsCurrent(anchor)) return false;
    let current = anchor.root;
    for (const segment of relative ? relative.split(path.sep) : []) {
      current = path.join(current, segment);
      try {
        const info = lstatSync(current);
        if (info.isSymbolicLink() || !info.isDirectory()) return false;
      } catch (error) {
        return (error as NodeJS.ErrnoException).code === "ENOENT";
      }
    }
    return true;
  }

  private file(id: string) {
    return path.join(this.dir, `${id}.json`);
  }

  private records(): StoredSpace[] {
    if (!this.safeDirectory(this.dir) || !existsSync(this.dir)) return [];
    return readdirSync(this.dir, { withFileTypes: true }).flatMap((entry) => {
      if (!entry.isFile() || !entry.name.endsWith(".json")) return [];
      try {
        const parsed = recordSchema.safeParse(JSON.parse(readFileSync(path.join(this.dir, entry.name), "utf8")));
        if (parsed.success && entry.name === `${parsed.data.id}.json` && (this.anchor || ("machineId" in parsed.data && parsed.data.machineId === this.machineId))) return [parsed.data];
      } catch {
        // An unreadable or unsupported row cannot be used for launch.
      }
      return [];
    });
  }

  private withinVault(root: string, anchor: Anchor): Directory | undefined {
    const relative = relativeUnder(anchor.root, root);
    if (relative === "") return { kind: "vault" };
    if (relative === null) return undefined;
    const normalized = relative.split(path.sep).join("/");
    if (normalizeRelPath(normalized) !== normalized) throw errors.pathOutsideVault(normalized);
    return { kind: "relative", path: normalized };
  }

  private migrateRecord({ root, machineId, ...base }: z.infer<typeof legacyRecord>, anchor: Anchor): PortableRecord {
    let directory: Directory = { kind: "legacy" };
    if (machineId === this.machineId && path.isAbsolute(root)) {
      try {
        // An old absolute path has no portable provenance. Only the current Vault's own path can be inferred.
        if (relativeUnder(anchor.root, root) !== null && this.safeDirectory(root)) directory = this.withinVault(canonicalDirectory(root), anchor) ?? directory;
      } catch {
        // Leave unknown or unavailable legacy paths unbound.
      }
    }
    return { format: 2, ...base, directory };
  }

  private readBinding(record: PortableRecord, bindingId: string, anchor: Anchor) {
    if (!this.safeDirectory(anchor.bindings)) return undefined;
    const file = path.join(anchor.bindings, `${bindingId}.json`);
    try {
      if (!lstatSync(file).isFile()) return undefined;
      const match = localBinding.safeParse(JSON.parse(readFileSync(file, "utf8")));
      return match.success && match.data.spaceId === record.id && match.data.vault === anchor.root && match.data.vaultStamp === anchor.stamp ? match.data : undefined;
    } catch {
      return undefined;
    }
  }

  private project(record: PortableRecord, anchor: Anchor): Space {
    const { directory, format: _format, ...info } = record;
    const base = { ...info, machineId: this.machineId };
    const pending = (reason: "external" | "legacy" | "missing" | "unsafe"): Space => ({ ...base, root: "", binding: { status: "needs-binding", reason } });
    if (!this.anchorIsCurrent(anchor)) return pending("unsafe");
    if (directory.kind === "legacy") return pending("legacy");
    try {
      let root = anchor.root;
      if (directory.kind === "relative") {
        if (normalizeRelPath(directory.path) !== directory.path) return pending("unsafe");
        const candidate = path.join(root, ...directory.path.split("/"));
        if (!this.safeDirectory(candidate)) return pending("unsafe");
        root = canonicalDirectory(candidate);
        if (root !== candidate) return pending("unsafe");
      }
      if (directory.kind === "external") {
        const binding = this.readBinding(record, directory.bindingId, anchor);
        if (!binding || !path.isAbsolute(binding.root)) return pending("external");
        root = canonicalDirectory(binding.root);
        if (root !== binding.root || directoryStamp(root) !== binding.rootStamp) return pending("unsafe");
      }
      return { ...base, root, binding: { status: "bound" } };
    } catch (error) {
      return pending((error as NodeJS.ErrnoException).code === "ENOENT" ? "missing" : "unsafe");
    }
  }

  private view(record: StoredSpace): Space {
    if (!this.anchor) return record as Space;
    return this.project("format" in record ? record : this.migrateRecord(record, this.anchor), this.anchor);
  }

  list(): Space[] {
    return this.records()
      .map((record) => this.view(record))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  private record(id: string): StoredSpace {
    const existing = this.records().find((row) => row.id === id);
    if (!existing) throw errors.notFound(`Space ${id} 不存在`);
    return existing;
  }

  get(id: string): Space {
    return this.view(this.record(id));
  }

  private write(destination: string, contents: string) {
    if (this.anchor?.readOnly) throw errors.readOnlyVault();
    const directory = path.dirname(destination);
    const staging = this.anchor?.bindings ?? directory;
    if (!this.safeDirectory(directory) || !this.safeDirectory(staging)) throw errors.pathOutsideVault(directory);
    mkdirSync(directory, { recursive: true });
    mkdirSync(staging, { recursive: true });
    const temp = path.join(staging, `${randomUUID()}.tmp`);
    try {
      writeFileSync(temp, contents, { flag: "wx" });
      renameSync(temp, destination);
    } finally {
      rmSync(temp, { force: true });
    }
  }

  save(input: SaveInput): Space {
    if (this.anchor?.readOnly) throw errors.readOnlyVault();
    if (!input.name.trim()) throw errors.invalidInput("Space 名称必填");
    if (!path.isAbsolute(input.root)) throw errors.invalidInput("工作目录必须是绝对路径");
    const anchor = this.anchor;
    const requested = path.resolve(input.root);
    const member = anchor && (relativeWithin(anchor.requested, requested) ?? relativeWithin(anchor.root, requested));
    const target = typeof member === "string" && anchor ? path.join(anchor.root, member) : null;
    if (anchor && (input.root.split(/[\\/]/).includes("..") || (target !== null && !this.safeDirectory(target)))) throw errors.pathOutsideVault(input.root);
    let root: string;
    try {
      root = canonicalDirectory(input.root);
    } catch {
      throw errors.invalidInput("工作目录不存在或不是文件夹");
    }
    if (anchor && target !== null && relativeUnder(anchor.root, root) === null) throw errors.pathOutsideVault(input.root);
    const previous = input.id ? this.record(input.id) : undefined;
    if (previous && input.expectedRevision !== undefined && input.expectedRevision !== previous.revision) throw errors.versionConflict(String(previous.revision));
    if (this.list().some((space) => space.root === root && space.id !== input.id)) throw errors.nameConflict("这个目录已有 Space，请从左侧打开");
    const info = { id: previous?.id ?? newId("space"), name: input.name.trim(), createdAt: previous?.createdAt ?? this.now().toISOString(), revision: (previous?.revision ?? 0) + 1 };
    if (!anchor) {
      const legacy = { ...info, root, machineId: this.machineId };
      this.write(this.file(info.id), JSON.stringify(legacy, null, 2));
      return legacy;
    }
    const oldBinding = previous && "format" in previous && previous.directory.kind === "external" ? previous.directory.bindingId : undefined;
    const internal = this.withinVault(root, anchor);
    const retainedBinding = previous && oldBinding && this.view(previous).root === root ? oldBinding : undefined;
    const directory: Directory = internal ?? { kind: "external", bindingId: retainedBinding ?? randomUUID() };
    const newBinding = directory.kind === "external" && directory.bindingId !== oldBinding ? directory.bindingId : undefined;
    if (newBinding) {
      const local: Binding = { vault: anchor.root, vaultStamp: anchor.stamp, spaceId: info.id, root, rootStamp: directoryStamp(root) };
      this.write(path.join(anchor.bindings, `${newBinding}.json`), JSON.stringify(local));
    }
    const next: PortableRecord = { format: 2, ...info, directory };
    try {
      this.write(this.file(info.id), JSON.stringify(next, null, 2));
    } catch (error) {
      if (newBinding) this.dropBinding(newBinding);
      throw error;
    }
    if (oldBinding && (directory.kind !== "external" || directory.bindingId !== oldBinding)) this.dropBinding(oldBinding);
    return this.view(next);
  }

  private dropBinding(bindingId: string) {
    if (this.anchor && this.safeDirectory(this.anchor.bindings)) {
      try {
        rmSync(path.join(this.anchor.bindings, `${bindingId}.json`), { force: true });
      } catch {
        // Stale private bindings cannot be read without their exact portable binding ID.
      }
    }
  }

  delete(id: string): void {
    if (this.anchor?.readOnly) throw errors.readOnlyVault();
    const record = this.record(id);
    if (!this.safeDirectory(this.dir)) throw errors.pathOutsideVault(this.dir);
    if (this.anchor && this.safeDirectory(this.anchor.bindings)) rmSync(path.join(this.anchor.bindings, `${id}.dispatch-write.json`), { force: true });
    rmSync(this.file(id), { force: true });
    if ("format" in record && record.directory.kind === "external") this.dropBinding(record.directory.bindingId);
  }

  /** Default creation and format normalization change configuration only. */
  ensureDefault(vaultRoot: string, name = "Vault"): Space | null {
    const root = canonicalDirectory(vaultRoot);
    if (this.anchor && (root !== this.anchor.root || !this.anchorIsCurrent(this.anchor))) throw errors.pathOutsideVault(vaultRoot);
    if (this.anchor && !this.anchor.readOnly) {
      for (const record of this.records()) {
        if (!("format" in record)) this.write(this.file(record.id), JSON.stringify(this.migrateRecord(record, this.anchor), null, 2));
      }
    }
    const hit = this.list().find((space) => space.root === root);
    const marker = path.join(this.dir, ".default-created");
    if (this.anchor?.readOnly || !this.safeDirectory(this.dir) || existsSync(marker)) return hit ?? null;
    const selected = hit ?? this.save({ name, root });
    this.write(marker, "");
    return selected;
  }

  validateForLaunch(id: string, revision: number): Space {
    const space = this.list().find((row) => row.id === id);
    if (!space) throw new HuhuError("SPACE_INVALID", "Space 不存在");
    if (space.revision !== revision) throw new HuhuError("SPACE_INVALID", "Space 已变化，请重新选择", { details: { currentRevision: space.revision } });
    if (this.anchor && !spaceCanLaunch(space)) throw new HuhuError("SPACE_INVALID", "Space 目录待绑定，请重新选择工作目录", { details: { binding: space.binding } });
    try {
      canonicalDirectory(space.root);
    } catch {
      throw new HuhuError("SPACE_INVALID", "Space 目录不存在或不可访问");
    }
    return space;
  }

  approveDispatchWrite(id: string, revision: number, allowed: boolean): void {
    const space = this.validateForLaunch(id, revision);
    const anchor = this.anchor;
    if (!anchor || anchor.readOnly) throw errors.readOnlyVault();
    const file = path.join(anchor.bindings, `${space.id}.dispatch-write.json`);
    if (!this.safeDirectory(anchor.bindings)) throw errors.pathOutsideVault(anchor.bindings);
    if (allowed) {
      // Do not make the Vault's own metadata/runtime writable to a model.
      const member = relativeWithin(anchor.root, space.root);
      if (relativeWithin(space.root, anchor.root) !== null || (member && protectedKindOf(member.split(path.sep).join("/")))) throw errors.permissionDenied("选择专用工作目录以批准 Agent 写入");
      if (this.dispatchWriteApproval(space)) return;
      this.write(file, this.dispatchWriteIdentity(space, anchor));
    } else {
      rmSync(file, { force: true });
    }
  }

  private dispatchWriteIdentity(space: Space, anchor: Anchor): string {
    return launchHash([anchor.stamp, space.id, space.revision, space.root, directoryStamp(space.root)]);
  }

  dispatchWriteApproval(space: Space): { root: string; rootIdentity: string; files: { path: string; stamp: string }[] } | undefined {
    const anchor = this.anchor;
    if (!anchor || anchor.readOnly || !spaceCanLaunch(space) || !this.safeDirectory(anchor.bindings)) return undefined;
    try {
      const file = path.join(anchor.bindings, `${space.id}.dispatch-write.json`);
      if (!lstatSync(file).isFile() || readFileSync(file, "utf8") !== this.dispatchWriteIdentity(space, anchor)) return undefined;
      const files = [file, this.file(space.id)].map((p) => {
        const stat = statSync(p, { bigint: true });
        return { path: p, stamp: launchHash([p, stat.ino.toString(), stat.size.toString(), stat.mtimeNs.toString()]) };
      });
      return { root: space.root, rootIdentity: directoryStamp(space.root), files };
    } catch {
      return undefined;
    }
  }
}
