import { randomUUID } from "node:crypto";
import { readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { errors, HuhuError, MCP_HTTP_PATH, McpLocalPortSchema, type GatewayMcpStatus } from "@huhu/contracts";
import type { GatewayTokens } from "@huhu/kernel";
import { endpointRootBinding, type Vault } from "@huhu/vault";
import { z } from "zod";

const ListenerSettings = z.strictObject({
  format: z.literal(1),
  vaultId: z.string(),
  rootBinding: z.string(),
  port: McpLocalPortSchema,
});

/** The existing Engine listener remains the only endpoint for this local Vault instance. */
export class LocalMcpListener {
  private readonly settingsFile: string;
  private readonly rootBinding: string;
  private configuredPort: number | null;
  private activePort: number | null = null;

  constructor(
    private readonly vault: Vault,
    private readonly tokens: GatewayTokens,
  ) {
    this.settingsFile = path.join(vault.runtimeDir, "mcp-listener.json");
    this.rootBinding = endpointRootBinding(vault.root);
    this.configuredPort = vault.readOnly ? null : this.read();
  }

  get port(): number | null {
    return this.configuredPort;
  }

  enabled(): boolean {
    return !this.vault.readOnly && this.activePort !== null && this.tokens.mcp().enabled;
  }

  bound(port: number): void {
    this.activePort = McpLocalPortSchema.safeParse(port).success ? port : null;
    if (this.enabled() && this.configuredPort === null && this.activePort !== null) this.save(this.activePort);
  }

  status(): GatewayMcpStatus {
    const { activePort, configuredPort } = this;
    return {
      enabled: this.enabled(),
      url: activePort === null ? null : `http://127.0.0.1:${activePort}${MCP_HTTP_PATH}`,
      activePort,
      configuredPort,
      restartRequired: configuredPort !== null && activePort !== configuredPort,
    };
  }

  update({ enabled, port }: { enabled: boolean; port?: number }): GatewayMcpStatus {
    this.vault.assertWritable();
    if (enabled && this.activePort === null) throw errors.invalidInput("当前 Engine 端口不可用于 MCP");
    const next = port ?? this.configuredPort ?? (enabled ? this.activePort : null);
    if (next !== null && next !== this.configuredPort) this.save(next);
    this.tokens.setMcp(enabled);
    return this.status();
  }

  private read(): number | null {
    let bytes: string;
    try {
      bytes = readFileSync(this.settingsFile, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
    try {
      const saved = ListenerSettings.parse(JSON.parse(bytes));
      return saved.vaultId === this.vault.id && saved.rootBinding === this.rootBinding ? saved.port : null;
    } catch {
      throw new HuhuError("INVALID_INPUT", "本机 MCP 端口设置损坏", { details: { path: this.settingsFile } });
    }
  }

  private save(port: number): void {
    const saved = ListenerSettings.parse({ format: 1, vaultId: this.vault.id, rootBinding: this.rootBinding, port });
    const temporary = `${this.settingsFile}.${randomUUID()}.tmp`;
    try {
      writeFileSync(temporary, JSON.stringify(saved) + "\n", { flag: "wx", mode: 0o600, flush: true });
      renameSync(temporary, this.settingsFile);
      this.configuredPort = port;
    } finally {
      rmSync(temporary, { force: true });
    }
  }
}
