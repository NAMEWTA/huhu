import { lookup } from "node:dns";
import { get } from "node:https";
import { BlockList, isIP } from "node:net";
import { parseFragment } from "parse5";
import { isMailBodyElement, remoteImageUrl, type MailHtmlNode } from "../mail-html-tree.js";

export const maxRemoteImages = 8;
export const remoteImageTypes = ["image/png", "image/jpeg", "image/gif", "image/webp", "image/avif"] as const;
type ImageType = (typeof remoteImageTypes)[number];
const maxImageBytes = 512 * 1024;
const denied = new BlockList();
const globalIPv6 = new BlockList();
globalIPv6.addSubnet("2000::", 3, "ipv6");
for (const [address, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 3],
] as const)
  denied.addSubnet(address, prefix);
for (const [address, prefix] of [
  ["2001::", 23],
  ["2001:db8::", 32],
  ["2002::", 16],
  ["3fff::", 20],
] as const) {
  denied.addSubnet(address, prefix, "ipv6");
}

export function isPublicImageAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return !denied.check(address);
  return family === 6 && globalIPv6.check(address, "ipv6") && !denied.check(address, "ipv6");
}

function imageUrls(html: string): string[] {
  const urls = new Set<string>();
  let count = 0;
  function visit(node: MailHtmlNode, depth: number) {
    if (++count > 12_000 || depth > 64 || urls.size >= maxRemoteImages || !isMailBodyElement(node)) return;
    const url = remoteImageUrl(node);
    if (url) urls.add(url);
    for (const child of node.childNodes) visit(child, depth + 1);
  }
  for (const node of parseFragment(html).childNodes) visit(node, 0);
  return [...urls];
}

async function readImage(url: string, signal: AbortSignal) {
  const hostname = new URL(url).hostname;
  // IP literals bypass the lookup hook. All requests must use the vetted DNS result.
  if (isIP(hostname) || hostname.startsWith("[") || !hostname.includes(".")) return null;
  const response = await new Promise<import("node:http").IncomingMessage>((resolve, reject) => {
    get(
      url,
      {
        agent: false,
        rejectUnauthorized: true,
        signal,
        headers: { accept: remoteImageTypes.join(", ") },
        lookup: (name, options, callback) => {
          lookup(name, { all: true }, (error, addresses) => {
            const first = addresses?.[0];
            if (error || !first || addresses.some(({ address }) => !isPublicImageAddress(address))) {
              callback(error ?? new Error("Image host has no public address"), options.all ? [] : "", 0);
              return;
            }
            if (options.all) callback(null, [first]);
            else callback(null, first.address, first.family);
          });
        },
      },
      resolve,
    ).on("error", reject);
  });
  const contentType = response.headers["content-type"]?.split(";")[0]?.trim().toLowerCase();
  if (response.statusCode !== 200 || !remoteImageTypes.includes(contentType as ImageType) || Number(response.headers["content-length"]) > maxImageBytes) {
    response.destroy();
    return null;
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of response as AsyncIterable<Buffer>) {
    size += chunk.length;
    if (size > maxImageBytes) {
      response.destroy();
      return null;
    }
    chunks.push(chunk);
  }
  return size ? { url, mediaType: contentType as ImageType, base64: Buffer.concat(chunks, size).toString("base64") } : null;
}

export async function loadRemoteImages(html: string, cancelled: AbortSignal) {
  const urls = imageUrls(html);
  const signal = AbortSignal.any([cancelled, AbortSignal.timeout(8_000)]);
  const results = await Promise.all(urls.map((url) => readImage(url, signal).catch(() => null)));
  cancelled.throwIfAborted();
  return { images: results.filter((image) => image !== null), failed: results.filter((image) => image === null).length };
}
