import { Badge, Button } from "@huhu/ui";
import { useCapability, useEngine, useQueryClient } from "../engine-client/react.js";
import { useState } from "react";
import { tGateway as g } from "../i18n/zh-CN.js";

interface Cap { name: string; plugin: string; scope: "read" | "write" | "execute" | "admin"; exposable: boolean; exposed: boolean }

/** 能力网关：哪些能力对 CLI / MCP / HTTP 开放、MCP 服务开关、HTTP 令牌。不可开放的能力（保险箱明文、Agent/SSH 执行）没有开关。 */
export function GatewayModule() {
  const engine = useEngine();
  const qc = useQueryClient();
  const caps = useCapability<Cap[]>("capabilities.list", {});
  const gw = useCapability<{ mcp: { enabled: boolean; transport: "stdio" | "http" }; tokens: number }>("gateway.get", {});
  const tokens = useCapability<{ id: string; name: string; createdAt: string }[]>("gateway.tokens.list", {});
  const [filter, setFilter] = useState("");
  const [name, setName] = useState("");
  const [fresh, setFresh] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const refresh = () => qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === engine.vaultId });
  async function act<T>(cap: string, input: unknown): Promise<T | null> {
    setError(null);
    try {
      const r = await engine.call<T>(cap, input, { write: true });
      await refresh();
      return r;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return null;
    }
  }
  const [bench, setBench] = useState("");
  const [verdict, setVerdict] = useState<{ found: boolean; identities: { identity: string; allowed: boolean; reason: string }[] } | null>(null);
  const mcp = gw.data?.mcp ?? { enabled: false, transport: "stdio" as const };
  const list = (caps.data ?? []).filter((c) => c.name.includes(filter.trim()));
  return (
    <div className="hu-content" data-testid="gateway-module">
      <h1>{g.title}</h1>
      {error ? <div role="alert" className="hu-overdue">{error}</div> : null}
      <h2>{g.mcp}</h2>
      <label><input type="checkbox" checked={mcp.enabled} onChange={(e) => void act("gateway.mcp.update", { enabled: e.target.checked, transport: mcp.transport })} /> {g.mcpEnabled}</label>
      <label>{g.transport}
        <select aria-label={g.transport} value={mcp.transport} onChange={(e) => void act("gateway.mcp.update", { enabled: mcp.enabled, transport: e.target.value })}>
          <option value="stdio">{g.stdio}</option><option value="http">{g.http}</option>
        </select>
      </label>
      <h2>{g.tokens}</h2>
      <form className="hu-form" onSubmit={(e) => { e.preventDefault(); if (name.trim()) void act<{ token: string }>("gateway.tokens.create", { name: name.trim() }).then((r) => { if (r) { setFresh(r.token); setName(""); } }); }}>
        <input className="hu-input" aria-label={g.tokenName} placeholder={g.tokenName} value={name} onChange={(e) => setName(e.target.value)} />
        <Button type="submit" disabled={!name.trim()}>{g.createToken}</Button>
      </form>
      {fresh ? <div role="status" data-testid="fresh-token">{g.tokenOnce}<code>{fresh}</code></div> : null}
      {(tokens.data ?? []).length === 0 ? <p>{g.noTokens}</p> : (tokens.data ?? []).map((t) => (
        <div key={t.id} className="hu-row" data-testid="token-row"><strong>{t.name}</strong><span className="hu-meta">{new Date(t.createdAt).toLocaleString()}</span><Button variant="danger" aria-label={`${g.revoke} ${t.name}`} onClick={() => void act("gateway.tokens.revoke", { id: t.id }).then(() => setFresh(null))}>{g.revoke}</Button></div>
      ))}
      <h2>{g.bench}</h2>
      <p className="hu-meta">{g.benchHint}</p>
      <form className="hu-form" onSubmit={(e) => { e.preventDefault(); void act<typeof verdict>("gateway.check", { capability: bench.trim() }).then((r) => setVerdict(r)); }}>
        <input className="hu-input" aria-label={g.bench} placeholder="tasks.create" value={bench} onChange={(e) => setBench(e.target.value)} />
        <Button type="submit" disabled={!bench.trim()}>{g.check}</Button>
      </form>
      {verdict ? (verdict.found ? verdict.identities.map((v) => (
        <div key={v.identity} className="hu-row" data-testid="bench-row" data-identity={v.identity} data-allowed={v.allowed}><strong>{v.identity}</strong><Badge>{v.allowed ? g.allowed : g.denied}</Badge><span className="hu-meta">{v.reason}</span></div>
      )) : <p role="status" data-testid="bench-notfound">{g.notFound}</p>) : null}
      <h2>{g.capabilities}</h2>
      <input className="hu-input" aria-label={g.filter} placeholder={g.filter} value={filter} onChange={(e) => setFilter(e.target.value)} />
      {list.map((c) => (
        <div key={c.name} className="hu-row" data-testid="cap-row" data-cap={c.name}>
          <code>{c.name}</code><Badge>{g.scope[c.scope]}</Badge>
          {c.exposable ? (
            <label><input type="checkbox" aria-label={c.name} checked={c.exposed} onChange={(e) => void act("gateway.update", { capability: c.name, exposed: e.target.checked })} /> {c.exposed ? g.exposed : g.closed}</label>
          ) : <Badge tone="neutral">{g.never}</Badge>}
        </div>
      ))}
    </div>
  );
}
