import { Badge, Button } from "@huhu/ui";
import { useCapability, useEngine, useQueryClient } from "../engine-client/react.js";
import { tHome } from "../i18n/zh-CN.js";

interface Check {
  id: string;
  title: string;
  status: "ok" | "warning" | "error";
  detail: string;
  action?: { label: string; target: string };
}

export function HealthModule() {
  const engine = useEngine();
  const qc = useQueryClient();
  const r = useCapability<{ overall: "ok" | "warning" | "error"; checks: Check[] }>("health.run", {});
  return (
    <div className="hu-content" data-testid="health-module">
      <h1>{tHome.health.title}</h1>
      {r.data ? <p data-testid="health-overall">{tHome.health.overall[r.data.overall]}</p> : <p>…</p>}
      <Button onClick={() => void qc.invalidateQueries({ queryKey: [engine.vaultId, "health.run"] })}>{tHome.health.run}</Button>
      {(r.data?.checks ?? []).map((c) => (
        <div key={c.id} className="hu-row" data-testid="health-check" data-status={c.status}>
          <strong>{c.title}</strong>
          <Badge tone={c.status === "ok" ? "success" : c.status === "warning" ? "warning" : "danger"}>{c.status}</Badge>
          <span>{c.detail}</span>
        </div>
      ))}
    </div>
  );
}
