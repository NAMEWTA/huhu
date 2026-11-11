import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { errors, newId } from "@huhu/contracts";

export type SshAuth = { kind: "key"; secretRef: string; passphraseRef?: string | undefined } | { kind: "password"; secretRef: string } | { kind: "agent" };

export interface SshHost {
  id: string;
  name: string;
  host: string;
  port: number;
  user: string;
  auth: SshAuth;
  jumpHostIds: string[];
  tags: string[];
  connectTimeoutSec: number;
}

export type HostInput = Omit<SshHost, "id"> & { id?: string | undefined };

/** 找出 `id` 的跳板链里的循环；有则返回环路径。 */
export function findJumpCycle(hosts: Pick<SshHost, "id" | "jumpHostIds">[], startId: string): string[] | null {
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

/** 主机配置：`.huhu/ssh/hosts/<id>.json`。秘密只以 `safe://` 引用保存。 */
export class HostStore {
  constructor(private readonly dir: string) {}

  list(): SshHost[] {
    if (!existsSync(this.dir)) return [];
    return readdirSync(this.dir)
      .filter((f) => f.endsWith(".json"))
      .flatMap((f) => {
        try {
          return [JSON.parse(readFileSync(path.join(this.dir, f), "utf8")) as SshHost];
        } catch {
          return [];
        }
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  get(id: string): SshHost {
    const h = this.list().find((x) => x.id === id);
    if (!h) throw errors.notFound(`主机 ${id} 不存在`);
    return h;
  }

  save(input: HostInput): SshHost {
    if (!input.name.trim()) throw errors.invalidInput("显示名称必填");
    if (!input.host.trim() || /[\s/\\]/.test(input.host)) throw errors.invalidInput("主机名不能含空格或路径");
    if (!Number.isInteger(input.port) || input.port < 1 || input.port > 65535) throw errors.invalidInput("端口范围 1–65535");
    if (!input.user.trim()) throw errors.invalidInput("用户名必填");
    if (input.connectTimeoutSec < 1 || input.connectTimeoutSec > 300) throw errors.invalidInput("连接超时 1–300 秒");
    const all = this.list();
    for (const j of input.jumpHostIds) if (!all.some((h) => h.id === j)) throw errors.invalidInput("跳板主机不存在");
    const id = input.id ?? newId("host");
    const host: SshHost = { ...input, id, name: input.name.trim(), host: input.host.trim(), user: input.user.trim() };
    const cycle = findJumpCycle([...all.filter((h) => h.id !== id), host], id);
    if (cycle) throw errors.invalidInput("跳板链不能形成循环");
    mkdirSync(this.dir, { recursive: true });
    writeFileSync(path.join(this.dir, `${id}.json`), JSON.stringify(host, null, 2));
    return host;
  }

  delete(id: string): void {
    this.get(id);
    const dependents = this.list().filter((h) => h.jumpHostIds.includes(id));
    if (dependents.length) throw errors.invalidInput(`以下主机以它为跳板：${dependents.map((d) => d.name).join("、")}`);
    rmSync(path.join(this.dir, `${id}.json`), { force: true });
  }
}
