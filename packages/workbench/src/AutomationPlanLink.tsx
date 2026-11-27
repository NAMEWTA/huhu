import { Button } from "@huhu/ui";
import { useModuleIcons, type ModuleProps } from "./contributions.js";
import { useEngine } from "./engine-client/react.js";
import { writeAutomationPlanLink } from "./state/automation-navigation.js";

export function AutomationPlanLink({ planId, onNavigate, label = "在自动化中心管理计划" }: { planId: string; onNavigate: ModuleProps["onNavigate"]; label?: string }) {
  const { vaultId } = useEngine();
  const modules = useModuleIcons();
  if (!onNavigate || !modules.automations) return null;
  return (
    <Button
      onClick={() => {
        writeAutomationPlanLink(vaultId, planId);
        onNavigate("automations");
      }}
    >
      {label}
    </Button>
  );
}
