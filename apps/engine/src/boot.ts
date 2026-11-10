import { mkdirSync, rmSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  CapabilityRegistry, Dispatcher, EventBus, GatewayAudit, IdempotencyStore, TokenTable, defineCapability, startEngineServer, type RunningServer,
} from "@huhu/kernel";
import { Vault } from "@huhu/vault";
import { z } from "zod";

export interface EndpointDescriptor {
  pid: number;
  port: number;
  vaultId: string;
  cliToken: string;
  startedAt: string;
}

export interface BootOptions {
  vaultPath: string;
  create?: boolean;
  readOnly?: boolean;
  port?: number;
  /** 无界面模式：最后一个客户端离开后空闲这么久自行退出（毫秒，0 = 不自动退出）。 */
  idleExitMs?: number;
}

export interface RunningEngine {
  vault: Vault;
  port: number;
  rendererToken: string;
  cliToken: string;
  descriptorPath: string;
  server: RunningServer;
  dispatcher: Dispatcher;
  registry: CapabilityRegistry;
  events: EventBus;
  /** 按顺序关闭：拒绝新写 → 通知客户端 → 停服务 → 释放锁 → 删除端点描述。 */
  shutdown(): Promise<void>;
}

const VaultInfoOutput = z.object({ id: z.string(), name: z.string(), readOnly: z.boolean(), formatVersion: z.number(), counts: z.record(z.string(), z.number()) });

export function endpointPath(vault: Vault): string {
  return path.join(vault.runtimeDir, "engine.json");
}

/** 读取端点描述；进程已不存在时视为陈旧并删除。 */
export function readLiveEndpoint(vault: Pick<Vault, "runtimeDir">): EndpointDescriptor | null {
  const file = path.join(vault.runtimeDir, "engine.json");
  if (!existsSync(file)) return null;
  try {
    const d = JSON.parse(readFileSync(file, "utf8")) as EndpointDescriptor;
    process.kill(d.pid, 0);
    return d;
  } catch {
    rmSync(file, { force: true });
    return null;
  }
}

export async function boot(opts: BootOptions): Promise<RunningEngine> {
  const vault = await Vault.open(opts.vaultPath, { ...(opts.create !== undefined ? { create: opts.create } : {}), ...(opts.readOnly !== undefined ? { readOnly: opts.readOnly } : {}) });
  const runtime = vault.runtimeDir;
  mkdirSync(runtime, { recursive: true });

  const registry = new CapabilityRegistry();
  registry.register(
    defineCapability({
      name: "vault.info", plugin: "kernel", scope: "read", input: z.object({}), output: VaultInfoOutput, exposable: true, defaultExposed: true,
      handler: () => ({ id: vault.id, name: vault.info.name, readOnly: vault.readOnly, formatVersion: vault.info.formatVersion, counts: {} }),
    }),
  );

  const events = new EventBus(() => vault.id);
  const tokens = new TokenTable();
  const rendererToken = tokens.issue("desktop");
  const cliToken = tokens.issue("cli");
  const real = new Dispatcher({
    registry,
    audit: new GatewayAudit(path.join(runtime, "gateway-audit.ndjson")),
    idempotency: new IdempotencyStore(path.join(runtime, "idempotency.ndjson")),
    isPluginEnabled: () => true,
    exposureOverride: () => undefined,
    grantedPermissions: () => [],
  });

  const server = await startEngineServer({ dispatcher: real, registry, tokens, events, visibleTo: (caller, name) => caller === "desktop" || (registry.get(name)?.exposable === true && registry.get(name)?.defaultExposed === true), ...(opts.port !== undefined ? { port: opts.port } : {}) });

  const descriptorPath = endpointPath(vault);
  const descriptor: EndpointDescriptor = { pid: process.pid, port: server.port, vaultId: vault.id, cliToken, startedAt: new Date().toISOString() };
  writeFileSync(descriptorPath, JSON.stringify(descriptor), { mode: 0o600 });

  let closed: Promise<void> | undefined;
  const shutdown = () =>
    (closed ??= (async () => {
      real.beginClose();
      events.publish("engine.closing", {});
      await server.close();
      rmSync(descriptorPath, { force: true });
      await vault.close();
    })());

  return { vault, port: server.port, rendererToken, cliToken, descriptorPath, server, dispatcher: real, registry, events, shutdown };
}
