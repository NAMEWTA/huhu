import { readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { type Vault } from "@huhu/vault";
import { z } from "zod";
import { ModuleCredentials } from "../../src/credentials/module-credentials.js";
import { LocalProtectionError, type LocalCredentialProtection } from "../../src/credentials/protection.js";
import { identityHash } from "../../src/credentials/versions.js";

export const definition = { name: "Same name", host: "test.invalid" };
const schema = z.strictObject({ name: z.string(), host: z.string() });

/** Persistent synthetic backend for subprocess tests. Never pass it real credentials. */
export class TestProtection implements LocalCredentialProtection {
  unavailable: LocalProtectionError["reason"] | undefined;
  beforeRemove?: () => void;
  afterCreate?: () => void;

  constructor(readonly directory: string) {}

  async read(id: string): Promise<Buffer | null> {
    if (this.unavailable) throw new LocalProtectionError(this.unavailable);
    try {
      return readFileSync(this.file(id));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }

  async create(id: string, key: Buffer): Promise<void> {
    if (this.unavailable) throw new LocalProtectionError(this.unavailable);
    writeFileSync(this.file(id), key, { flag: "wx", mode: 0o600 });
    this.afterCreate?.();
  }

  async remove(id: string): Promise<void> {
    this.beforeRemove?.();
    rmSync(this.file(id), { force: true });
  }

  keys(): string[] {
    return readdirSync(this.directory).sort();
  }

  file(id: string): string {
    return path.join(this.directory, identityHash(id));
  }
}

export function owner(vault: Vault, base: string, localVaultInstanceId = "instance-a", pluginId = "test.ssh", protection = new TestProtection(path.join(base, "backend"))) {
  return new ModuleCredentials({
    vault,
    localRoot: path.join(base, "private"),
    localVaultInstanceId,
    pluginId,
    protection,
    definition: schema,
    targets: ({ host }) => ({ password: `ssh://${host}:22`, passphrase: "" }),
  });
}
