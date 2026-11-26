import { Badge, Button, Dialog } from "@huhu/ui";
import { CapabilityError, useEngine } from "@huhu/workbench";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import type { z } from "zod";
import type { hostImportConfirmDescriptor, hostImportPreviewDescriptor } from "../engine/import/capability.js";
import { importFormats, MAX_BYTES, type HostImportFormat, type ImportLocation } from "../shared/host-import.js";

type Preview = z.output<typeof hostImportPreviewDescriptor.output>;
type Row = Preview["rows"][number];
type ImportIssue = Preview["issues"][number];
type Source = z.output<typeof hostImportPreviewDescriptor.input>;
type Confirmation = z.output<typeof hostImportConfirmDescriptor.input>;
type Result = z.output<typeof hostImportConfirmDescriptor.output>;

const formatLabels: Record<HostImportFormat, string> = {
  openssh: "OpenSSH",
  putty: "PuTTY",
  xshell: "Xshell",
  mobaxterm: "MobaXterm",
  windterm: "WindTerm",
  electerm: "Electerm",
  netcatty: "Netcatty",
  securecrt: "SecureCRT",
};

const issueLabels: Record<ImportIssue["code"], string> = {
  "unrecognized-format": "文件与所选格式不匹配",
  "unsupported-variant": "此文件变体暂不支持",
  "invalid-encoding": "无法按所选编码读取文件",
  "input-limit": "文件大小或记录数超出导入上限",
  "malformed-record": "记录格式有误",
  "unsupported-protocol": "此记录使用不支持的协议",
  "missing-host": "缺少主机地址",
  "missing-user": "缺少用户名",
  "invalid-host": "主机地址无效",
  "invalid-user": "用户名无效",
  "invalid-port": "端口无效",
  "invalid-setting": "连接设置无效",
  "command-ignored": "命令字段已忽略",
  "credential-reconfigure": "认证资料需要重新配置",
  "encrypted-credential": "无法恢复加密口令",
  "unsupported-field": "字段暂不支持",
  "unresolved-route": "跳板路径需要重新配置",
  "unresolved-directive": "指令需要手动复核",
  "invalid-group": "分组无效",
};

const locationLabel = ({ kind, index }: ImportLocation) => (kind === "line" ? `第 ${index} 行` : `记录 ${index}`);
const existingEndpoint = (row: Row) => row.conflicts?.some(({ kind, field }) => kind === "existing" && field === "endpoint");
const errorMessage = (error: unknown, fallback: string) => (error instanceof CapabilityError ? error.message : fallback);

function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("无法读取文件"));
    reader.onload = () => {
      const data = String(reader.result);
      resolve(data.slice(data.indexOf(",") + 1));
    };
    reader.readAsDataURL(file);
  });
}

function Issues({ issues, showLocation = false }: { issues: ImportIssue[]; showLocation?: boolean }) {
  if (issues.length === 0) return null;
  return (
    <ul className="ssh-import-details">
      {issues.map(({ code, field, location }, index) => (
        <li key={index}>
          {showLocation && location ? `${locationLabel(location)} · ` : ""}
          {issueLabels[code]}
          {field ? `（${field}）` : ""}
        </li>
      ))}
    </ul>
  );
}

function selectedRows(preview: Preview, picked: ReadonlySet<number>, renames: ReadonlyMap<number, string>): Confirmation["selected"] {
  const selected: Confirmation["selected"] = [];
  const endpoints = new Map<string, number>();
  const names = new Set<string>();
  for (const row of preview.rows) {
    if (!picked.has(row.index) || !row.profile || existingEndpoint(row)) continue;
    const renameTo = renames.get(row.index)?.trim();
    const { name, host, port, user } = row.profile;
    const label = locationLabel(row.location);
    const nameKey = (renameTo || name).toLowerCase();
    const endpointKey = JSON.stringify([host.toLowerCase(), port, user]);
    const sameEndpoint = endpoints.get(endpointKey);
    if (sameEndpoint !== undefined) throw new Error(`${label}与所选条目 #${sameEndpoint} 的端点相同，请跳过其中一项。`);
    if (renameTo && /[\p{Cc}\p{Cf}]/u.test(renameTo)) throw new Error(`${label}的新名称包含无效字符。`);
    if (names.has(nameKey) || (nameKey === name.toLowerCase() && row.conflicts?.some(({ kind, field }) => kind === "existing" && field === "name"))) {
      throw new Error(`${label}的主机名称重复，请更名或跳过。`);
    }
    names.add(nameKey);
    endpoints.set(endpointKey, row.index);
    selected.push({ index: row.index, ...(renameTo && { renameTo }) });
  }
  return selected;
}

type Props = {
  open: boolean;
  onClose(): void;
  onResult(result: Result): Promise<void>;
};

