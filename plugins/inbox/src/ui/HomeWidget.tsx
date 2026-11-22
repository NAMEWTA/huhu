import { Badge, IconButton } from "@huhu/ui";
import { useCapability, useEngine, WidgetReadStatus, type HomeWidgetContribution } from "@huhu/workbench";
import { ArrowRight, ChevronRight } from "lucide-react";
import type { ComponentProps } from "react";
import type { Capture } from "./InboxModule.js";
import { requestOpenCapture } from "./open-capture.js";

export function InboxHomeWidget({ onNavigate }: ComponentProps<HomeWidgetContribution["component"]>) {
  const engine = useEngine();
  const pending = useCapability<Pick<Capture, "id" | "title" | "source">[]>("inbox.list", { status: "pending" });
  return (
    <div data-testid="card-inbox-list">
      {pending.isError || !pending.data ? (
        <WidgetReadStatus failed={pending.isError} retry={() => void pending.refetch()} />
      ) : (
        <>
          <div className="shell-card-head">
            <span>
              待处理 <Badge>{pending.data.length}</Badge>
            </span>
          </div>
          {pending.data.slice(0, 3).map((item) => (
            <div className="shell-inbox-preview" key={item.id}>
              <span className="shell-inbox-bullet" />
              <span>
                <strong>{item.title}</strong>
                <small>{item.source}</small>
              </span>
              <IconButton
                icon={ChevronRight}
                label={`打开收件 ${item.title}`}
                onClick={() => {
                  requestOpenCapture(engine, item.id);
                  onNavigate("inbox");
                }}
              />
            </div>
          ))}
          {pending.data.length === 0 ? <div className="hu-mini-empty">收件箱已清空</div> : null}
        </>
      )}
      <button type="button" className="hu-card-footer-link" onClick={() => onNavigate("inbox")}>
        整理收件箱 <ArrowRight size={14} aria-hidden />
      </button>
    </div>
  );
}
