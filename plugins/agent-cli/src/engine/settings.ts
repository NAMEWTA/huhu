import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { errors } from "@huhu/contracts";
import { AgentSettingsFile, emptyAgentSettings, parseAgentSettings } from "../shared/settings.js";

/** `<vault>/.huhu/agent-cli/agents.json`：整文件条件写（revision）；文件不存在或损坏时按缺省处理，下次保存整体重写。 */
export class AgentSettingsStore {
  constructor(private readonly file: string) {}

  read(): { settings: AgentSettingsFile; warning?: string } {
    if (!existsSync(this.file)) return { settings: emptyAgentSettings() };
    try {
      return parseAgentSettings(JSON.parse(readFileSync(this.file, "utf8")));
    } catch {
      return parseAgentSettings(null);
    }
  }

  get(): AgentSettingsFile {
    return this.read().settings;
  }

  /** `expectedRevision` 与当前不一致就拒绝，调用方重新读取后再改。 */
  write(next: Omit<AgentSettingsFile, "revision" | "schema">, expectedRevision: number): AgentSettingsFile {
    const cur = this.get();
    if (cur.revision !== expectedRevision) throw errors.versionConflict(String(cur.revision));
    const out = AgentSettingsFile.parse({ schema: 1, revision: cur.revision + 1, ...next });
    mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(out, null, 2) + "\n");
    renameSync(tmp, this.file);
    return out;
  }
}
