import type { HomeWidgetContribution } from "@huhu/workbench";
import { ArrowRight } from "lucide-react";
import type { ComponentProps } from "react";

export function AgentEntryHomeWidget({ onNavigate }: ComponentProps<HomeWidgetContribution["component"]>) {
  return (
    <button type="button" className="hu-card-footer-link" onClick={() => onNavigate("agent-cli")}>
      管理 CLI 会话 <ArrowRight size={14} aria-hidden />
    </button>
  );
}
