import { z } from "zod";
import { ForwardPort } from "./forwarding.js";

export const ProxyShareConfig = z.strictObject({
  hostId: z.string(),
  connectionId: z.string(),
  localPort: ForwardPort,
  remotePort: ForwardPort.min(1024),
});
export type ProxyShareConfig = z.infer<typeof ProxyShareConfig>;
export const ProxyShareStatus = z.strictObject({
  state: z.enum(["idle", "starting", "running", "stop-failed", "failed", "stopped"]),
  config: ProxyShareConfig.optional(),
  tested: z.enum(["accepted", "failed"]).optional(),
  message: z.string().optional(),
});
export type ProxyShareStatus = z.infer<typeof ProxyShareStatus>;

export function proxyShareText(remotePort: number) {
  const address = `http://127.0.0.1:${remotePort}`;
  return {
    shell: `export http_proxy=${address} https_proxy=${address}\n`,
    docker: JSON.stringify({ proxies: { "http-proxy": address, "https-proxy": address } }, null, 2),
    shellRestore: "unset http_proxy https_proxy\n",
  };
}
