import { createHash } from "node:crypto";
import { lstatSync, mkdirSync, realpathSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { LocalProtectionError, type CredentialOwner, type LocalCredentialProtection } from "@huhu/kernel";
import type { Vault } from "@huhu/vault";

type Keyring = typeof import("@napi-rs/keyring");
const require = createRequire(import.meta.url);
const namespace = "HUHU.Workbench.ModuleCredentials.v1";

class SystemCredentialProtection implements LocalCredentialProtection {
  private keyring: Keyring | undefined;

  private entry(keyId: string) {
    this.keyring ??= require("@napi-rs/keyring") as Keyring;
    // Linux must keep data keys across restarts. Disable keyring's in-memory keyutils fallback.
    return new this.keyring.Entry(namespace, keyId, { linux: { store: "secret-service" } });
  }

  async read(keyId: string): Promise<Buffer | null> {
    try {
      const secret = this.entry(keyId).getSecret();
      if (secret === null) return null;
      try {
        return Buffer.from(secret);
      } finally {
        secret.fill(0);
      }
    } catch {
      throw new LocalProtectionError("unavailable");
    }
  }

  async create(keyId: string, key: Buffer): Promise<void> {
    try {
      const entry = this.entry(keyId);
      const existing = entry.getSecret();
      if (existing !== null) {
        existing.fill(0);
        throw new LocalProtectionError("unavailable");
      }
      entry.setSecret(key);
    } catch {
      throw new LocalProtectionError("unavailable");
    }
  }

  async remove(keyId: string): Promise<void> {
    try {
      this.entry(keyId).deleteCredential();
    } catch {
      throw new LocalProtectionError("unavailable");
    }
  }
}

export type ModuleCredentialHost = Pick<CredentialOwner<unknown>, "localRoot" | "localVaultInstanceId" | "protection">;

/** App-private host configuration, available only to the Engine's trusted module assembly. */
export function createModuleCredentialHost(vault: Vault, userData: string, protection: LocalCredentialProtection = new SystemCredentialProtection()): ModuleCredentialHost | undefined {
  try {
    if (!path.isAbsolute(userData)) return undefined;
    const localRoot = path.join(realpathSync.native(userData), "module-credentials");
    const root = realpathSync.native(vault.root);
    const relative = path.relative(root, localRoot);
    if (relative === "" || (!path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`))) return undefined;
    const current = lstatSync(localRoot, { throwIfNoEntry: false });
    if (current ? !current.isDirectory() : vault.readOnly) return undefined;
    const stat = statSync(root, { bigint: true });
    if (stat.ino === 0n || stat.birthtimeNs <= 0n) return undefined;
    if (!current) mkdirSync(localRoot, { mode: 0o700, recursive: true });
    // A copy of the portable ID in a new directory gets a distinct local binding.
    const identity = [vault.id, stat.dev.toString(), stat.ino.toString(), stat.birthtimeNs.toString()];
    const localVaultInstanceId = createHash("sha256").update(JSON.stringify(identity)).digest("hex");
    return { localRoot, localVaultInstanceId, protection };
  } catch {
    return undefined;
  }
}
