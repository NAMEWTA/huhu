import { closeSync, constants, fstatSync, lstatSync, openSync, readSync } from "node:fs";
import { HuhuError } from "@huhu/contracts";

const maxCertificateBytes = 64 * 1024;
const certificateAlgorithm = "ssh-ed25519-cert-v01@openssh.com";
const publicKeyAlgorithm = "ssh-ed25519";
const userCertificate = 1;
const ed25519PublicKeyBytes = 32;

const messages = {
  "identity-certificate-unavailable": "本机身份文件的伴随证书不可读，请检查文件类型和权限",
  "identity-certificate-too-large": "本机身份文件的伴随证书超过 64 KiB",
  "identity-certificate-unsupported": "本机伴随证书目前支持 Ed25519 身份",
  "identity-certificate-invalid": "本机身份文件的伴随证书不是有效的 OpenSSH Ed25519 证书",
  "identity-certificate-not-user": "本机身份文件的伴随证书必须是 OpenSSH 用户证书",
  "identity-certificate-mismatch": "本机身份文件的伴随证书与所选私钥不配对",
} as const;

function certificateError(reason: keyof typeof messages): never {
  throw new HuhuError("SSH_AUTH_FAILED", messages[reason], { details: { reason } });
}

function readCompanion(file: string): Buffer | undefined {
  try {
    // An existing symlink (including a dangling one) is not an absent companion.
    const named = lstatSync(file, { bigint: true, throwIfNoEntry: false });
    if (!named) return;
    if (!named.isFile()) certificateError("identity-certificate-unavailable");
    const fd = openSync(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
    try {
      const opened = fstatSync(fd, { bigint: true });
      if (!opened.isFile() || opened.dev !== named.dev || opened.ino !== named.ino) certificateError("identity-certificate-unavailable");
      if (opened.size > BigInt(maxCertificateBytes)) certificateError("identity-certificate-too-large");

      const expected = Number(opened.size);
      const bytes = Buffer.alloc(expected + 1);
      let offset = 0;
      while (offset < bytes.length) {
        const count = readSync(fd, bytes, offset, bytes.length - offset, null);
        if (!count) break;
        offset += count;
      }
      if (offset > maxCertificateBytes) certificateError("identity-certificate-too-large");
      if (offset !== expected) certificateError("identity-certificate-unavailable");
      return bytes.subarray(0, offset);
    } finally {
      closeSync(fd);
    }
  } catch (error) {
    if (error instanceof HuhuError) throw error;
    certificateError("identity-certificate-unavailable");
  }
}

class SshFields {
  private offset = 0;

  constructor(private readonly bytes: Buffer) {}

  get done() {
    return this.offset === this.bytes.length;
  }

  take(length: number): Buffer {
    const begin = this.offset;
    this.offset += length;
    if (this.offset > this.bytes.length) certificateError("identity-certificate-invalid");
    return this.bytes.subarray(begin, this.offset);
  }

  uint32() {
    return this.take(4).readUInt32BE(0);
  }

  string() {
    return this.take(this.uint32());
  }
}

function checkStringList(bytes: Buffer, hasValues: boolean) {
  const fields = new SshFields(bytes);
  while (!fields.done) {
    const name = fields.string();
    if (name.includes(0) || (hasValues && !name.length)) certificateError("identity-certificate-invalid");
    if (hasValues) fields.string();
  }
}

function readAlgorithm(fields: SshFields) {
  const name = fields.string().toString("latin1");
  if (!/^[!-~]+$/u.test(name)) certificateError("identity-certificate-invalid");
  return name;
}

function matchingCertificate(bytes: Buffer, signerPublicKey: Buffer): string {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes).trim();
  } catch {
    certificateError("identity-certificate-invalid");
  }
  const line = /^ssh-ed25519-cert-v01@openssh\.com[ \t]+([A-Za-z0-9+/]+={0,2})(?:[ \t]+[^\r\n]*)?$/u.exec(text);
  const encoded = line?.[1];
  if (!encoded || text.includes("\0")) certificateError("identity-certificate-invalid");
  const blob = Buffer.from(encoded, "base64");
  if (blob.toString("base64") !== encoded) certificateError("identity-certificate-invalid");

  const fields = new SshFields(blob);
  if (readAlgorithm(fields) !== certificateAlgorithm) certificateError("identity-certificate-invalid");
  fields.string(); // Nonce
  const subject = fields.string();
  if (subject.length !== ed25519PublicKeyBytes) certificateError("identity-certificate-invalid");
  fields.take(8); // Serial
  const kind = fields.uint32();
  if (fields.string().includes(0)) certificateError("identity-certificate-invalid"); // Key ID
  checkStringList(fields.string(), false); // Principals
  fields.take(16); // Two uint64 validity timestamps, checked by the server.
  checkStringList(fields.string(), true); // Critical options
  checkStringList(fields.string(), true); // Extensions
  fields.string(); // Reserved
  const authority = new SshFields(fields.string());
  const authorityAlgorithm = readAlgorithm(authority);
  if (authorityAlgorithm.endsWith("-cert-v01@openssh.com") || authority.done) certificateError("identity-certificate-invalid");
  if (authorityAlgorithm === publicKeyAlgorithm && (authority.string().length !== ed25519PublicKeyBytes || !authority.done)) certificateError("identity-certificate-invalid");
  const signature = new SshFields(fields.string());
  const signatureAlgorithm = readAlgorithm(signature);
  const signatureBytes = signature.string();
  if (!signatureBytes.length || (signatureAlgorithm === publicKeyAlgorithm && signatureBytes.length !== 64) || !signature.done || !fields.done) {
    certificateError("identity-certificate-invalid");
  }

  if (kind !== userCertificate) certificateError("identity-certificate-not-user");
  const signer = new SshFields(signerPublicKey);
  if (readAlgorithm(signer) !== publicKeyAlgorithm || !signer.string().equals(subject) || !signer.done) certificateError("identity-certificate-mismatch");
  // Retain the exact wire blob. A file comment is not used for authentication.
  return `${certificateAlgorithm} ${encoded}`;
}

/** Load only the companion of an already-unlocked, locally selected identity. */
export function readIdentityCertificate(identityFile: string, signerAlgorithm: string, signerPublicKey: Buffer): string | undefined {
  const bytes = readCompanion(identityFile + "-cert.pub");
  if (bytes === undefined) return;
  if (signerAlgorithm !== publicKeyAlgorithm) certificateError("identity-certificate-unsupported");
  return matchingCertificate(bytes, signerPublicKey);
}
