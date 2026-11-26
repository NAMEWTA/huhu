import type { MailFolder } from "./account-definition.js";
import type { MailEndpoint } from "../shared/presets.js";

export type MailAccountErrorCode =
  | "invalid-settings"
  | "credential-required"
  | "oauth-required"
  | "discovery-stale"
  | "inbox-required"
  | "saved-folders-unavailable"
  | "invalid-selection"
  | "discovery-required"
  | "draft-busy"
  | "draft-closed"
  | "network"
  | "timeout"
  | "tls"
  | "authentication"
  | "folder-list"
  | "message-read"
  | "message-too-large"
  | "mailbox-changed"
  | "oauth-reauthorize"
  | "oauth-not-configured"
  | "cancelled";

export class MailAccountError extends Error {
  constructor(readonly code: MailAccountErrorCode) {
    super(code);
    this.name = "MailAccountError";
  }
}

export interface MailDiscoveryRequest {
  readonly oauth?: true;
  readonly endpoint: Readonly<MailEndpoint>;
  readonly email: string;
  readonly password: string;
  readonly signal: AbortSignal;
}

/** Called only by the trusted account draft. Implementations must respect the
 * chosen security mode and avoid exposing secrets through errors or logs. */
export type MailFolderDiscovery = (request: MailDiscoveryRequest) => Promise<readonly MailFolder[]>;
