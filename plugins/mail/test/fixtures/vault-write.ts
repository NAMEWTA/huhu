import type { VaultFiles } from "@huhu/vault";
import { vi } from "vitest";

type ReservedWriteBoundary = { writeChecked: VaultFiles["write"] };

/** The checked writer runs only after either a single or a journaled reservation. */
export function interceptReservedVaultWrite(files: VaultFiles, before: (relative: string) => void | Promise<void>) {
  const boundary = files as unknown as ReservedWriteBoundary;
  const write = boundary.writeChecked.bind(files);
  return vi.spyOn(boundary, "writeChecked").mockImplementation(async (...args) => {
    await before(args[0]);
    return write(...args);
  });
}
