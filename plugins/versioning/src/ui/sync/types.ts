export interface Cfg {
  remote: string;
  branch: string;
  mode: "off" | "follow" | "full";
  pullIntervalSec: number;
  pushIntervalSec: number;
  credential: string;
  credentialUser: string;
  exclude: string[];
}

export type SyncStatus = { name: string; detail: string; pausedReason: "conflict" | "auth-failed" | null };
