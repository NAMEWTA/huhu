import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { HuhuError } from "@huhu/contracts";
import { exportPackage, importPackage, PACKAGE_MANIFEST } from "@huhu/vault";
import { maxMailArchiveBytes } from "../mail-subset-limit.js";

const maxPayload = 36 * 1024 * 1024;
const vaultFile = ".huhu/vault.json";
const mailFile = ".huhu/mail/subset.json";
const limits = new Map([
  [PACKAGE_MANIFEST, 128 * 1024],
  [vaultFile, 64 * 1024],
  [mailFile, maxPayload],
]);

function invalid(reason: "invalid-package" | "package-too-large") {
  return new HuhuError("INVALID_INPUT", reason === "package-too-large" ? "Mail 子集包超过大小上限。" : "请选择有效的 Huhu Mail 子集 ZIP。", { details: { reason } });
}

// Admission only. The shared Huhu importer still owns ZIP extraction, manifest and hash checks.
function checkArchive(bytes: Buffer) {
  if (bytes.length > maxMailArchiveBytes) throw invalid("package-too-large");
  const end = bytes.length - 22;
  if (end < 20 || bytes.readUInt32LE(end) !== 0x06054b50 || bytes.readUInt32LE(end - 20) === 0x07064b50 || bytes.readUInt16LE(end + 4) || bytes.readUInt16LE(end + 6) || bytes.readUInt16LE(end + 20)) throw invalid("invalid-package");
  if (bytes.readUInt16LE(end + 8) !== limits.size || bytes.readUInt16LE(end + 10) !== limits.size) throw invalid("invalid-package");
  const start = bytes.readUInt32LE(end + 16);
  if (start + bytes.readUInt32LE(end + 12) !== end) throw invalid("invalid-package");
  const seen = new Set<string>();
  let offset = start;
  for (let i = 0; i < limits.size; i++) {
    if (offset + 46 > end || bytes.readUInt32LE(offset) !== 0x02014b50) throw invalid("invalid-package");
    const flags = bytes.readUInt16LE(offset + 8);
    const method = bytes.readUInt16LE(offset + 10);
    const compressed = bytes.readUInt32LE(offset + 20);
    const original = bytes.readUInt32LE(offset + 24);
    const nameLength = bytes.readUInt16LE(offset + 28);
    const nameEnd = offset + 46 + nameLength;
    const next = nameEnd + bytes.readUInt16LE(offset + 30) + bytes.readUInt16LE(offset + 32);
    if (next > end || (flags & ~0x0808) !== 0 || (method !== 0 && method !== 8)) throw invalid("invalid-package");
    const name = bytes.toString("utf8", offset + 46, nameEnd);
    const cap = limits.get(name);
    if (cap === undefined || seen.has(name)) throw invalid("invalid-package");
    if (original > cap) throw invalid("package-too-large");
    const local = bytes.readUInt32LE(offset + 42);
    if (local + 30 > start || bytes.readUInt32LE(local) !== 0x04034b50 || bytes.readUInt16LE(local + 26) !== nameLength || bytes.readUInt16LE(local + 8) !== method) throw invalid("invalid-package");
    if (local + 30 + nameLength + bytes.readUInt16LE(local + 28) + compressed > start || bytes.toString("utf8", local + 30, local + 30 + nameLength) !== name) throw invalid("invalid-package");
    seen.add(name);
    offset = next;
  }
  if (offset !== end) throw invalid("invalid-package");
}

function scratch() {
  const parent = path.resolve(tmpdir());
  const root = mkdtempSync(path.join(parent, "huhu-mail-subset-"));
  return {
    root,
    close: () => {
      if (path.dirname(root) === parent && path.basename(root).startsWith("huhu-mail-subset-")) rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    },
  };
}

export function readMailArchive(bytes: Buffer): unknown {
  checkArchive(bytes);
  const temp = scratch();
  try {
    const archive = path.join(temp.root, "mail.zip");
    writeFileSync(archive, bytes, { flag: "wx" });
    const target = path.join(temp.root, "validated");
    importPackage(archive, target);
    return JSON.parse(readFileSync(path.join(target, mailFile), "utf8"));
  } catch {
    throw invalid("invalid-package");
  } finally {
    temp.close();
  }
}

export async function createMailArchive(vault: Buffer, payload: unknown, signal: AbortSignal) {
  const raw = Buffer.from(JSON.stringify(payload));
  if (raw.length > maxPayload) throw invalid("package-too-large");
  const temp = scratch();
  try {
    const source = path.join(temp.root, "source");
    mkdirSync(path.join(source, ".huhu", "mail"), { recursive: true });
    writeFileSync(path.join(source, vaultFile), vault);
    writeFileSync(path.join(source, mailFile), raw);
    const zip = path.join(temp.root, "mail.zip");
    await exportPackage(source, zip, { signal });
    if (statSync(zip).size > maxMailArchiveBytes) throw invalid("package-too-large");
    return readFileSync(zip);
  } finally {
    temp.close();
  }
}
