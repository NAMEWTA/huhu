import { buffer } from "node:stream/consumers";
import { Splitter, type MimeNode, type SplitterChunk } from "@zone-eu/mailsplit";
import { z } from "zod";
import { attachmentName } from "./draft-attachments.js";

const attachment = z.strictObject({ name: z.string(), mediaType: z.string() });
export const messageBody = z.strictObject({ text: z.string().nullable(), untrustedHtml: z.string().nullable(), attachments: z.array(attachment) });

function decodeCharset(bytes: Buffer, charset: MimeNode["charset"]) {
  try {
    return new TextDecoder(charset || "utf-8").decode(bytes);
  } catch {
    return bytes.toString("utf8");
  }
}

async function parse(source: Buffer, includeBytes: boolean) {
  const stream = new Splitter({ ignoreEmbedded: true, maxHeadSize: 128 * 1024 });
  stream.end(source);
  let node: MimeNode | undefined;
  let chunks: Buffer[] = [];
  let count = 0;
  const attachments: (z.infer<typeof attachment> & { bytes?: Buffer })[] = [];
  let text: string | null = null;
  let untrustedHtml: string | null = null;

  function decodePart(part: MimeNode) {
    const decoder = part.getDecoder();
    const decoded = buffer(decoder);
    decoder.end(Buffer.concat(chunks));
    return decoded;
  }

  async function finishPart() {
    if (!node) return;
    for (let parent = node.parentNode; parent; parent = parent.parentNode) {
      if (parent.disposition === "attachment" || parent.filename) return;
    }
    const mediaType = node.contentType || "text/plain";
    if (node.disposition === "attachment" || node.filename || (!node.multipart && !["text/plain", "text/html"].includes(mediaType))) {
      const name = node.filename || "未命名附件";
      const inlineResource = node.disposition === "inline" || (node.disposition !== "attachment" && node.headers && !!node.headers.getFirst("Content-ID"));
      const canDecode = includeBytes && !node.multipart && !inlineResource && mediaType !== "message/external-body" && attachmentName.safeParse(name).success;
      let bytes: Buffer | undefined;
      if (canDecode) {
        const decoded = await decodePart(node);
        if (decoded.length > 0) bytes = decoded;
      }
      attachments.push({ name, mediaType, ...(bytes && { bytes }) });
      return;
    }
    if (node.multipart || (mediaType === "text/plain" ? text !== null : untrustedHtml !== null)) return;
    const body = decodeCharset(await decodePart(node), node.charset);
    if (mediaType === "text/plain") text = body;
    else untrustedHtml = body;
  }

  for await (const part of stream as AsyncIterable<SplitterChunk>) {
    if (part.type === "node") {
      if (++count > 1024) throw new Error("MIME parts limit exceeded");
      await finishPart();
      node = part;
      chunks = [];
    } else if (part.type === "body") {
      chunks.push(part.value);
    }
  }
  await finishPart();
  return { text, untrustedHtml, attachments };
}

export async function parseMessageBody(source: Buffer): Promise<z.infer<typeof messageBody>> {
  return parse(source, false);
}

export async function parseForwardAttachments(source: Buffer) {
  return (await parse(source, true)).attachments;
}
