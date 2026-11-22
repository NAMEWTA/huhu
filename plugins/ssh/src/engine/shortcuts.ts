import { lstatSync } from "node:fs";
import { errors, isHuhuError } from "@huhu/contracts";
import { bindCapability, defineCapabilityDescriptor, type HuhuApi } from "@huhu/kernel";
import { z } from "zod";
import { MAX_SHORTCUT_LIBRARY_BYTES, SaveShortcuts, SHORTCUTS_CHANGED, ShortcutLibrary, ShortcutLibraryFile, shortcutNames } from "../shared/shortcuts.js";

const FILE = ".huhu/ssh/shortcuts.json";
const TOO_LARGE = "快捷文本库超过 256 KiB";

export class SshShortcuts {
  constructor(private readonly files: HuhuApi["vault"]["files"]) {}

  list(): ShortcutLibrary {
    const stat = lstatSync(this.files.abs(FILE), { throwIfNoEntry: false });
    if (!stat) return { revision: null, shortcuts: [] };
    if (!stat.isFile()) throw errors.invalidInput("快捷文本库路径应为普通文件");
    if (stat.size > MAX_SHORTCUT_LIBRARY_BYTES) throw errors.invalidInput(TOO_LARGE);
    const file = this.files.read(FILE);
    if (!file) throw errors.versionConflict("");
    if (file.bytes.byteLength > MAX_SHORTCUT_LIBRARY_BYTES) throw errors.invalidInput(TOO_LARGE);
    try {
      const { shortcuts } = ShortcutLibraryFile.parse(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(file.bytes)));
      return { revision: file.version, shortcuts };
    } catch {
      throw errors.invalidInput("快捷文本库格式无效");
    }
  }

  async save(input: SaveShortcuts, signal: AbortSignal, assertCurrent?: () => void): Promise<ShortcutLibrary> {
    signal.throwIfAborted();
    const parsed = SaveShortcuts.safeParse(input);
    if (!parsed.success) throw errors.invalidInput("快捷文本格式无效");
    const { shortcuts, expectedRevision } = parsed.data;
    const bytes = Buffer.from(JSON.stringify({ version: 1, shortcuts }) + "\n");
    if (bytes.byteLength > MAX_SHORTCUT_LIBRARY_BYTES) throw errors.invalidInput(TOO_LARGE);
    const current = this.list();
    if (current.revision !== expectedRevision) throw errors.versionConflict(current.revision ?? "");
    try {
      const { version } = await this.files.write(FILE, bytes, {
        expectedVersion: expectedRevision,
        beforeCommit() {
          signal.throwIfAborted();
          assertCurrent?.();
        },
      });
      return { revision: version, shortcuts };
    } catch (error) {
      // VaultFiles distinguishes a competing creation or deletion from a replacement.
      if (isHuhuError(error) && (error.code === "NAME_CONFLICT" || error.code === "NOT_FOUND")) {
        throw errors.versionConflict(this.list().revision ?? "");
      }
      throw error;
    }
  }
}

const tool = { plugin: "ssh", exposable: true, defaultExposed: false, individualExposure: true } as const;
export const sshShortcutDescriptors = {
  shortcutsList: defineCapabilityDescriptor({
    ...tool,
    name: shortcutNames.list,
    title: "读取 SSH 快捷文本库",
    description: "读取当前 Vault 内的快捷文本及其顺序。",
    scope: "read",
    risk: "high",
    input: z.strictObject({}),
    output: ShortcutLibrary,
  }),
  shortcutsSave: defineCapabilityDescriptor({
    ...tool,
    name: shortcutNames.save,
    title: "保存 SSH 快捷文本库",
    description: "按版本保存当前 Vault 的快捷文本和顺序。",
    scope: "write",
    risk: "high",
    input: SaveShortcuts,
    output: ShortcutLibrary,
  }),
};

export function registerShortcuts(api: Pick<HuhuApi, "defineCapability" | "events"> & { vault: Pick<HuhuApi["vault"], "files"> }): void {
  const store = new SshShortcuts(api.vault.files);
  api.defineCapability(bindCapability(sshShortcutDescriptors.shortcutsList, () => store.list()));
  api.defineCapability(
    bindCapability(sshShortcutDescriptors.shortcutsSave, async ({ signal, assertCapabilityCurrent }, input) => {
      const saved = await store.save(input, signal, assertCapabilityCurrent);
      api.events.publish("entity.changed", { kind: SHORTCUTS_CHANGED, id: "library", op: "updated" });
      return saved;
    }),
  );
}
