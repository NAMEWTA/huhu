import { ImapFlow } from "imapflow";
import { MailAccountError, type MailAccountErrorCode, type MailFolderDiscovery } from "./discovery.js";

function imapFailure(error: unknown, listing: boolean): MailAccountErrorCode {
  const { code = "", authenticationFailed, tlsFailed } = (error ?? {}) as { code?: string; authenticationFailed?: boolean; tlsFailed?: boolean };
  if (authenticationFailed) return "authentication";
  if (code === "ETIMEOUT" || code === "ETIMEDOUT" || code.endsWith("_TIMEOUT")) return "timeout";
  if (tlsFailed || /^(ERR_(TLS|SSL)_|CERT_|SELF_SIGNED_|DEPTH_ZERO_|UNABLE_TO_|STARTTLS_)/.test(code)) return "tls";
  if (/^(E(CONN|HOST|NET|PIPE|AI_|NOTFOUND|ConnectionClosed)|NoConnection|ClosedAfterConnect)/.test(code)) return "network";
  return listing ? "folder-list" : "network";
}

export const discoverImapFolders: MailFolderDiscovery = async ({ endpoint, email, password, signal }) => {
  if (signal.aborted) throw new MailAccountError("discovery-stale");
  const client = new ImapFlow({
    host: endpoint.host,
    port: endpoint.port,
    secure: endpoint.security === "tls",
    doSTARTTLS: endpoint.security === "starttls",
    tls: { rejectUnauthorized: true },
    auth: { user: email, pass: password },
    logger: false,
    disableAutoIdle: true,
  });
  let lastError: unknown;
  client.on("error", (error) => {
    lastError = error;
  });
  const deadline = AbortSignal.timeout(15_000);
  const cancelled = AbortSignal.any([signal, deadline]);
  const close = () => client.close();
  cancelled.addEventListener("abort", close, { once: true });
  let listing = false;
  try {
    await client.connect();
    listing = true;
    // ImapFlow's full listing probes INBOX separately when the namespace listing omits it.
    const folders = await client.list({ listOnly: !client.namespace?.prefix });
    return folders.map(({ path, name, delimiter, specialUse, flags }) => ({ path, name, delimiter: delimiter || null, specialUse: specialUse ?? null, flags: [...flags] }));
  } catch (error) {
    if (signal.aborted) throw new MailAccountError("discovery-stale");
    if (deadline.aborted) throw new MailAccountError("timeout");
    throw new MailAccountError(imapFailure(lastError ?? error, listing));
  } finally {
    cancelled.removeEventListener("abort", close);
    close();
  }
};
