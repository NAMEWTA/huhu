import { randomUUID } from "node:crypto";
import { errors } from "@huhu/contracts";
import type { HuhuApi } from "@huhu/kernel";
import { z } from "zod";
import { ForwardRule, type ForwardRevision, type SaveForward } from "../shared/forwarding.js";
import type { HostConfigurations } from "./host-configurations.js";
import { routeForHost, workspaceTarget } from "./workspace-target.js";

const FILE = ".huhu/ssh/forward-rules.json";
const MAX_RULES = 100;
const State = z.strictObject({ version: z.literal(1), rules: z.array(ForwardRule).max(MAX_RULES) });

export class ForwardRules {
  constructor(
    private readonly files: HuhuApi["vault"]["files"],
    private readonly hosts: HostConfigurations,
  ) {}

  private read() {
    const file = this.files.read(FILE);
    if (!file) {
      if (this.files.exists(FILE)) throw errors.invalidInput("转发规则路径应为普通文件");
      return { rules: [], fileVersion: null } as const;
    }
    let content: unknown;
    try {
      content = JSON.parse(file.bytes.toString("utf8")) as unknown;
    } catch {
      throw errors.invalidInput("转发规则文件不是有效 JSON");
    }
    const parsed = State.safeParse(content);
    if (!parsed.success || new Set(parsed.data.rules.map(({ id }) => id)).size !== parsed.data.rules.length) throw errors.invalidInput("转发规则文件格式无效");
    return { rules: parsed.data.rules, fileVersion: file.version };
  }

  list(): ForwardRule[] {
    return [...this.read().rules];
  }

  assertUnused(hostId: string) {
    const references = this.list().filter((rule) => rule.hostId === hostId);
    if (references.length) throw errors.invalidInput(`该主机仍被转发规则引用：${references.map(({ name }) => name).join("、")}`);
  }

  save(input: SaveForward, signal: AbortSignal) {
    return this.hosts.withStableDirectory(async () => {
      this.files.assertWritable();
      const { rules, fileVersion } = this.read();
      const { previous, rebind, ...draft } = input;
      const existing = previous && this.match(rules, previous);
      if (!existing && rules.length >= MAX_RULES) throw errors.invalidInput("转发规则已达 100 条上限");
      const hosts = new Map((await this.hosts.list()).map((host) => [host.id, host]));
      const chain = routeForHost(hosts, draft.hostId);
      const boundTarget = existing?.hostId === draft.hostId && !rebind ? existing.boundTarget : workspaceTarget(chain);
      const saved = { ...draft, id: existing?.id ?? randomUUID(), revision: randomUUID(), boundTarget };
      signal.throwIfAborted();
      await this.write([...rules.filter(({ id }) => id !== saved.id), saved], fileVersion);
      return saved;
    });
  }

  delete(input: ForwardRevision, signal: AbortSignal) {
    return this.hosts.withStableDirectory(async () => {
      this.files.assertWritable();
      const { rules, fileVersion } = this.read();
      this.match(rules, input);
      signal.throwIfAborted();
      await this.write(
        rules.filter(({ id }) => id !== input.id),
        fileVersion,
      );
      return { ok: true as const };
    });
  }

  private match(rules: readonly ForwardRule[], { id, expectedRevision }: ForwardRevision) {
    const current = rules.find((rule) => rule.id === id);
    if (!current) throw errors.notFound("转发规则已移除");
    if (current.revision !== expectedRevision) throw errors.versionConflict(current.revision);
    return current;
  }

  private async write(rules: ForwardRule[], expectedVersion: string | null) {
    await this.files.write(FILE, Buffer.from(JSON.stringify({ version: 1, rules }, null, 2) + "\n"), { expectedVersion });
  }
}
