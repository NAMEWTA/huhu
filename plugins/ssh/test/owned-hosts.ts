import { randomUUID } from "node:crypto";
import type { SshHostProfile } from "../src/engine/auth-profile.js";
import type { ManagedHost } from "../src/engine/host-configurations.js";
import { validateHost } from "../src/engine/hosts.js";

export function ownedHosts() {
  const hosts = new Map<string, ManagedHost>();
  const list = () => [...hosts.values()];
  return {
    list,
    save(input: SshHostProfile & { id?: string }) {
      const { id = `host-owned-${randomUUID().replaceAll("-", "")}`, ...profile } = input;
      const host: ManagedHost = {
        ...validateHost(profile, id, list()),
        id,
        revision: randomUUID(),
        configId: randomUUID(),
        auth: { kind: "password", source: "ssh" },
        authState: { password: "configured" },
        configured: true,
      };
      hosts.set(id, host);
      return host;
    },
  };
}
