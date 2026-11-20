import { errors } from "@huhu/contracts";
import { unsupportedEncoding } from "../shared/text-encoding.js";

const utf8 = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

export function decodeUtf8(bytes: Uint8Array): string | null {
  try {
    return utf8.decode(bytes);
  } catch {
    return null;
  }
}

export function requireUtf8(bytes: Uint8Array): string {
  const text = decodeUtf8(bytes);
  if (text === null) throw errors.invalidInput(unsupportedEncoding);
  return text;
}

export function textEncodingOf(bytes: Uint8Array): "ok" | "binary" | "encoding" {
  const utf16Bom = (bytes[0] === 0xff && bytes[1] === 0xfe) || (bytes[0] === 0xfe && bytes[1] === 0xff);
  if (utf16Bom) return "encoding";
  if (bytes.includes(0)) return "binary";
  return decodeUtf8(bytes) === null ? "encoding" : "ok";
}
