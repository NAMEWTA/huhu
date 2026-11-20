import { errors } from "@huhu/contracts";
import type { HuhuApi } from "@huhu/kernel";
import { z } from "zod";
import { defaultVaultPreferences, VaultPreferences, type VaultPreferencesSnapshot, type UpdateVaultPreferences } from "../shared/preferences.js";

const FILE = ".huhu/ssh/preferences.json";
const State = z.strictObject({ version: z.literal(1), values: VaultPreferences });

export class SshPreferences {
  constructor(private readonly files: HuhuApi["vault"]["files"]) {}

  get(): VaultPreferencesSnapshot {
    const file = this.files.read(FILE);
    if (!file) {
      if (this.files.exists(FILE)) throw errors.invalidInput("SSH 设置路径应为普通文件");
      return { revision: null, values: defaultVaultPreferences };
    }
    try {
      const { values } = State.parse(JSON.parse(file.bytes.toString("utf8")));
      return { revision: file.version, values };
    } catch {
      throw errors.invalidInput("SSH 设置文件格式无效");
    }
  }

  runtime(): VaultPreferences {
    try {
      return this.get().values;
    } catch {
      return defaultVaultPreferences;
    }
  }

  async update({ expectedRevision, change }: UpdateVaultPreferences, signal: AbortSignal) {
    const current = this.get();
    if (current.revision !== expectedRevision) throw errors.versionConflict(current.revision ?? "");
    const values = { ...current.values, [change.section]: change.values };
    signal.throwIfAborted();
    const file = await this.files.write(FILE, Buffer.from(JSON.stringify({ version: 1, values }, null, 2) + "\n"), { expectedVersion: expectedRevision });
    return { values, revision: file.version };
  }
}
