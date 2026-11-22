import { errors } from "@huhu/contracts";
import { bindCapability, defineCapabilityDescriptor, type CapabilityContext, type HuhuApi } from "@huhu/kernel";
import { z } from "zod";
import { KnownHostAuthorities, KnownHostAuthority } from "../shared/trust.js";
import { HostRevision } from "./auth-profile.js";
import type { HostConfigurations } from "./host-configurations.js";
import type { SshManager } from "./manager.js";
import { readPortableHosts } from "./public-resources.js";

const desktop = { plugin: "ssh", desktopOnly: true, exposable: false, defaultExposed: false } as const;
const ExpectedRevision = z.strictObject({ expectedTrustRevision: KnownHostAuthorities.shape.revision });

export const sshHostAuthorityDescriptors = {
  knownHostAuthoritiesList: defineCapabilityDescriptor({
    ...desktop,
    name: "ssh.knownHosts.authorities.list",
    title: "查看 SSH 主机证书 CA",
    description: "读取本 Vault 批准的主机证书 CA、指纹以及适用的地址范围。",
    scope: "read",
    risk: "high",
    input: z.strictObject({}),
    output: KnownHostAuthorities,
  }),
  knownHostAuthoritiesAdd: defineCapabilityDescriptor({
    ...desktop,
    name: "ssh.knownHosts.authorities.add",
    title: "批准 SSH 主机证书 CA",
    description: "在桌面核对后，将 Ed25519 CA 绑定到一个已保存的主机地址和端口。",
    scope: "admin",
    risk: "high",
    input: ExpectedRevision.extend({
      ...HostRevision.shape,
      publicKey: z
        .string()
        .min(1)
        .max(64 * 1024),
    }),
    output: KnownHostAuthorities,
  }),
  knownHostAuthoritiesRemove: defineCapabilityDescriptor({
    ...desktop,
    name: "ssh.knownHosts.authorities.remove",
    title: "移除 SSH 主机证书 CA",
    description: "按当前信任版本、适用范围和指纹移除一条 CA 记录。",
    scope: "admin",
    risk: "high",
    input: ExpectedRevision.extend({ authority: KnownHostAuthority }),
    output: KnownHostAuthorities,
  }),
};

function requireDesktop({ caller }: CapabilityContext): void {
  if (caller !== "desktop") throw errors.permissionDenied("SSH 主机证书 CA 管理");
}

export function registerHostAuthorities(api: HuhuApi, hosts: HostConfigurations, manager: SshManager): void {
  const descriptors = sshHostAuthorityDescriptors;
  const files = api.vault.files;
  function publish() {
    api.events.publish("entity.changed", { kind: "ssh-known-hosts", id: "authorities", op: "updated" });
  }
  api.defineCapability(
    bindCapability(descriptors.knownHostAuthoritiesList, (context) => {
      requireDesktop(context);
      return manager.knownAuthorities();
    }),
  );
  api.defineCapability(
    bindCapability(descriptors.knownHostAuthoritiesAdd, (context, { hostId, expectedRevision, expectedTrustRevision, publicKey }) => {
      requireDesktop(context);
      files.assertWritable();
      return hosts.withStableDirectory(async () => {
        const [host] = readPortableHosts(files, new Set([hostId]));
        if (!host) throw errors.notFound("SSH 主机");
        if (host.revision !== expectedRevision) throw errors.versionConflict(host.revision);
        const result = await manager.addHostAuthority(host, publicKey, expectedTrustRevision, context.signal);
        publish();
        return result;
      });
    }),
  );
  api.defineCapability(
    bindCapability(descriptors.knownHostAuthoritiesRemove, async (context, { authority, expectedTrustRevision }) => {
      requireDesktop(context);
      files.assertWritable();
      const result = await manager.removeHostAuthority(authority, expectedTrustRevision, context.signal);
      publish();
      return result;
    }),
  );
}
