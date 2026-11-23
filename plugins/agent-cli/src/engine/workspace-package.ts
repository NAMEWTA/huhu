import { createHash, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { errors, HuhuError } from "@huhu/contracts";
import { HerdrCore, type HerdrClient } from "@huhu/herdr-client";
import { machineId, type Vault, type VaultFiles } from "@huhu/vault";
import { z } from "zod";
import { leaves, SpaceLayoutSchema, WORKSPACE_DOCUMENT, WorkspaceDocumentSchema, type Pane, type SpaceLayout } from "../shared/workspace-layout.js";
import { SpaceStore } from "./spaces.js";

export const workspacePackagePath = ".huhu/agent-cli/workspace-layout.snapshot.json";
const catalog = ".huhu/agent-cli/spaces";
const maxDocumentBytes = 1024 * 1024;
const envelope = z.strictObject({ version: z.int().nonnegative(), value: z.unknown() });
const portable = z
  .strictObject({ format: z.literal(1), spaces: z.record(z.string().regex(/^space-[a-z0-9]+$/u), SpaceLayoutSchema) })
  .refine(({ spaces }) => Object.values(spaces).every(({ tabs }) => tabs.every(({ pane }) => leaves(pane).every(({ sessionId }) => sessionId === null))));

export function agentCoreOptions(vaultId: string, stateDir: string, bin = process.env["HUHU_HERDR_BIN"] ?? "herdr-core") {
  const machine = machineId();
  return { bin, vaultId, machineId: machine, runtimeDir: path.join(stateDir, "runtime", machine, "herdr") };
}

function parseDocument(input: unknown) {
  const reply = envelope.safeParse(input);
  if (!reply.success) throw new HuhuError("INTERNAL", "无法核对 Core 保存的工作区布局");
  const { version, value } = reply.data;
  const parsed = WorkspaceDocumentSchema.safeParse(value ?? { format: 1, spaces: {} });
  if (!parsed.success) throw errors.invalidInput("工作区布局格式无效，已保留原文档");
  return { version, value: parsed.data };
}

export async function readWorkspaceDocument(client: HerdrClient, signal?: AbortSignal) {
  return parseDocument(await client.call("doc.get", { name: WORKSPACE_DOCUMENT }, signal));
}

export function readWorkspacePackage(files: VaultFiles) {
  const entry = files.read(workspacePackagePath);
  if (!entry) return undefined;
  try {
    if (entry.bytes.length <= maxDocumentBytes) return portable.parse(JSON.parse(entry.bytes.toString("utf8"))).spaces;
  } catch {
    // Report only the package entry, not its potentially malformed contents.
  }
  throw errors.invalidInput("工作区布局快照无效或超过 1 MiB");
}

function catalogSpaces(files: VaultFiles) {
  return new SpaceStore(files.abs(catalog), machineId(), undefined, { vaultRoot: files.root, readOnly: true }).list();
}

export function validateWorkspacePackage(files: VaultFiles, restored: ReadonlyMap<string, string>) {
  for (const name of restored.keys()) {
    if (name.toLowerCase() === workspacePackagePath && name !== workspacePackagePath) throw errors.invalidInput("工作区布局快照路径无效");
  }
  if (!restored.has(workspacePackagePath)) return;
  const snapshot = readWorkspacePackage(files);
  const spaces = new Set(catalogSpaces(files).map(({ id }) => id));
  if (!snapshot || Object.keys(snapshot).some((id) => !spaces.has(id) || !restored.has(`${catalog}/${id}.json`))) throw errors.invalidInput("工作区布局快照引用了数据包中不存在的 Space");
}

function projectLayout({ tabs }: SpaceLayout): SpaceLayout {
  let nextId = 0;
  function projectPane(node: Pane): Pane {
    const id = `restored-pane-${++nextId}`;
    if (node.kind === "leaf") return { kind: "leaf", id, sessionId: null, ...((node.sessionId || node.unbound) && { unbound: true as const }) };
    return { kind: "split", id, axis: node.axis, ratio: node.ratio, first: projectPane(node.first), second: projectPane(node.second) };
  }
  return { tabs: tabs.map(({ pane }, index) => ({ id: `restored-tab-${index + 1}`, pane: projectPane(pane) })) };
}

const unavailable = () => new HuhuError("HERDR_UNAVAILABLE", "无法核对已保存的工作区布局，请重新导出", { retryable: true });

async function stopExportCore(core: HerdrCore, runtimeDir: string) {
  try {
    await core.stop({ requireConfirmation: true });
  } catch {
    throw new HuhuError("HERDR_UNAVAILABLE", "无法确认本次导出使用的临时 Core 已停止", {
      retryable: false,
      details: { outcome: "unknown", cleanup: { endpoint: core.endpoint, runtimeDir } },
    });
  }
}

async function readColdWorkspace(files: VaultFiles, options: ReturnType<typeof agentCoreOptions>, signal: AbortSignal) {
  const documentPath = `.huhu/runtime/${options.machineId}/herdr/state/herdr-core/huhu/docs.json`;
  const persisted = files.read(documentPath);
  if (!persisted) {
    if (files.exists(`${documentPath}.bad`)) throw unavailable();
    return undefined;
  }
  const records = z.record(z.string(), z.unknown()).parse(JSON.parse(persisted.bytes.toString("utf8")));
  const input = records[WORKSPACE_DOCUMENT];
  if (input === undefined) return undefined;
  const expected = parseDocument(input);
  signal.throwIfAborted();

  // A unique socket and a state directory containing only this document give the export exclusive ownership.
  const runtimeDir = await mkdtemp(path.join(tmpdir(), "huhu-workspace-export-"));
  const core = new HerdrCore({ ...options, runtimeDir, socketName: `huhu-export-${randomUUID().replaceAll("-", "")}` });
  let attempted = false;
  try {
    const state = path.join(runtimeDir, "state", "herdr-core", "huhu");
    await mkdir(state, { recursive: true, mode: 0o700 });
    await writeFile(path.join(state, "docs.json"), JSON.stringify({ [WORKSPACE_DOCUMENT]: expected }), { flag: "wx", mode: 0o600 });
    signal.throwIfAborted();
    attempted = true;
    // Join startup even if the export is cancelled, so cleanup cannot race a later daemon spawn.
    const client = await core.ensure();
    signal.throwIfAborted();
    const result = await readWorkspaceDocument(client, signal);
    if (result.version !== expected.version) throw unavailable();
    return result;
  } finally {
    if (attempted) await stopExportCore(core, runtimeDir);
    await rm(runtimeDir, { recursive: true, force: true });
  }
}

export async function workspacePackageSnapshot(vault: Pick<Vault, "id" | "files">, signal: AbortSignal, existing?: HerdrCore) {
  const options = agentCoreOptions(vault.id, path.join(vault.files.root, ".huhu"));
  const core = existing ?? new HerdrCore(options);
  try {
    const client = await core.peek(signal);
    if (client === null) throw unavailable();
    const accepted = client === "absent" ? await readColdWorkspace(vault.files, options, signal) : await readWorkspaceDocument(client, signal);
    signal.throwIfAborted();
    const layouts = accepted?.version ? accepted.value.spaces : readWorkspacePackage(vault.files);
    if (!layouts) return undefined;
    const spaces = Object.fromEntries(catalogSpaces(vault.files).flatMap(({ id }) => (layouts[id] ? [[id, projectLayout(layouts[id])]] : [])));
    const spaceIds = Object.keys(spaces);
    if (!spaceIds.length) return undefined;
    const bytes = Buffer.from(JSON.stringify(portable.parse({ format: 1, spaces })) + "\n");
    if (bytes.length > maxDocumentBytes) throw errors.invalidInput("工作区布局快照超过 1 MiB");
    const spaceFiles = new Map<string, string>();
    for (const id of spaceIds) {
      const relative = `${catalog}/${id}.json`;
      const source = vault.files.read(relative);
      if (!source) throw new HuhuError("VERSION_CONFLICT", "备份期间工作区已变化，请重新导出", { retryable: true });
      spaceFiles.set(relative, createHash("sha256").update(source.bytes).digest("hex"));
    }
    return { bytes, spaceFiles };
  } catch (error) {
    if (error instanceof HuhuError && error.details?.["outcome"] === "unknown") throw error;
    signal.throwIfAborted();
    if (error instanceof HuhuError && error.retryable) throw error;
    throw unavailable();
  } finally {
    if (!existing) core.dispose();
  }
}
