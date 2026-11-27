import type { TaskMcpTool } from "@huhu/contracts";
import { TokenTable } from "./tokens.js";

type TokenPrincipal = NonNullable<ReturnType<TokenTable["principal"]>>;
type TaskScope = {
  tools: readonly TaskMcpTool[];
  current(): boolean;
  live(): boolean;
  submitted(): boolean;
  cleanup?(): void;
};
export type TaskMcpCredential = TokenPrincipal & { task?: TaskScope & { active(): boolean } };

/** Separate token table: task bearers are only accepted by the local /mcp ingress. */
export class TaskMcpCredentials {
  private readonly tokens = new TokenTable();
  private readonly scopes = new Map<string, NonNullable<TaskMcpCredential["task"]>>();
  private readonly stops = new Set<() => void>();

  issue(scope: TaskScope): string {
    const token = this.tokens.issue("http");
    const hash = TokenTable.hashHex(token);
    const { credentialId } = this.tokens.principal(token)!;
    const startupDeadline = Date.now() + 60_000;
    const deadline = Date.now() + 30 * 60_000;
    let seen = false;
    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      clearInterval(timer);
      this.stops.delete(close);
      this.scopes.delete(credentialId);
      this.tokens.removeHash(hash);
      try {
        scope.cleanup?.();
      } catch {
        // The bearer has already been revoked even if the handoff file cannot be removed.
      }
    };
    const active = () => {
      if (closed) return false;
      try {
        const now = Date.now();
        if (now >= deadline || !scope.current()) {
          close();
          return false;
        }
        if (scope.live()) {
          seen = true;
          return true;
        }
        if (seen || now >= startupDeadline) close();
      } catch {
        close();
      }
      return false;
    };
    const timer = setInterval(active, 1_000);
    timer.unref();
    this.stops.add(close);
    this.scopes.set(credentialId, { ...scope, active });
    return token;
  }

  principal(token: string | undefined): TaskMcpCredential | undefined {
    const credential = this.tokens.principal(token);
    const task = credential && this.scopes.get(credential.credentialId);
    return credential && task?.active() ? { ...credential, task } : undefined;
  }

  recheck(): void {
    for (const scope of this.scopes.values()) scope.active();
  }

  close(): void {
    for (const close of this.stops) close();
  }
}
