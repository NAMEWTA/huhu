import { randomUUID } from "node:crypto";
import { mkdirSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { VaultFiles } from "../../../packages/vault/src/write.js";
import { deriveKek, keyCheck, newDataKey, newKdf, open, seal } from "../src/engine/crypto.js";
import { SafeStore, wrappingContext } from "../src/engine/store.js";

/** Generate the retired on-disk shape for compatibility regressions in a test-owned Vault. */
export async function writeLegacyItem(root: string, input: { masterPassword: string; value: string; type: "password" | "ssh-key" | "token" | "env"; allowedModules: string[] }) {
  const vault = realpathSync.native(root);
  if (path.dirname(vault).toLowerCase() !== realpathSync.native(tmpdir()).toLowerCase() || !path.basename(vault).startsWith("huhu-")) throw new Error("Expected an isolated Safe test Vault");
  const dir = path.join(vault, ".huhu", "safe");
  const state = new SafeStore(new VaultFiles(vault), dir).load();
  if (state.kind === "corrupt") throw new Error("Corrupt Safe test fixture");
  const now = "2026-11-20T00:00:00.000Z";
  const kdf = state.kind === "ready" ? state.ring.kdf : newKdf({ N: 2 ** 10, r: 8, p: 1 });
  const kek = await deriveKek(input.masterPassword, kdf);
  try {
    const dk = state.kind === "ready" ? open(kek, Buffer.from(state.ring.wrappedKey, "base64"), wrappingContext(state.ring)) : newDataKey();
    try {
      if (state.kind === "empty") {
        mkdirSync(dir, { recursive: true });
        const ring = { kdf, wrappedKey: seal(kek, dk, "huhu-safe/dk").toString("base64"), keyCheck: keyCheck(dk), autoLockMinutes: 5, lockOnLeave: false, createdAt: now };
        writeFileSync(path.join(dir, "keyring.json"), JSON.stringify(ring), { flag: "wx" });
      }
      const id = `item-${randomUUID()}`;
      const metadataPath = path.join(dir, "items", `${id}.json`);
      const sealedPath = path.join(dir, "sealed", `${id}.bin`);
      mkdirSync(path.dirname(metadataPath), { recursive: true });
      mkdirSync(path.dirname(sealedPath), { recursive: true });
      writeFileSync(metadataPath, JSON.stringify({ id, name: "Synthetic legacy item", type: input.type, account: "", allowedModules: input.allowedModules, updatedAt: now }), { flag: "wx" });
      writeFileSync(sealedPath, seal(dk, Buffer.from(input.value), `item:${id}`), { flag: "wx" });
      return { id, reference: `safe://${id}`, metadataPath, sealedPath };
    } finally {
      dk.fill(0);
    }
  } finally {
    kek.fill(0);
  }
}
