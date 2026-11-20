import { randomBytes, randomUUID } from "node:crypto";
import { errors } from "@huhu/contracts";
import { TokenTable } from "./tokens.js";

const newToken = () => randomBytes(32).toString("base64url");

interface WebSession {
  id: string;
  invitationId: string;
  controller: AbortController;
}

interface Invitation {
  id: string;
  token: string;
  sessionHashes: Set<string>;
}

/** 一次监听及一个 Vault 拥有自己的邀请和会话。 */
export class WebInvitations {
  private readonly invitations = new Map<string, Invitation>();
  private readonly invitationIds = new Map<string, string>();
  private readonly sessions = new Map<string, WebSession>();
  private closed = false;

  constructor(
    readonly vaultId: string,
    readonly generation: string,
  ) {}

  create(): { id: string; token: string } {
    if (this.closed) throw errors.engineClosing();
    const id = randomUUID();
    const token = newToken();
    this.invitations.set(id, { id, token, sessionHashes: new Set() });
    this.invitationIds.set(TokenTable.hashHex(token), id);
    return { id, token };
  }

  link(id: string): { id: string; token: string } | null {
    const invitation = this.invitations.get(id);
    return invitation ? { id, token: invitation.token } : null;
  }

  join(token: string): { sessionId: string; token: string } | null {
    const id = this.invitationIds.get(TokenTable.hashHex(token));
    const invitation = id ? this.invitations.get(id) : undefined;
    if (!invitation) return null;
    const sessionId = randomUUID();
    const sessionToken = newToken();
    const hash = TokenTable.hashHex(sessionToken);
    this.sessions.set(hash, { id: sessionId, invitationId: invitation.id, controller: new AbortController() });
    invitation.sessionHashes.add(hash);
    return { sessionId, token: sessionToken };
  }

  authenticate(token: string | undefined) {
    const session = token ? this.sessions.get(TokenTable.hashHex(token)) : undefined;
    return session ? { id: session.id, invitationId: session.invitationId, vaultId: this.vaultId, generation: this.generation, signal: session.controller.signal } : null;
  }

  revoke(id: string): boolean {
    const invitation = this.invitations.get(id);
    if (!invitation) return false;
    this.invitations.delete(id);
    this.invitationIds.delete(TokenTable.hashHex(invitation.token));
    const revoked = [...invitation.sessionHashes].map((hash) => {
      const session = this.sessions.get(hash);
      this.sessions.delete(hash);
      return session;
    });
    for (const session of revoked) session?.controller.abort();
    return true;
  }

  close(): void {
    this.closed = true;
    for (const id of this.invitations.keys()) this.revoke(id);
  }
}
