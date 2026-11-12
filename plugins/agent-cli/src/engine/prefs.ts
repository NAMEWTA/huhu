import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

export interface ProviderPref {
  model?: string;
  effort?: string;
  fast?: boolean;
}

/** 每台机器的 CLI 偏好（data-model.md：agent-cli/providers.json）：默认模型、推理强度、Fast。读失败当作没有偏好。 */
export class ProviderPrefs {
  constructor(private readonly file: string) {}

  all(): Record<string, ProviderPref> {
    try {
      if (!existsSync(this.file)) return {};
      const raw = JSON.parse(readFileSync(this.file, "utf8")) as unknown;
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
      const out: Record<string, ProviderPref> = {};
      for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
        if (!v || typeof v !== "object") continue;
        const o = v as Record<string, unknown>;
        out[k] = { ...(typeof o["model"] === "string" ? { model: o["model"] } : {}), ...(typeof o["effort"] === "string" ? { effort: o["effort"] } : {}), ...(typeof o["fast"] === "boolean" ? { fast: o["fast"] } : {}) };
      }
      return out;
    } catch {
      return {};
    }
  }

  set(provider: string, pref: ProviderPref): Record<string, ProviderPref> {
    const all = this.all();
    all[provider] = pref;
    mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(all, null, 2) + "\n");
    renameSync(tmp, this.file);
    return all;
  }
}
