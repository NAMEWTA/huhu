import { ImapFlow } from "imapflow";
import { MailAccountError, type MailAccountErrorCode, type MailDiscoveryRequest } from "./discovery.js";

function imapFailure(error: unknown, failure: MailAccountErrorCode): MailAccountErrorCode {
  const { code = "", authenticationFailed, tlsFailed } = (error ?? {}) as { code?: string; authenticationFailed?: boolean; tlsFailed?: boolean };
  if (authenticationFailed) return "authentication";
  if (code === "ETIMEOUT" || code === "ETIMEDOUT" || code.endsWith("_TIMEOUT")) return "timeout";
  if (tlsFailed || /^(ERR_(TLS|SSL)_|CERT_|SELF_SIGNED_|DEPTH_ZERO_|UNABLE_TO_|STARTTLS_)/.test(code)) return "tls";
  if (/^(E(CONN|HOST|NET|PIPE|AI_|NOTFOUND|ConnectionClosed)|NoConnection|ClosedAfterConnect)/.test(code)) return "network";
  return failure;
}

export async function withImapConnection<T>(
  { endpoint, email, password, signal }: MailDiscoveryRequest,
  cancellation: "discovery-stale" | "cancelled",
  failure: "folder-list" | "message-read",
  operation: (client: ImapFlow) => Promise<T>,
): Promise<T> {
  if (signal.aborted) throw new MailAccountError(cancellation);
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
  let connected = false;
  try {
    await client.connect();
    cancelled.throwIfAborted();
    connected = true;
    const result = await operation(client);
    cancelled.throwIfAborted();
    return result;
  } catch (error) {
    if (signal.aborted) throw new MailAccountError(cancellation);
    if (deadline.aborted) throw new MailAccountError("timeout");
    if (error instanceof MailAccountError) throw error;
    throw new MailAccountError(imapFailure(lastError ?? error, connected ? failure : "network"));
  } finally {
    cancelled.removeEventListener("abort", close);
    close();
  }
}