export function HostImportDialog({ open, onClose, onResult }: Props) {
  const engine = useEngine();
  const formId = useId();
  const previewRequest = useRef<AbortController | null>(null);
  const submitting = useRef(false);
  const [format, setFormat] = useState<HostImportFormat>("openssh");
  const [file, setFile] = useState<File | null>(null);
  const [encoding, setEncoding] = useState<Source["encoding"]>();
  const [preview, setPreview] = useState<{ source: Source; data: Preview } | null>(null);
  const [picked, setPicked] = useState(() => new Set<number>());
  const [renames, setRenames] = useState(() => new Map<number, string>());
  const [stale, setStale] = useState(false);
  const [retry, setRetry] = useState<{ input: Confirmation; result: Result } | null>(null);
  const [busy, setBusy] = useState<"preview" | "confirm" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => () => previewRequest.current?.abort(), []);

  function clearPreview() {
    setPreview(null);
    setPicked(new Set());
    setRenames(new Map());
    setStale(false);
    setError(null);
  }

  function close() {
    if (submitting.current) return;
    previewRequest.current?.abort();
    previewRequest.current = null;
    setBusy(null);
    if (!retry) {
      setFile(null);
      setFormat("openssh");
      setEncoding(undefined);
      clearPreview();
    }
    onClose();
  }

  async function loadPreview() {
    if (!file || previewRequest.current || submitting.current) return;
    clearPreview();
    if (!file.size || file.size > MAX_BYTES) {
      setError(file.size ? "请选择不超过 4 MiB 的文件。" : "所选文件为空。");
      return;
    }
    const request = new AbortController();
    previewRequest.current = request;
    setBusy("preview");
    try {
      const contentBase64 = await readFile(file);
      request.signal.throwIfAborted();
      const source: Source = { format, filename: file.name, contentBase64, ...(encoding && { encoding }) };
      const data = await engine.call<Preview>("ssh.hosts.import.preview", source, { signal: request.signal });
      request.signal.throwIfAborted();
      setPreview({ source, data });
      setPicked(new Set(data.rows.filter((row) => row.state === "ready").map((row) => row.index)));
    } catch (e) {
      if (!request.signal.aborted) setError(errorMessage(e, "读取或预览文件失败，请重新选择文件后再试。"));
    } finally {
      if (previewRequest.current === request) {
        previewRequest.current = null;
        setBusy(null);
      }
    }
  }

  async function confirm(input: Confirmation) {
    if (submitting.current) return;
    submitting.current = true;
    setBusy("confirm");
    setError(null);
    try {
      // 分组待补齐是一次有效回执。新的请求键让 Engine 再次执行同一批导入。
      const result = await engine.call<Result>("ssh.hosts.import.confirm", input, { write: true });
      await onResult(result);
      if (result.groups.state === "pending") {
        setRetry({ input, result });
        clearPreview();
        setFile(null);
      } else {
        setRetry(null);
        setFile(null);
        setFormat("openssh");
        setEncoding(undefined);
        clearPreview();
        onClose();
      }
    } catch (e) {
      if (e instanceof CapabilityError && e.code === "VERSION_CONFLICT") {
        setStale(true);
        setError(retry ? "主机目录有所变动，原请求暂时无法补齐分组。已导入的主机仍保留。" : "预览已过期。请重新预览并检查每一项。");
      } else setError(errorMessage(e, "无法取得导入结果。请检查主机列表，再用相同选项重试。"));
    } finally {
      submitting.current = false;
      setBusy(null);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || stale || !preview) return;
    let selected: Confirmation["selected"];
    try {
      selected = selectedRows(preview.data, picked, renames);
    } catch (e) {
      setError(e instanceof Error ? e.message : "请检查选择的条目。");
      return;
    }
    if (selected.length) void confirm({ source: preview.source, token: preview.data.token, selected });
  }

  const newHosts = preview?.data.rows.filter((row) => row.state === "ready").length ?? 0;
  const conflictCount = preview?.data.rows.filter((row) => row.state === "conflict").length ?? 0;
  const skipped = (preview?.data.rows.length ?? 0) - newHosts - conflictCount;
  return (
    <Dialog
      open={open}
      title={retry ? "补齐导入分组" : "导入 SSH 主机"}
      {...(!retry && { description: "选择配置文件，预览并确认要导入的主机。" })}
      wide
      testId="ssh-import-dialog"
      onClose={close}
      error={error}
      actions={
        <>
          <Button disabled={busy === "confirm"} onClick={close}>
            {retry ? "关闭" : "取消"}
          </Button>
          {retry ? (
            <Button variant="primary" autoFocus loading={busy === "confirm"} onClick={() => void confirm(retry.input)}>
              重试保存分组
            </Button>
          ) : (
            <>
              <Button variant={preview && !stale ? "secondary" : "primary"} disabled={!file || busy === "confirm"} loading={busy === "preview"} onClick={() => void loadPreview()}>
                {preview ? "重新预览" : "预览文件"}
              </Button>
              {preview && !stale ? (
                <Button form={formId} type="submit" variant="primary" loading={busy === "confirm"} disabled={picked.size === 0}>
                  导入所选主机
                </Button>
              ) : null}
            </>
          )}
        </>
      }
    >
      {retry ? (
        <div className="hu-stack ssh-import-body">
          <p role="status">已保存 {retry.result.imported.length} 台主机，分组待补齐。</p>
          {retry.result.groups.state === "pending" ? <p className="muted">{retry.result.groups.message}</p> : null}
        </div>
      ) : (
        <form id={formId} method="post" className="hu-form-body ssh-import-body" onSubmit={submit}>
          <div className="hu-field-grid">
            <label className="hu-field">
              <span className="hu-field-label">来源格式</span>
              <select
                name="format"
                value={format}
                disabled={busy !== null}
                onChange={(e) => {
                  setFormat(e.target.value as HostImportFormat);
                  setEncoding(undefined);
                  clearPreview();
                }}
              >
                {importFormats.map((value) => (
                  <option key={value} value={value}>
                    {formatLabels[value]}
                  </option>
                ))}
              </select>
            </label>
            <label className="hu-field">
              <span className="hu-field-label">配置文件</span>
              <input
                type="file"
                name="source"
                disabled={busy !== null}
                onChange={(e) => {
                  setFile(e.target.files?.[0] ?? null);
                  clearPreview();
                }}
              />
            </label>
          </div>
          {format === "mobaxterm" ? (
            <label className="hu-field">
              <span className="hu-field-label">文件编码</span>
              <select
                name="encoding"
                value={encoding ?? ""}
                disabled={busy !== null}
                onChange={(e) => {
                  setEncoding(e.target.value ? "gb18030" : undefined);
                  clearPreview();
                }}
              >
                <option value="">自动（UTF-8 或带 BOM 的 UTF-16）</option>
                <option value="gb18030">GB18030</option>
              </select>
            </label>
          ) : null}
          <div role="status">
            {preview ? (
              <p className="ssh-import-summary">
                <strong>
                  {formatLabels[preview.data.format]} · {preview.data.filename}
                </strong>
                <span>
                  {newHosts} 项可导入 · {conflictCount} 项冲突 · {skipped} 项已跳过 · 已选 {picked.size} 项
                </span>
              </p>
            ) : null}
          </div>
          {preview ? <Issues issues={preview.data.issues} showLocation /> : null}
          {preview && preview.data.rows.length > 0 ? (
            <div className="ssh-import-table" role="region" aria-labelledby={`${formId}-items`} tabIndex={0}>
              <table className="hu-table">
                <caption id={`${formId}-items`}>导入条目</caption>
                <thead>
                  <tr>
                    <th scope="col">选择</th>
                    <th scope="col">来源与主机</th>
                    <th scope="col">状态与说明</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.data.rows.map((row) => {
                    const label = locationLabel(row.location);
                    const blocked = !row.profile || existingEndpoint(row);
                    const disabled = blocked || stale || busy !== null;
                    const nameConflict = row.conflicts?.some(({ field }) => field === "name") ?? false;
                    return (
                      <tr key={row.index} data-testid="ssh-import-row">
                        <td>
                          <label className="ssh-import-choice">
                            <input
                              type="checkbox"
                              name="selected"
                              value={row.index}
                              disabled={disabled}
                              checked={picked.has(row.index)}
                              aria-label={`导入 #${row.index} ${row.profile?.name ?? label}`}
                              onChange={(e) => {
                                const checked = e.target.checked;
                                setPicked((current) => {
                                  const next = new Set(current);
                                  if (checked) next.add(row.index);
                                  else next.delete(row.index);
                                  return next;
                                });
                                setError(null);
                              }}
                            />
                          </label>
                        </td>
                        <th scope="row">
                          <span className="muted small">
                            #{row.index} · {label}
                          </span>
                          {row.profile ? (
                            <>
                              <strong>{row.profile.name}</strong>
                              <span className="mono">
                                {row.profile.user}@{row.profile.host}:{row.profile.port}
                              </span>
                              {row.group?.length ? <span className="muted">{row.group.join(" / ")}</span> : null}
                            </>
                          ) : null}
                        </th>
                        <td>
                          {row.state === "ready" ? <Badge tone="success">可导入</Badge> : row.state === "conflict" ? <Badge tone="warning">有冲突</Badge> : <Badge tone="neutral">已跳过</Badge>}
                          {row.conflicts?.length ? (
                            <ul className="ssh-import-details">
                              {row.conflicts.map((conflict) => (
                                <li key={`${conflict.kind}-${conflict.field}`}>
                                  {conflict.field === "name" ? "名称" : "端点"}
                                  {conflict.kind === "existing" ? "与已保存主机冲突" : `与文件内条目 #${conflict.index} 冲突`}
                                  {conflict.kind === "existing" && conflict.field === "endpoint" ? "，须跳过" : ""}
                                </li>
                              ))}
                            </ul>
                          ) : null}
                          <Issues issues={row.issues} />
                          {nameConflict && !blocked ? (
                            <label className="hu-field">
                              <span className="hu-field-label">更名为</span>
                              <input
                                name={`rename-${row.index}`}
                                aria-label={`更名 #${row.index} ${row.profile?.name}`}
                                maxLength={200}
                                disabled={disabled}
                                value={renames.get(row.index) ?? ""}
                                onChange={(e) => {
                                  const name = e.target.value;
                                  setRenames((current) => new Map(current).set(row.index, name));
                                  setError(null);
                                }}
                              />
                            </label>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}
        </form>
      )}
    </Dialog>
  );
}
