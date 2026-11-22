import { randomUUID } from "node:crypto";
import { errors, HuhuError } from "@huhu/contracts";
import { bindCapability, defineCapabilityDescriptor, type HuhuApi } from "@huhu/kernel";
import { z } from "zod";
import { attachmentName, attachmentSize } from "./draft-attachments.js";
import { uuid } from "./draft-content.js";
import type { MailDrafts } from "./drafts.js";

const transfer = { plugin: "mail", exposable: false, defaultExposed: false, risk: "high", scope: "write", idempotency: "handler" } as const;
const handleInput = z.strictObject({ handle: uuid });
const uploadInput = z.strictObject({ draftId: uuid, expectedRevision: uuid, name: attachmentName, size: attachmentSize });
type Upload = z.infer<typeof uploadInput>;
type Slot = { input: Upload; caller: string; controller: AbortController; timer: NodeJS.Timeout; claimed: boolean };
export const MAIL_WEB_ATTACHMENTS_SERVICE = "mail.webAttachments";
export const webAttachmentDescriptors = {
  begin: defineCapabilityDescriptor({
    ...transfer,
    name: "mail.drafts.beginAttachmentUpload",
    title: "登记草稿附件上传",
    description: "为当前浏览器会话登记一次草稿附件上传。",
    input: uploadInput,
    output: handleInput,
  }),
  cancel: defineCapabilityDescriptor({
    ...transfer,
    name: "mail.drafts.cancelAttachmentUpload",
    title: "取消草稿附件上传",
    description: "撤销当前浏览器会话自己的上传句柄。",
    input: handleInput,
    output: z.strictObject({ cancelled: z.boolean() }),
  }),
};

export function registerWebAttachmentUploads(api: HuhuApi, drafts: MailDrafts, lifetime: AbortSignal, sweep: (digest: string) => Promise<unknown>) {
  const slots = new Map<string, Slot>();
  function retire(handle: string, slot: Slot) {
    clearTimeout(slot.timer);
    slots.delete(handle);
    slot.controller.abort();
  }
  function cancel(handle: string, slot: Slot) {
    if (slot.claimed) slot.controller.abort();
    else retire(handle, slot);
  }
  lifetime.addEventListener(
    "abort",
    () => {
      for (const [handle, slot] of slots) retire(handle, slot);
    },
    { once: true },
  );

  api.defineCapability(
    bindCapability(webAttachmentDescriptors.begin, ({ caller, signal }, input) => {
      if (!caller.startsWith("web:")) throw errors.permissionDenied(webAttachmentDescriptors.begin.name);
      api.vault.files.assertWritable();
      signal.throwIfAborted();
      lifetime.throwIfAborted();
      const draft = drafts.get(input.draftId);
      if (!draft) throw errors.notFound("邮件草稿不存在");
      if (draft.revision !== input.expectedRevision) throw errors.versionConflict(draft.revision);
      if (slots.size >= 8 || [...slots.values()].filter((slot) => slot.caller === caller).length >= 2) {
        throw errors.invalidInput("正在处理其他附件，请稍后重试。");
      }
      const handle = randomUUID();
      const slot: Slot = {
        input,
        caller,
        controller: new AbortController(),
        claimed: false,
        timer: setTimeout(() => cancel(handle, slot), 90_000).unref(),
      };
      slots.set(handle, slot);
      return { handle };
    }),
  );
  api.defineCapability(
    bindCapability(webAttachmentDescriptors.cancel, ({ caller }, { handle }) => {
      if (!caller.startsWith("web:")) throw errors.permissionDenied(webAttachmentDescriptors.cancel.name);
      const slot = slots.get(handle);
      if (slot?.caller !== caller) return { cancelled: false };
      cancel(handle, slot);
      return { cancelled: true };
    }),
  );

  return async (caller: string, handle: string, body: ReadableStream<Uint8Array>, contentLength: number | undefined, signal: AbortSignal) => {
    const slot = slots.get(handle);
    if (!slot || slot.caller !== caller || slot.claimed || slot.controller.signal.aborted) throw errors.notFound("上传句柄不可用。");
    slot.claimed = true;
    const active = AbortSignal.any([signal, slot.controller.signal, lifetime]);
    const { draftId, expectedRevision, name, size } = slot.input;
    try {
      if (contentLength !== undefined && contentLength !== size) throw new HuhuError("INVALID_INPUT", "附件大小与登记时不符。");
      const result = await drafts.addUploadedAttachment(
        { draftId, expectedRevision },
        {
          name,
          size,
          async *read(readSignal) {
            const reader = body.getReader();
            const stop = () => void reader.cancel().catch(() => undefined);
            readSignal.addEventListener("abort", stop, { once: true });
            try {
              for (;;) {
                readSignal.throwIfAborted();
                const { done, value } = await reader.read();
                if (done) return;
                yield value;
              }
            } finally {
              readSignal.removeEventListener("abort", stop);
              stop();
            }
          },
        },
        active,
        sweep,
      );
      const {
        draft: { revision, attachments },
        deduped,
      } = result;
      return { status: "attached" as const, draft: { draftId, revision, attachments }, deduped };
    } finally {
      retire(handle, slot);
    }
  };
}

export type MailWebAttachmentUpload = ReturnType<typeof registerWebAttachmentUploads>;
