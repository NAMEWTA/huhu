import type { Settings } from "@huhu/contracts";
import { useCapability } from "@huhu/workbench";

export function useKnowledgeLocale(): Settings["editor"]["knowledgeLocale"] {
  return useCapability<Settings>("settings.get", {}).data?.editor.knowledgeLocale ?? "zh-Hans";
}
