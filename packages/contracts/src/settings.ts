import { z } from "zod";

/** `.huhu/settings.json`（data-model.md §6）。读取时缺省补全，非法值回退默认。 */
export const SettingsSchema = z.object({
  appearance: z
    .object({
      theme: z.enum(["pearl", "suliworld", "soft"]).catch("pearl"),
      mode: z.enum(["light", "dark", "system"]).catch("system"),
      fontSize: z.number().int().min(12).max(18).catch(14),
      compact: z.boolean().catch(false),
      motion: z.enum(["system", "standard", "reduced"]).catch("system"),
      navWidth: z.number().int().min(176).max(300).catch(220),
    })
    .catch({ theme: "pearl", mode: "system", fontSize: 14, compact: false, motion: "system", navWidth: 220 }),
  editor: z
    .object({
      fontSize: z.number().int().min(14).max(20).catch(16),
      lineHeight: z.number().min(1.4).max(2).catch(1.8),
      autosave: z.boolean().catch(true),
      lineNumbers: z.boolean().catch(true),
      spellcheck: z.boolean().catch(false),
      readableWidth: z.enum(["680", "760", "880", "full"]).catch("760"),
    })
    .catch({ fontSize: 16, lineHeight: 1.8, autosave: true, lineNumbers: true, spellcheck: false, readableWidth: "760" }),
  dateTime: z
    .object({
      zone: z
        .string()
        .refine((z) => {
          try {
            new Intl.DateTimeFormat("en-US", { timeZone: z });
            return true;
          } catch {
            return false;
          }
        })
        .catch(Intl.DateTimeFormat().resolvedOptions().timeZone),
      weekStartsOn: z.union([z.literal(0), z.literal(1)]).catch(1),
    })
    .catch({ zone: Intl.DateTimeFormat().resolvedOptions().timeZone, weekStartsOn: 1 }),
  shortcuts: z.record(z.string(), z.string()).catch({}),
});
export type Settings = z.infer<typeof SettingsSchema>;

/** 深度合并补丁，再整体校验；校验失败的字段回退默认。 */
export function mergeSettings(current: Settings, patch: unknown): Settings {
  const merge = (a: unknown, b: unknown): unknown => {
    if (b && typeof b === "object" && !Array.isArray(b) && a && typeof a === "object") {
      const out: Record<string, unknown> = { ...(a as Record<string, unknown>) };
      for (const [k, v] of Object.entries(b)) out[k] = merge(out[k], v);
      return out;
    }
    return b;
  };
  return SettingsSchema.parse(merge(current, patch));
}
