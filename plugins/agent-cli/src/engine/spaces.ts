import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { HuhuError, errors, newId } from "@huhu/contracts";

export interface Space {
  id: string;
  name: string;
  root: string;
  machineId: string;
  createdAt: string;
  revision: number;
}

/** Space：一个明确选择的本机目录（可在 Vault 外）。创建 Space 不启动任何进程。 */
export class SpaceStore {
  constructor(private readonly dir: string, private readonly machineId: string, private readonly now: () => Date = () => new Date()) {}

  private file(id: string): string {
    return path.join(this.dir, `${id}.json`);
  }

  list(): Space[] {
    if (!existsSync(this.dir)) return [];
    return readdirSync(this.dir).filter((f) => f.endsWith(".json")).flatMap((f) => {
      try {
        const s = JSON.parse(readFileSync(path.join(this.dir, f), "utf8")) as Space;
        return s.machineId === this.machineId ? [s] : []; // 绑定 machineId：他机的 Space 在本机不可见
      } catch {
        return [];
      }
    }).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  get(id: string): Space {
    const s = this.list().find((x) => x.id === id);
    if (!s) throw errors.notFound(`Space ${id} 不存在`);
    return s;
  }

  private canonical(root: string): string {
    if (!path.isAbsolute(root)) throw errors.invalidInput("工作目录必须是绝对路径");
    if (!existsSync(root) || !statSync(root).isDirectory()) throw errors.invalidInput("工作目录不存在或不是文件夹");
    return realpathSync(root);
  }

  save(input: { id?: string; name: string; root: string; expectedRevision?: number }): Space {
    if (!input.name.trim()) throw errors.invalidInput("Space 名称必填");
    const root = this.canonical(input.root);
    const dup = this.list().find((s) => s.root === root && s.id !== input.id);
    if (dup) throw errors.nameConflict("这个目录已有 Space，请从左侧打开");
    mkdirSync(this.dir, { recursive: true });
    if (input.id) {
      const cur = this.get(input.id);
      if (input.expectedRevision !== undefined && input.expectedRevision !== cur.revision) throw errors.versionConflict(String(cur.revision));
      const next: Space = { ...cur, name: input.name.trim(), root, revision: cur.revision + 1 };
      writeFileSync(this.file(cur.id), JSON.stringify(next, null, 2));
      return next;
    }
    const s: Space = { id: newId("space"), name: input.name.trim(), root, machineId: this.machineId, createdAt: this.now().toISOString(), revision: 1 };
    writeFileSync(this.file(s.id), JSON.stringify(s, null, 2));
    return s;
  }

  delete(id: string): void {
    this.get(id);
    rmSync(this.file(id), { force: true });
  }

  /** 首次进入：以 Vault 根为目录创建默认 Space（已存在则返回它）。 */
  ensureDefault(vaultRoot: string, name = "Vault"): Space {
    const root = this.canonical(vaultRoot);
    return this.list().find((s) => s.root === root) ?? this.save({ name, root });
  }

  /** 启动前校验：Space 存在、revision 一致、目录仍可访问；否则 SPACE_INVALID。 */
  validateForLaunch(id: string, revision: number): Space {
    const s = this.list().find((x) => x.id === id);
    if (!s) throw new HuhuError("SPACE_INVALID", "Space 不存在");
    if (s.revision !== revision) throw new HuhuError("SPACE_INVALID", "Space 配置已变化，请刷新后重试", { details: { currentRevision: s.revision } });
    try {
      this.canonical(s.root);
    } catch {
      throw new HuhuError("SPACE_INVALID", "Space 目录不存在或不可访问");
    }
    return s;
  }
}
