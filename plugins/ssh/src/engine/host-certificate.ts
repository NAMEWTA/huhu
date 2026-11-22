import { createPublicKey, verify } from "node:crypto";
import { isIP } from "node:net";
import { errors } from "@huhu/contracts";
import { SshFields } from "./ssh-wire.js";

export const OPENSSH_ED25519_CERT = "ssh-ed25519-cert-v01@openssh.com";

const ed25519 = Buffer.from("ssh-ed25519");
const ed25519KeyBytes = 32;
const ed25519SignatureBytes = 64;
const bareKeyPrefix = Buffer.concat([Buffer.from([0, 0, 0, ed25519.length]), ed25519, Buffer.from([0, 0, 0, ed25519KeyBytes])]);
const bareKeyBytes = bareKeyPrefix.length + ed25519KeyBytes;
const maxCertificateBytes = 64 * 1024;
const maxPrincipalCount = 256;
const maxPrincipalBytes = 255;
const hostCertificate = 2;

export type HostCertificateFailure =
  | "certificate-too-large"
  | "invalid-certificate"
  | "unsupported-certificate"
  | "wrong-type"
  | "invalid-principals"
  | "no-principals"
  | "principal-mismatch"
  | "invalid-validity"
  | "not-yet-valid"
  | "expired"
  | "unsupported-critical-option"
  | "unsupported-authority"
  | "untrusted-ca"
  | "invalid-signature"
  | "revoked";

export type HostCertificateResult = { ok: true; leafKey: Buffer; authorityKey: Buffer } | { ok: false; reason: HostCertificateFailure };

/** Parse a single bare CA public-key line, without known_hosts markers or host patterns. */
export function parseEd25519Authority(line: string): Buffer {
  if (line.length <= maxCertificateBytes && !line.includes("\0")) {
    const key = /^[ \t]*ssh-ed25519[ \t]+([A-Za-z0-9+/]{68})(?:[ \t]+[^\r\n]*)?(?:\r?\n)?$/u.exec(line)?.[1];
    if (key) {
      const blob = Buffer.from(key, "base64");
      if (blob.length === bareKeyBytes && blob.subarray(0, bareKeyPrefix.length).equals(bareKeyPrefix)) return blob;
    }
  }
  throw errors.invalidInput("主机证书 CA 应为单行 OpenSSH Ed25519 裸公钥");
}

class CertificateRejection extends Error {
  constructor(readonly reason: HostCertificateFailure) {
    super(reason);
  }
}

function reject(reason: HostCertificateFailure): never {
  throw new CertificateRejection(reason);
}

function invalidCertificate(): never {
  return reject("invalid-certificate");
}

function checkPrincipals(bytes: Buffer, host: string) {
  if (!bytes.length) reject("no-principals");
  const invalid = () => reject("invalid-principals");
  const reader = new SshFields(bytes, invalid);
  const names = new Set<string>();
  const utf8 = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
  while (!reader.done) {
    const entry = reader.string();
    if (!entry.length || entry.length > maxPrincipalBytes || names.size >= maxPrincipalCount) invalid();
    let name: string;
    try {
      name = utf8.decode(entry);
    } catch {
      return invalid();
    }
    if ((!isIP(name) && !/^[\p{L}\p{M}\p{N}_.-]+$/u.test(name)) || names.has(name)) invalid();
    names.add(name);
  }
  // Match the caller's logical host literally. The outer CA policy owns address and port rules.
  if (!names.has(host)) reject("principal-mismatch");
}

function checkExtensions(bytes: Buffer) {
  const reader = new SshFields(bytes, invalidCertificate);
  let previous: Buffer | undefined;
  while (!reader.done) {
    const name = reader.string();
    if (!/^[!-~]+$/u.test(name.toString("latin1")) || (previous && previous.compare(name) >= 0)) invalidCertificate();
    reader.string(); // Unknown non-critical extension data is opaque.
    previous = name;
  }
}

export function verifyHostCertificate(blob: Buffer, host: string, now: Date, trustedAuthorities: readonly Buffer[], revoked: readonly Buffer[]): HostCertificateResult {
  try {
    if (blob.length > maxCertificateBytes) reject("certificate-too-large");
    if (revoked.some((key) => key.equals(blob))) reject("revoked");

    const reader = new SshFields(blob, invalidCertificate);
    if (reader.string().toString("latin1") !== OPENSSH_ED25519_CERT) reject("unsupported-certificate");
    reader.string(); // Nonce
    const subject = reader.string();
    if (subject.length !== ed25519KeyBytes) invalidCertificate();
    const leafKey = Buffer.concat([bareKeyPrefix, subject]);
    if (revoked.some((key) => key.equals(leafKey))) reject("revoked");

    reader.uint64(); // Serial
    const type = reader.uint32();
    const identifier = reader.string();
    const principals = reader.string();
    const validAfter = reader.uint64();
    const validBefore = reader.uint64();
    const critical = reader.string();
    const extensions = reader.string();
    reader.string(); // Reserved
    const authorityKey = reader.string();
    const signedBytes = blob.subarray(0, reader.position);
    if (revoked.some((key) => key.equals(authorityKey))) reject("revoked");

    if (type !== hostCertificate) reject("wrong-type");
    if (identifier.includes(0)) invalidCertificate();
    checkPrincipals(principals, host);
    const milliseconds = now.getTime();
    if (!Number.isFinite(milliseconds) || validAfter >= validBefore) reject("invalid-validity");
    const seconds = BigInt(Math.floor(milliseconds / 1000));
    if (seconds < validAfter) reject("not-yet-valid");
    if (seconds >= validBefore) reject("expired");
    if (critical.length) reject("unsupported-critical-option");
    checkExtensions(extensions);

    const authority = new SshFields(authorityKey, invalidCertificate);
    if (!authority.string().equals(ed25519)) reject("unsupported-authority");
    const authorityBytes = authority.string();
    if (authorityBytes.length !== ed25519KeyBytes || !authority.done) invalidCertificate();
    if (!trustedAuthorities.some((key) => key.equals(authorityKey))) reject("untrusted-ca");

    const invalidSignature = () => reject("invalid-signature");
    const remainder = new SshFields(blob.subarray(reader.position), invalidSignature);
    const signatureFields = new SshFields(remainder.string(), invalidSignature);
    const signatureAlgorithm = signatureFields.string();
    const signature = signatureFields.string();
    if (!remainder.done || !signatureFields.done || !signatureAlgorithm.equals(ed25519) || signature.length !== ed25519SignatureBytes) invalidSignature();
    let signatureValid: boolean;
    try {
      const publicKey = createPublicKey({ format: "jwk", key: { kty: "OKP", crv: "Ed25519", x: authorityBytes.toString("base64url") } });
      signatureValid = verify(null, signedBytes, publicKey, signature);
    } catch {
      return invalidSignature();
    }
    if (!signatureValid) invalidSignature();
    return { ok: true, leafKey, authorityKey: Buffer.from(authorityKey) };
  } catch (error) {
    if (error instanceof CertificateRejection) return { ok: false, reason: error.reason };
    throw error;
  }
}
