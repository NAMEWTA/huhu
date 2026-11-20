import { BrowserWindow, dialog, ipcMain, type IpcMainInvokeEvent, type WebContentsDidStartNavigationEventParams } from "electron";
import { realpath, stat } from "node:fs/promises";
import path from "node:path";
import { selectedFileFingerprint, type SelectDraftAttachment, type SelectDraftAttachmentResult } from "@huhu/plugin-mail/desktop-attachments";
import type { EngineSupervisor } from "./engine-supervisor.js";

const token = /^[a-zA-Z0-9-]{1,128}$/;

function isSelection(value: unknown): value is SelectDraftAttachment {
  if (!value || typeof value !== "object" || Object.keys(value).length !== 4) return false;
  const request = value as Record<string, unknown>;
  return [request["operationId"], request["vaultId"], request["draftId"], request["expectedRevision"]].every((part) => typeof part === "string" && token.test(part));
}

export function registerMailAttachmentPicker(engine: () => EngineSupervisor | null, trustedOrigin: (origin: string) => boolean) {
  const selections = new Map<number, { operationId: string; controller: AbortController }>();
  const authorized = (event: IpcMainInvokeEvent) => !event.sender.isDestroyed() && event.senderFrame && event.senderFrame === event.sender.mainFrame && trustedOrigin(event.senderFrame.origin);

  ipcMain.handle("huhu:mail-draft-attachment:cancel", (event, operationId: unknown) => {
    if (!authorized(event)) return;
    const selection = selections.get(event.sender.id);
    if (selection && selection.operationId === operationId) selection.controller.abort();
  });

  ipcMain.handle("huhu:mail-draft-attachment:select", async (event, input: unknown): Promise<SelectDraftAttachmentResult> => {
    const unavailable = { status: "failed", reason: "unavailable" } as const;
    if (!authorized(event) || !isSelection(input) || selections.has(event.sender.id)) return unavailable;
    const win = BrowserWindow.fromWebContents(event.sender);
    const target = engine();
    const endpoint = target?.mailAttachmentEndpoint(input.vaultId);
    if (!win || !target || !endpoint) return unavailable;

    const sender = event.sender;
    const senderId = sender.id;
    const controller = new AbortController();
    const { signal } = controller;
    const cancel = () => controller.abort();
    const navigating = (detail: Electron.Event<WebContentsDidStartNavigationEventParams>) => {
      if (detail.isMainFrame && !detail.isSameDocument) cancel();
    };
    selections.set(senderId, { operationId: input.operationId, controller });
    sender.once("destroyed", cancel);
    sender.once("render-process-gone", cancel);
    sender.on("did-start-navigation", navigating);
    const cancelled = { status: "cancelled" } as const;
    try {
      const picked = await dialog.showOpenDialog(win, { title: "选择邮件附件", properties: ["openFile"] });
      const selected = picked.filePaths[0];
      if (picked.canceled || !selected || signal.aborted) return cancelled;
      if (!authorized(event) || engine() !== target || target.mailAttachmentEndpoint(input.vaultId) !== endpoint) return unavailable;
      const source = await realpath(selected);
      const metadata = await stat(source, { bigint: true });
      if (!metadata.isFile()) return { status: "failed", reason: "source-missing" };
      if (signal.aborted) return cancelled;
      if (engine() !== target || target.mailAttachmentEndpoint(input.vaultId) !== endpoint) return unavailable;
      return await target.addMailDraftAttachment(
        {
          type: "mail-attachment:add",
          vaultId: input.vaultId,
          draftId: input.draftId,
          expectedRevision: input.expectedRevision,
          file: { path: source, name: path.basename(selected), size: Number(metadata.size), fingerprint: selectedFileFingerprint(metadata) },
        },
        signal,
      );
    } catch (error) {
      if (signal.aborted) return cancelled;
      return { status: "failed", reason: (error as NodeJS.ErrnoException).code === "ENOENT" ? "source-missing" : "failed" };
    } finally {
      selections.delete(senderId);
      if (!sender.isDestroyed()) {
        sender.off("did-start-navigation", navigating);
        sender.off("render-process-gone", cancel);
        sender.off("destroyed", cancel);
      }
    }
  });
}
