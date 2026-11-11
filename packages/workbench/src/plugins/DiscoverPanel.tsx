import { Badge, Button, Dialog, EmptyState } from "@huhu/ui";
import { FolderOpen, PackageOpen, ShieldCheck, FileArchive } from "lucide-react";
import { useState } from "react";
import { useCapability, useEngine, useQueryClient } from "../engine-client/react.js";
import { host } from "../settings/host.js";

interface Example {
  id: string;
  manifest: { id: string; title: string; description: string; version: string; permissions: string[]; dependsOn: string[] };
  publisher: string;
  tags: string[];
  installed: boolean;
  source: string;
}
interface Inspected {
  manifest: Example["manifest"];
  permissions: { name: string; capabilities: string[] }[];
  publisher?: string;
}

/** 发现插件：随应用提供的示例扩展 + 从文件夹 / zip 安装。安装前列出每个权限对应的能力并确认（security §6）。 */
export function DiscoverPanel({ onInstalled }: { onInstalled(id: string): void }) {
  const engine = useEngine();
  const qc = useQueryClient();
  const examples = useCapability<Example[]>("plugins.examples", {});
  const [pending, setPending] = useState<{ source: string; info: Inspected } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const h = host();
  const refresh = () => qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === engine.vaultId });

  async function inspect(source: string | null): Promise<void> {
    if (!source) return;
    setError(null);
    try {
      setPending({ source, info: await engine.call<Inspected>("plugins.inspect", { source }) });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }
  async function install(): Promise<void> {
    if (!pending) return;
    setBusy(true);
    setError(null);
    try {
      const r = await engine.call<{ id: string }>("plugins.install", { source: pending.source, grants: pending.info.manifest.permissions }, { write: true });
      setPending(null);
      await refresh();
      onInstalled(r.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div data-testid="plugin-discover">
      {error && !pending ? (
        <div role="alert" className="callout danger">
          <p>{error}</p>
        </div>
      ) : null}
      <div className="row">
        <div className="grow">
          <h2>外部扩展</h2>
          <p className="hint-text">扩展在独立进程里运行，只能通过你授权的权限调用 HUHU 的能力；卸载默认保留它的数据。</p>
        </div>
        {h ? (
          <>
            <Button icon={FolderOpen} data-testid="plugin-install-folder" onClick={() => void h.pickOpenPath("directory").then(inspect)}>
              从文件夹安装…
            </Button>
            <Button icon={FileArchive} data-testid="plugin-install-zip" onClick={() => void h.pickOpenPath("file").then(inspect)}>
              从 zip 安装…
            </Button>
          </>
        ) : null}
      </div>
      <div className="plugin-cards" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12, marginTop: 12 }}>
        {(examples.data ?? []).map((e) => (
          <article key={e.id} className="card" data-testid="plugin-example" data-plugin={e.id}>
            <div className="row">
              <strong className="grow">{e.manifest.title}</strong>
              <Badge>v{e.manifest.version}</Badge>
            </div>
            <p className="small muted">{e.publisher}</p>
            <p>{e.manifest.description}</p>
            <div className="permission-tags">
              {e.tags.map((t) => (
                <Badge key={t}>{t}</Badge>
              ))}
            </div>
            <div className="permission-tags">{e.manifest.permissions.length ? e.manifest.permissions.map((p) => <code key={p}>{p}</code>) : <span className="muted">无权限</span>}</div>
            <div className="row">
              <span className="grow" />
              {e.installed ? (
                <Badge tone="success">已安装</Badge>
              ) : (
                <Button variant="primary" data-testid="plugin-example-install" onClick={() => void inspect(e.source)}>
                  安装
                </Button>
              )}
            </div>
          </article>
        ))}
      </div>
      {(examples.data ?? []).length === 0 ? <EmptyState icon={PackageOpen} title="没有可用的示例扩展" hint="可以从本地文件夹或 zip 安装自己的扩展。" /> : null}
      {pending ? (
        <Dialog
          open
          title={`安装「${pending.info.manifest.title}」？`}
          description={`${pending.info.publisher ?? "未知发布者"} · v${pending.info.manifest.version}`}
          error={error}
          testId="plugin-permission-dialog"
          onClose={() => (setPending(null), setError(null))}
          actions={
            <>
              <Button onClick={() => (setPending(null), setError(null))}>取消</Button>
              <Button variant="primary" disabled={busy} data-testid="plugin-install-confirm" onClick={() => void install()}>
                安装并启用
              </Button>
            </>
          }
        >
          <p>{pending.info.manifest.description}</p>
          <h3>请求的权限</h3>
          {pending.info.permissions.length === 0 ? (
            <p className="muted">这个扩展不请求任何权限。</p>
          ) : (
            <ul>
              {pending.info.permissions.map((p) => (
                <li key={p.name}>
                  <code>{p.name}</code> → {p.capabilities.join("、")}
                </li>
              ))}
            </ul>
          )}
          <div className="callout">
            <ShieldCheck size={16} aria-hidden />
            <p>扩展以你的系统权限运行，只安装你信任的扩展。</p>
          </div>
        </Dialog>
      ) : null}
    </div>
  );
}
