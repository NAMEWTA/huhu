import { CapabilityRegistry } from "@huhu/kernel";
import { vi } from "vitest";
import { boot as bootEngine, type RunningEngine } from "../../../../apps/engine/src/boot.js";
import { TestProtection } from "../../../../packages/kernel/test/fixtures/credentials.js";
import { mailOAuthCapabilityDescriptors } from "../../src/engine/index.js";

export type { RunningEngine };

// Exercise the same registry wiring locally while common Engine assembly is owned by Lead.
export function boot(options: Parameters<typeof bootEngine>[0]): ReturnType<typeof bootEngine> {
  const declare = CapabilityRegistry.prototype.declareDescriptors;
  const wiring = vi.spyOn(CapabilityRegistry.prototype, "declareDescriptors").mockImplementation(function (this: CapabilityRegistry, plugin, descriptors) {
    const missing = plugin === "mail" ? Object.values(mailOAuthCapabilityDescriptors).filter(({ name }) => !descriptors.some((descriptor) => descriptor.name === name)) : [];
    return declare.call(this, plugin, [...descriptors, ...missing]);
  });
  try {
    // The shared boot function declares capabilities synchronously before its first await.
    const { desktopUserData, moduleCredentialProtection } = options;
    return bootEngine({
      ...options,
      ...(desktopUserData && !moduleCredentialProtection ? { moduleCredentialProtection: new TestProtection(desktopUserData) } : {}),
    });
  } finally {
    wiring.mockRestore();
  }
}
