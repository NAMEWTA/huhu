import { MAIL_PANE_WIDTHS, type Settings } from "@huhu/contracts";
import { queryKey, useCapabilityMutation, useEngine, useQueryClient, type useCapability } from "@huhu/workbench";
import { useCallback, useRef, useState } from "react";

type MailPaneWidths = Settings["mail"];
type Pane = keyof MailPaneWidths;
type PaneSave = { width: number; failed: boolean };

export function useMailPaneWidths(settings: Settings | undefined, access: ReturnType<typeof useCapability<{ readOnly: boolean }>>) {
  const engine = useEngine();
  const query = useQueryClient();
  const [localWidths, setLocalWidths] = useState<Partial<MailPaneWidths>>({});
  const [failed, setFailed] = useState(false);
  const pending = useRef(new Set<Promise<void>>());
  const unsaved = useRef(new Map<Pane, PaneSave>());
  const hasFailure = useCallback(() => [...unsaved.current.values()].some((save) => save.failed), []);
  const { mutateAsync } = useCapabilityMutation<Settings, { pane: Pane; width: number }>(({ pane, width }) => ({ name: "settings.update", input: { patch: { mail: { [pane]: width } } } }), {
    scope: { id: `mail-pane-widths:${engine.vaultId}` },
    async onSuccess(next, { pane }) {
      const key = queryKey(engine.vaultId, "settings.get");
      await query.cancelQueries({ queryKey: key, exact: true });
      query.setQueryData<Settings>(key, (current) => (current ? { ...current, mail: { ...current.mail, [pane]: next.mail[pane] } } : next));
    },
  });

  function savePane(pane: Pane, width: number) {
    const save = { width, failed: false };
    unsaved.current.set(pane, save);
    setFailed(hasFailure());

    async function persist() {
      // Join the existing permission lookup when Mail rendered before vault.info arrived.
      const permission = access.data ?? (await access.refetch({ cancelRefetch: false, throwOnError: true })).data;
      if (!permission) throw new Error("无法确认 Vault 的写入状态。");
      if (!permission.readOnly) await mutateAsync({ pane, width });
    }

    const operation = persist()
      .then(
        () => {
          // An earlier write cannot clear or fail a more recent edit of the same pane.
          if (unsaved.current.get(pane) === save) unsaved.current.delete(pane);
        },
        () => {
          if (unsaved.current.get(pane) === save) {
            save.failed = true;
            setFailed(true);
          }
        },
      )
      .finally(() => pending.current.delete(operation));
    pending.current.add(operation);
  }

  function resize(pane: Pane, width: number) {
    setLocalWidths((current) => ({ ...current, [pane]: width }));
    if (access.data?.readOnly !== true) savePane(pane, width);
  }

  function retry() {
    for (const [pane, save] of unsaved.current) {
      if (save.failed) savePane(pane, save.width);
    }
  }

  const drain = useCallback(async () => {
    // A second resize can arrive while the leave check is waiting for the first write.
    while (pending.current.size > 0) await Promise.all(pending.current);
    return !hasFailure();
  }, [hasFailure]);

  return {
    accountWidth: localWidths.accountWidth ?? settings?.mail?.accountWidth ?? MAIL_PANE_WIDTHS.accountWidth.default,
    contactWidth: localWidths.contactWidth ?? settings?.mail?.contactWidth ?? MAIL_PANE_WIDTHS.contactWidth.default,
    resize,
    failed,
    retry,
    drain,
  };
}
