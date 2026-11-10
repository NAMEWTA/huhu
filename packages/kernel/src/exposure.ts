import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

/** 能力对外开放偏好：`.huhu/plugins.json` 的 `capabilityExposure`（能力名 → 是否开放）。 */
export class ExposureStore {
  constructor(private readonly file: string) {}

  private load(): Record<string, unknown> {
    try {
      return existsSync(this.file) ? (JSON.parse(readFileSync(this.file, "utf8")) as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }

  map(): Record<string, boolean> {
    const raw = this.load()["capabilityExposure"];
    return raw && typeof raw === "object" ? Object.fromEntries(Object.entries(raw as Record<string, unknown>).filter(([, v]) => typeof v === "boolean")) as Record<string, boolean> : {};
  }

  override(name: string): boolean | undefined {
    return this.map()[name];
  }

  set(name: string, exposed: boolean): void {
    const all = this.load();
    all["capabilityExposure"] = { ...this.map(), [name]: exposed };
    mkdirSync(path.dirname(this.file), { recursive: true });
    writeFileSync(this.file, JSON.stringify(all, null, 2)); // 保留 plugins.json 里的其他键
  }
}
