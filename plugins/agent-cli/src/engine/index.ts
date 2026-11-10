import type { Context } from "@huhu/cordis";
import { defineCapability as def, type HuhuApi } from "@huhu/kernel";
import { machineId } from "@huhu/vault";
import path from "node:path";
import { z } from "zod";
import { HerdrCore } from "./herdr-core.js";
import { ProviderDetector } from "./providers/index.js";
import { SessionsService } from "./sessions.js";
import { SpaceStore } from "./spaces.js";

export { HerdrCore } from "./herdr-core.js";
export { SessionsService } from "./sessions.js";
export { PROVIDERS, ProviderDetector } from "./providers/index.js";
export { SpaceStore } from "./spaces.js";

const SpaceDto = z.object({ id: z.string(), name: z.string(), root: z.string(), machineId: z.string(), createdAt: z.string(), revision: z.number() });

export interface AgentCliOptions {
  /** herdr-core 可执行文件；缺省读 HUHU_HERDR_BIN，再退回应用资源目录。 */
  herdrBin?: string;
}

export function apply(ctx: Context, api: HuhuApi, opts: AgentCliOptions = {}): { spaces: SpaceStore; detector: ProviderDetector; sessions: SessionsService; core: HerdrCore } {
  const root = api.vault.files.root;
  const spaces = new SpaceStore(path.join(root, ".huhu", "agent-cli", "spaces"), machineId());
  spaces.ensureDefault(root); // 首次进入：默认以 Vault 根为目录的 Space
  const detector = new ProviderDetector();
  const mid = machineId();
  const core = new HerdrCore({ bin: opts.herdrBin ?? process.env["HUHU_HERDR_BIN"] ?? "herdr-core", vaultId: api.vault.vaultId, machineId: mid, runtimeDir: path.join(root, ".huhu", "runtime", mid, "herdr") });
  ctx.effect(() => () => core.dispose()); // 停用只断开连接，不结束 Core
  const sessions = new SessionsService({ dir: path.join(root, ".huhu", "agent-cli", "sessions"), vaultId: api.vault.vaultId, spaces, core: () => core.ensure(), detect: () => detector.detect(), now: () => new Date() });

  api.defineCapability(def({ name: "agent.spaces.list", plugin: "agent-cli", scope: "read", exposable: false, defaultExposed: false, input: z.object({}), output: z.array(SpaceDto), handler: () => spaces.list() }));
  api.defineCapability(def({
    name: "agent.spaces.save", plugin: "agent-cli", scope: "write", exposable: false, defaultExposed: false,
    input: z.object({ id: z.string().optional(), name: z.string(), root: z.string(), expectedRevision: z.number().optional() }), output: SpaceDto,
    handler: (_c, i) => spaces.save({ name: i.name, root: i.root, ...(i.id ? { id: i.id } : {}), ...(i.expectedRevision !== undefined ? { expectedRevision: i.expectedRevision } : {}) }),
  }));
  api.defineCapability(def({ name: "agent.spaces.delete", plugin: "agent-cli", scope: "write", exposable: false, defaultExposed: false, input: z.object({ id: z.string() }), output: z.object({ ok: z.literal(true) }), handler: (_c, i) => (spaces.delete(i.id), { ok: true as const }) }));
  api.defineCapability(def({
    name: "agent.providers.detect", plugin: "agent-cli", scope: "read", exposable: false, defaultExposed: false,
    input: z.object({ refresh: z.boolean().optional() }),
    output: z.array(z.object({ provider: z.string(), displayName: z.string(), status: z.string(), exe: z.string().nullable(), version: z.string().nullable(), checkedAt: z.string(), headless: z.boolean(), models: z.array(z.object({ id: z.string(), label: z.string(), efforts: z.array(z.string()), fast: z.boolean() })) })),
    handler: (_c, i) => detector.detect(i.refresh === true),
  }));

  const Session = z.object({ id: z.string(), spaceId: z.string(), provider: z.string(), model: z.string().nullable(), state: z.string(), requestId: z.string(), terminalId: z.string().nullable(), name: z.string(), cwd: z.string(), createdAt: z.string(), error: z.string().optional() });
  const Id = z.object({ id: z.string() });
  const Ok = z.object({ ok: z.literal(true) });
  api.defineCapability(def({
    name: "agent.sessions.launch", plugin: "agent-cli", scope: "execute", exposable: false, defaultExposed: false,
    input: z.object({ spaceId: z.string(), spaceRevision: z.number(), provider: z.enum(["claude", "claude-agent-teams", "codex", "pi", "shell"]), model: z.string().optional(), effort: z.string().optional(), fast: z.boolean().optional(), prompt: z.string().optional(), requestId: z.string().min(8) }), output: Session,
    handler: (_c, i) => sessions.launch(i),
  }));
  api.defineCapability(def({ name: "agent.sessions.list", plugin: "agent-cli", scope: "read", exposable: false, defaultExposed: false, input: z.object({ spaceId: z.string().optional() }), output: z.array(Session), handler: (_c, i) => sessions.list(i.spaceId) }));
  api.defineCapability(def({ name: "agent.sessions.interrupt", plugin: "agent-cli", scope: "execute", exposable: false, defaultExposed: false, input: Id, output: Ok, handler: async (_c, i) => (await sessions.interrupt(i.id), { ok: true as const }) }));
  api.defineCapability(def({ name: "agent.sessions.kill", plugin: "agent-cli", scope: "execute", exposable: false, defaultExposed: false, input: Id, output: Ok, handler: async (_c, i) => (await sessions.kill(i.id), { ok: true as const }) }));
  api.defineCapability(def({ name: "agent.sessions.rename", plugin: "agent-cli", scope: "write", exposable: false, defaultExposed: false, input: Id.extend({ name: z.string() }), output: Session, handler: (_c, i) => sessions.rename(i.id, i.name) }));
  api.defineCapability(def({ name: "agent.core.status", plugin: "agent-cli", scope: "read", exposable: false, defaultExposed: false, input: z.object({}), output: z.object({ state: z.string(), version: z.string().nullable(), error: z.string().optional() }), handler: () => core.status() }));
  return { spaces, detector, sessions, core };
}
