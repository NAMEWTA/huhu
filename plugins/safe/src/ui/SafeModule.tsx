import { Badge, Button, EmptyState } from "@huhu/ui";
import { CapabilityError, useCapability, useEngine, useQueryClient } from "@huhu/workbench";
import { Lock } from "lucide-react";
import { useState } from "react";
import { formatSecretRef } from "../shared/secret-ref.js";
import { t } from "./i18n.js";

interface Status { initialized: boolean; locked: boolean; corrupt: boolean; cooldownSeconds: number }
interface Item { id: string; name: string; type: string; account: string; allowedModules: string[] }

export function SafeModule() {
  const engine = useEngine();
  const qc = useQueryClient();
  const status = useCapability<Status>("safe.status", {});
  const refresh = () => qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === engine.vaultId });
  const [error, setError] = useState<string | null>(null);
  async function act<T>(capability: string, input: unknown): Promise<T | null> {
    setError(null);
    try {
      const r = await engine.call<T>(capability, input, { write: true });
      await refresh();
      return r;
    } catch (e) {
      setError(e instanceof CapabilityError ? e.message : String(e));
      await refresh();
      return null;
    }
  }
  if (!status.data) return <p>…</p>;
  if (status.data.corrupt) return <div role="alert" className="hu-content">keyring 文件损坏，保险箱不可用。</div>;
  if (!status.data.initialized) return <Setup onSetup={(password) => act("safe.setup", { password })} error={error} />;
  if (status.data.locked) return <Unlock onUnlock={(password) => act("safe.unlock", { password })} error={error} cooldown={status.data.cooldownSeconds} />;
  return <Unlocked act={act} error={error} />;
}

function Setup({ onSetup, error }: { onSetup(p: string): void; error: string | null }) {
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [ok, setOk] = useState(false);
  const valid = [...pw].length >= 10 && pw === pw2 && ok;
  return (
    <div className="hu-content" data-testid="safe-setup">
      <h1>{t.setupTitle}</h1>
      <p role="note">{t.warning}</p>
      <form className="hu-form" style={{ flexDirection: "column", maxWidth: 360 }} onSubmit={(e) => { e.preventDefault(); if (valid) onSetup(pw); }}>
        <input className="hu-input" type="password" aria-label={t.password} value={pw} onChange={(e) => setPw(e.target.value)} />
        <input className="hu-input" type="password" aria-label={t.confirm} value={pw2} onChange={(e) => setPw2(e.target.value)} />
        {pw && [...pw].length < 10 ? <span role="alert">{t.short}</span> : pw2 && pw !== pw2 ? <span role="alert">{t.mismatch}</span> : null}
        <label><input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} /> {t.understood}</label>
        <Button type="submit" variant="primary" disabled={!valid}>{t.create}</Button>
        {error ? <span role="alert">{error}</span> : null}
      </form>
    </div>
  );
}

function Unlock({ onUnlock, error, cooldown }: { onUnlock(p: string): void; error: string | null; cooldown: number }) {
  const [pw, setPw] = useState("");
  return (
    <div className="hu-content" data-testid="safe-locked">
      <Lock aria-hidden />
      <h1>{t.lockedTitle}</h1>
      <form className="hu-form" onSubmit={(e) => { e.preventDefault(); onUnlock(pw); setPw(""); }}>
        <input className="hu-input" type="password" aria-label={t.password} value={pw} onChange={(e) => setPw(e.target.value)} />
        <Button type="submit" variant="primary" disabled={!pw || cooldown > 0}>{t.unlock}</Button>
      </form>
      {cooldown > 0 ? <p role="alert">{t.cooldown}（{cooldown}s）</p> : null}
      {error ? <p role="alert">{error}</p> : null}
    </div>
  );
}

function Unlocked({ act, error }: { act<T>(c: string, i: unknown): Promise<T | null>; error: string | null }) {
  const items = useCapability<Item[]>("safe.items.list", {});
  const [name, setName] = useState("");
  const [value, setValue] = useState("");
  const [allowed, setAllowed] = useState("");
  const [shown, setShown] = useState<Record<string, string>>({});
  const engine = useEngine();
  return (
    <div className="hu-content" data-testid="safe-unlocked">
      <h1>{t.title} <Button onClick={() => void act("safe.lock", {})}>{t.lock}</Button></h1>
      <form className="hu-form" onSubmit={(e) => { e.preventDefault(); if (!name.trim() || !value) return; void act("safe.items.save", { name, type: "token", value, allowedModules: allowed.split(",").map((s) => s.trim()).filter(Boolean) }).then(() => { setName(""); setValue(""); setAllowed(""); }); }}>
        <input className="hu-input" aria-label={t.itemName} placeholder={t.itemName} value={name} onChange={(e) => setName(e.target.value)} />
        <input className="hu-input" type="password" aria-label={t.itemValue} placeholder={t.itemValue} value={value} onChange={(e) => setValue(e.target.value)} />
        <input className="hu-input" aria-label={t.allowed} placeholder={t.allowed} value={allowed} onChange={(e) => setAllowed(e.target.value)} />
        <Button type="submit" variant="primary" disabled={!name.trim() || !value}>{t.newItem}</Button>
      </form>
      {error ? <div role="alert" className="hu-overdue">{error}</div> : null}
      {items.isSuccess && items.data.length === 0 ? <EmptyState title={t.empty} /> : null}
      {(items.data ?? []).map((it) => (
        <div key={it.id} className="hu-row" data-testid="safe-item">
          <strong>{it.name}</strong>
          <Badge>{it.type}</Badge>
          <code>{formatSecretRef(it.id)}</code>
          <span data-testid="secret-value">{shown[it.id] ?? "••••••••"}</span>
          <Button onClick={() => { if (shown[it.id] !== undefined) setShown(({ [it.id]: _gone, ...rest }) => rest); else void engine.call<{ value: string }>("safe.items.reveal", { id: it.id }).then((r) => setShown((s) => ({ ...s, [it.id]: r.value }))); }}>{shown[it.id] !== undefined ? t.hide : t.show}</Button>
          <Button variant="danger" onClick={() => void act("safe.items.delete", { id: it.id })}>{t.delete}</Button>
        </div>
      ))}
    </div>
  );
}
