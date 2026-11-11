import { Button, EmptyState } from "@huhu/ui";
import { CapabilityError, useEngine } from "@huhu/workbench";
import { useCallback, useEffect, useState } from "react";
import { t } from "./i18n.js";

interface Entry {
  name: string;
  type: "file" | "dir" | "link" | "other";
  size: number;
  mtime: number;
  mode: string;
}
type Pending = { kind: "overwrite"; what: string; retry: () => Promise<void> } | { kind: "delete"; name: string; path: string } | { kind: "download"; name: string; remote: string } | { kind: "rename"; name: string; from: string };

interface HostBridge {
  pickOpenPath?(kind: "file"): Promise<string | null>;
  pickSavePath?(name: string): Promise<string | null>;
}
const bridge = (): HostBridge => (globalThis as { huhuHost?: HostBridge }).huhuHost ?? {};

const join = (dir: string, name: string) => (dir.endsWith("/") ? `${dir}${name}` : `${dir}/${name}`);
const fmtSize = (n: number) => (n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

/** SSH → 文件（SFTP）：浏览、文本预览、上传、下载、新建文件夹、重命名、删除；覆盖与删除都要先确认。 */
export function FilesPanel({ hostId }: { hostId: string }) {
  const engine = useEngine();
  const [cwd, setCwd] = useState("");
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [preview, setPreview] = useState<{ name: string; text: string } | null>(null);
  const [folder, setFolder] = useState("");
  const [upFrom, setUpFrom] = useState("");
  const [field, setField] = useState("");
  const [busy, setBusy] = useState(false);

  const call = useCallback(<T,>(cap: string, input: Record<string, unknown>) => engine.call<T>(cap, { hostId, ...input }, { write: true }), [engine, hostId]);
  const load = useCallback(
    async (dir: string) => {
      setError(null);
      try {
        const r = await call<{ path: string; entries: Entry[] }>("ssh.sftp.list", { path: dir });
        setCwd(r.path);
        setEntries(r.entries);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [call],
  );
  useEffect(() => {
    void load("");
  }, [load]);

  /** 执行一个可能因“已存在”而需要确认覆盖的操作。 */
  async function attempt(what: string, run: (overwrite: boolean) => Promise<unknown>, after?: () => void) {
    setError(null);
    setNote(null);
    setBusy(true);
    const go = async (overwrite: boolean): Promise<void> => {
      setBusy(true);
      try {
        const r = await run(overwrite);
        setPending(null);
        setNote(r && typeof r === "object" && "size" in r ? t.files.transferred((r as { size: number }).size) : t.files.done);
        after?.();
        await load(cwd);
      } catch (e) {
        if (e instanceof CapabilityError && e.code === "NAME_CONFLICT" && !overwrite) setPending({ kind: "overwrite", what, retry: () => go(true) });
        else setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    };
    await go(false);
  }

  const openEntry = async (e: Entry) => {
    if (e.type === "dir") return void load(join(cwd, e.name));
    setError(null);
    setPreview(null);
    try {
      const r = await call<{ text: string }>("ssh.sftp.read", { path: join(cwd, e.name) });
      setPreview({ name: e.name, text: r.text });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };
  const up = cwd.split("/").slice(0, -1).join("/") || "/";

  return (
    <section data-testid="files-panel" aria-label={t.files.title}>
      <h2>{t.files.title}</h2>
      <div className="hu-row">
        <Button onClick={() => void load("")}>{t.files.home}</Button>
        <Button disabled={cwd === "/" || !cwd} onClick={() => void load(up)} data-testid="files-up">
          {t.files.up}
        </Button>
        <Button onClick={() => void load(cwd)}>{t.files.refresh}</Button>
        <code data-testid="files-path" aria-label={t.files.path}>
          {cwd || "…"}
        </code>
      </div>
      {busy ? (
        <div className="hu-row" role="status">
          <span>{t.files.working}</span>
          <Button onClick={() => void call("ssh.sftp.cancel", {}).catch(() => undefined)} data-testid="files-cancel">
            {t.files.cancelTransfer}
          </Button>
        </div>
      ) : null}
      {error ? (
        <div role="alert" className="hu-overdue" data-testid="files-error">
          {error}
        </div>
      ) : null}
      {note ? (
        <div role="status" data-testid="files-note">
          {note}
        </div>
      ) : null}

      {pending?.kind === "overwrite" ? (
        <div role="alertdialog" aria-label={t.files.overwrite(pending.what)} data-testid="files-overwrite">
          <p>{t.files.overwrite(pending.what)}</p>
          <Button variant="danger" onClick={() => void pending.retry()} data-testid="files-overwrite-yes">
            {t.files.overwriteYes}
          </Button>
          <Button onClick={() => setPending(null)} data-testid="files-overwrite-no">
            {t.files.cancel}
          </Button>
        </div>
      ) : null}
      {pending?.kind === "delete" ? (
        <div role="alertdialog" aria-label={t.files.confirmDelete(pending.name)} data-testid="files-delete-dialog">
          <p>{t.files.confirmDelete(pending.name)}</p>
          <Button variant="danger" onClick={() => void attempt(pending.name, () => call("ssh.sftp.delete", { path: pending.path }))} data-testid="files-delete-yes">
            {t.files.delete}
          </Button>
          <Button onClick={() => setPending(null)}>{t.files.cancel}</Button>
        </div>
      ) : null}
      {pending?.kind === "download" ? (
        <form
          className="hu-form"
          onSubmit={(ev) => {
            ev.preventDefault();
            const p = pending;
            void attempt(
              p.name,
              (o) => call("ssh.sftp.download", { remotePath: p.remote, localPath: field.trim(), overwrite: o }),
              () => setPending(null),
            );
          }}
        >
          <input className="hu-input" aria-label={t.files.saveTo} data-testid="files-save-to" value={field} onChange={(ev) => setField(ev.target.value)} placeholder="/…/" />
          {bridge().pickSavePath ? (
            <Button
              type="button"
              onClick={() =>
                void bridge()
                  .pickSavePath?.(pending.name)
                  .then((p) => {
                    if (p) setField(p);
                  })
              }
            >
              {t.files.choose}
            </Button>
          ) : null}
          <Button type="submit" variant="primary" disabled={!field.trim() || busy} data-testid="files-download-go">
            {t.files.download}
          </Button>
          <Button type="button" onClick={() => setPending(null)}>
            {t.files.cancel}
          </Button>
        </form>
      ) : null}
      {pending?.kind === "rename" ? (
        <form
          className="hu-form"
          onSubmit={(ev) => {
            ev.preventDefault();
            const p = pending;
            void attempt(
              field.trim(),
              (o) => call("ssh.sftp.rename", { from: p.from, to: join(cwd, field.trim()), overwrite: o }),
              () => setPending(null),
            );
          }}
        >
          <input className="hu-input" aria-label={t.files.newName} data-testid="files-rename-to" value={field} onChange={(ev) => setField(ev.target.value)} />
          <Button type="submit" variant="primary" disabled={!field.trim() || field.includes("/") || busy} data-testid="files-rename-go">
            {t.files.rename}
          </Button>
          <Button type="button" onClick={() => setPending(null)}>
            {t.files.cancel}
          </Button>
        </form>
      ) : null}

      {entries === null ? (
        <p>…</p>
      ) : entries.length === 0 ? (
        <EmptyState title={t.files.empty} />
      ) : (
        <table>
          <thead>
            <tr>
              <th scope="col">{t.files.name}</th>
              <th scope="col">{t.files.size}</th>
              <th scope="col">{t.files.modified}</th>
              <th scope="col">{t.files.mode}</th>
              <th scope="col">操作</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.name} data-testid="files-row">
                <td>
                  <button type="button" className="hu-nav-item" onClick={() => void openEntry(e)} data-testid="files-open">
                    {e.type === "dir" ? `📁 ${e.name}` : e.name}
                  </button>
                </td>
                <td>{e.type === "dir" ? "—" : fmtSize(e.size)}</td>
                <td>{e.mtime ? new Date(e.mtime).toLocaleString() : ""}</td>
                <td>
                  <code>{e.mode}</code>
                </td>
                <td>
                  {e.type === "file" ? (
                    <Button
                      aria-label={`${t.files.download} ${e.name}`}
                      onClick={() => {
                        setField("");
                        setPending({ kind: "download", name: e.name, remote: join(cwd, e.name) });
                      }}
                    >
                      {t.files.download}
                    </Button>
                  ) : null}
                  <Button
                    aria-label={`${t.files.rename} ${e.name}`}
                    onClick={() => {
                      setField(e.name);
                      setPending({ kind: "rename", name: e.name, from: join(cwd, e.name) });
                    }}
                  >
                    {t.files.rename}
                  </Button>
                  <Button variant="danger" aria-label={`${t.files.delete} ${e.name}`} onClick={() => setPending({ kind: "delete", name: e.name, path: join(cwd, e.name) })}>
                    {t.files.delete}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {preview ? (
        <>
          <h3>
            {t.files.preview}：{preview.name}
          </h3>
          <pre data-testid="files-preview" style={{ maxHeight: "30vh", overflow: "auto" }}>
            {preview.text}
          </pre>
        </>
      ) : null}

      <form
        className="hu-form"
        onSubmit={(ev) => {
          ev.preventDefault();
          void attempt(
            folder.trim(),
            () => call("ssh.sftp.mkdir", { path: join(cwd, folder.trim()) }),
            () => setFolder(""),
          );
        }}
      >
        <input className="hu-input" aria-label={t.files.folderName} data-testid="files-folder" placeholder={t.files.folderName} value={folder} onChange={(ev) => setFolder(ev.target.value)} />
        <Button type="submit" disabled={!folder.trim() || folder.includes("/") || busy}>
          {t.files.newFolder}
        </Button>
      </form>
      <form
        className="hu-form"
        onSubmit={(ev) => {
          ev.preventDefault();
          const name = upFrom.split(/[\\/]/).pop() ?? "";
          void attempt(
            name,
            (o) => call("ssh.sftp.upload", { localPath: upFrom.trim(), remotePath: join(cwd, name), overwrite: o }),
            () => setUpFrom(""),
          );
        }}
      >
        <input className="hu-input" aria-label={t.files.uploadFrom} data-testid="files-upload-from" placeholder={t.files.uploadFrom} value={upFrom} onChange={(ev) => setUpFrom(ev.target.value)} />
        {bridge().pickOpenPath ? (
          <Button
            type="button"
            onClick={() =>
              void bridge()
                .pickOpenPath?.("file")
                .then((p) => {
                  if (p) setUpFrom(p);
                })
            }
          >
            {t.files.choose}
          </Button>
        ) : null}
        <Button type="submit" variant="primary" disabled={!upFrom.trim() || busy} data-testid="files-upload-go">
          {t.files.uploadTo}
        </Button>
      </form>
    </section>
  );
}
