import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { errors } from "@huhu/contracts";
import type { z } from "zod";
import { LegacyHostRecord, type LegacyHostView, type SshHostProfile } from "./auth-profile.js";

export type LegacyHost = z.infer<typeof LegacyHostView>;

/** 找出 `id` 的跳板链里的循环；有则返回环路径。 */
export function findJumpCycle(hosts: (Pick<SshHostProfile, "jumpHostIds"> & { id: string })[], startId: string): string[] | null {
  const byId = new Map(hosts.map((h) => [h.id, h.jumpHostIds]));
  const walk = (id: string, stack: string[]): string[] | null => {
    if (stack.includes(id)) return [...stack.slice(stack.indexOf(id)), id];
    for (const j of byId.get(id) ?? []) {
      const c = walk(j, [...stack, id]);
      if (c) return c;
    }
    return null;
  };
  return walk(startId, []);
}

export function validateHost<T extends SshHostProfile>(input: T, id: string, all: (Pick<SshHostProfile, "jumpHostIds"> & { id: string })[]): T {
  if (!input.name.trim()) throw errors.invalidInput("显示名称必填");
  if (!input.host.trim() || /[\s/\\]/.test(input.host)) throw errors.invalidInput("主机名不能含空格或路径");
  if (!Number.isInteger(input.port) || input.port < 1 || input.port > 65535) throw errors.invalidInput("端口范围 1–65535");
  if (!input.user.trim()) throw errors.invalidInput("用户名必填");
  if (input.connectTimeoutSec !== undefined && (input.connectTimeoutSec < 1 || input.connectTimeoutSec > 300)) throw errors.invalidInput("连接超时 1–300 秒");
  if (input.jumpHostIds.some((jump) => jump === id || !all.some((host) => host.id === jump))) throw errors.invalidInput("无效的跳板主机");
  if (input.routeDisabled && input.jumpHostIds.length === 0) throw errors.invalidInput("只有已设置跳板的主机可以停用路由");
  if (findJumpCycle([...all.filter((host) => host.id !== id), { id, jumpHostIds: input.jumpHostIds }], id)) throw errors.invalidInput("跳板链不能形成循环");
  return { ...input, name: input.name.trim(), host: input.host.trim(), user: input.user.trim() };
}

/** 只读旧主机位置。保留原文件，仅返回需要修复的脱敏目录条目。 */
export class HostStore {
  constructor(private readonly dir: string) {}

  list(): LegacyHost[] {
    if (!existsSync(this.dir)) return [];
    return readdirSync(this.dir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && /^[a-zA-Z0-9_-]+\.json$/.test(entry.name))
      .flatMap(({ name: f }): LegacyHost[] => {
        try {
          const host = LegacyHostRecord.parse(JSON.parse(readFileSync(path.join(this.dir, f), "utf8")) as unknown);
          return `${host.id}.json` === f ? [{ ...host, auth: { kind: host.auth.kind, source: "legacy" }, repairRequired: true }] : [];
        } catch {
          return [];
        }
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }
}
