import { Button, DataTable, Dialog, EmptyState } from "@huhu/ui";
import { queryKey, useCapability, useEngine, useEngineEvents, useQueryClient } from "@huhu/workbench";
import { Fingerprint } from "lucide-react";
import { useRef, useState } from "react";
import type { HostKeyPrompt, KnownHostKey } from "../shared/trust.js";
import { hostEndpoint } from "./HostKeyDialog.js";
import { HostAuthoritiesPanel } from "./HostAuthoritiesPanel.js";

const KEY_LIST = "ssh.knownHosts.list";
const rowKey = (key: KnownHostKey) => JSON.stringify([key.host, key.port, key.keyType, key.fingerprint]);

export function KnownHostsPanel({ desktop, review }: { desktop: boolean; review: HostKeyPrompt | null }) {
  const engine = useEngine();
  const qc = useQueryClient();
  const keys = useCapability<KnownHostKey[]>(KEY_LIST, {});
  const [selected, setSelected] = useState<KnownHostKey | null>(null);
  const removing = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removed, setRemoved] = useState(false);
  useEngineEvents((event) => {
    if (event.type === "ssh.connectionChanged" || (event.type === "entity.changed" && (event.payload as { kind: string }).kind === "ssh-known-hosts")) {
      void qc.invalidateQueries({ queryKey: queryKey(engine.vaultId, KEY_LIST), exact: true });
    }
  });

  async function forget(key: KnownHostKey) {
    if (removing.current) return;
    removing.current = true;
    setBusy(true);
    setError(null);
    try {
      await engine.call("ssh.knownHosts.forget", key, { write: true });
      await keys.refetch();
      setSelected(null);
      setRemoved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "无法移除指纹，请重新核对。");
      await keys.refetch();
    } finally {
      removing.current = false;
      setBusy(false);
    }
  }

  const matchesReview = (key: KnownHostKey) => key.host === review?.server.host && key.port === review.server.port;
  const rows = [...(keys.data ?? [])].sort((a, b) => Number(matchesReview(b)) - Number(matchesReview(a)));
  return (
    <div className="hu-scroll ssh-pad" data-testid="ssh-known-hosts">
      {review ? (
        <div className="hu-callout">
          <p>
            待核对：{review.server.name} · {hostEndpoint(review.server)}（第 {review.hop + 1} 跳）。服务器提供的指纹为 <code>{review.fingerprint}</code>。
          </p>
        </div>
      ) : null}
      <div role="status">{removed ? "已移除旧指纹。下次连接会重新请求确认。" : null}</div>
      {keys.isError ? (
        <div role="alert" className="hu-callout danger">
          <p>无法读取已知主机记录。</p>
          <Button onClick={() => void keys.refetch()}>重新读取</Button>
        </div>
      ) : keys.isPending ? (
        <p>正在读取已知主机…</p>
      ) : (
        <DataTable<KnownHostKey>
          label="已知主机指纹"
          rows={rows}
          rowKey={rowKey}
          empty={<EmptyState icon={Fingerprint} title="尚无已保存的主机指纹" />}
          columns={[
            { id: "endpoint", header: "主机地址", width: 150, cell: hostEndpoint },
            { id: "keyType", header: "密钥类型", width: 105, cell: (key) => key.keyType },
            { id: "fingerprint", header: "已保存指纹", width: 280, cell: (key) => <code className="ssh-fingerprint">{key.fingerprint}</code> },
            ...(desktop
              ? [
                  {
                    id: "actions",
                    header: "操作",
                    width: 115,
                    cell: (key: KnownHostKey) => (
                      <Button
                        onClick={() => {
                          setRemoved(false);
                          setError(null);
                          setSelected(key);
                        }}
                      >
                        移除指纹
                      </Button>
                    ),
                  },
                ]
              : []),
          ]}
        />
      )}
      {desktop && <HostAuthoritiesPanel />}
      {selected ? (
        <Dialog
          open
          title="移除保存的指纹"
          description="请先独立核对主机身份。下次连接会请求重新确认。"
          onClose={() => {
            if (!removing.current) setSelected(null);
          }}
          error={error}
          actions={
            <>
              <Button autoFocus disabled={busy} onClick={() => setSelected(null)}>
                取消
              </Button>
              <Button variant="danger" loading={busy} onClick={() => void forget(selected)}>
                移除指纹
              </Button>
            </>
          }
        >
          <dl className="ssh-key-details">
            <dt>主机地址</dt>
            <dd>{hostEndpoint(selected)}</dd>
            <dt>已保存指纹</dt>
            <dd>
              <code>{selected.fingerprint}</code>
            </dd>
          </dl>
        </Dialog>
      ) : null}
    </div>
  );
}
