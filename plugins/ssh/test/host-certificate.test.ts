import { execFileSync } from "node:child_process";
import { createHmac, generateKeyPairSync, sign, type KeyObject } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test, type TestContext } from "vitest";
import { OPENSSH_ED25519_CERT, parseEd25519Authority, verifyHostCertificate } from "../src/engine/host-certificate.js";
import { readIdentityCertificate } from "../src/engine/identity-certificate.js";
import { knownHostRule, matchesKnownHostScope } from "../src/engine/known-host-rules.js";

function uint32(value: number) {
  const bytes = Buffer.alloc(4);
  bytes.writeUInt32BE(value);
  return bytes;
}

function uint64(value: bigint) {
  const bytes = Buffer.alloc(8);
  bytes.writeBigUInt64BE(value);
  return bytes;
}

function sshString(value: string | Buffer) {
  const bytes = Buffer.from(value);
  return Buffer.concat([uint32(bytes.length), bytes]);
}

function rawEd25519(key: KeyObject) {
  return Buffer.from(key.export({ format: "jwk" }).x!, "base64url");
}

const algorithm = "ssh-ed25519";
const host = "service.fixture.invalid";
const issuedAt = 1_763_000_000n;
const expiresAt = issuedAt + 30n;
const time = (seconds: bigint, milliseconds = 0) => new Date(Number(seconds) * 1000 + milliseconds);
const leaf = rawEd25519(generateKeyPairSync("ed25519").publicKey);
const leafKey = Buffer.concat([sshString(algorithm), sshString(leaf)]);
const authority = generateKeyPairSync("ed25519");

test("matches OpenSSH authority scopes against the logical host and port", () => {
  const scope = "*.fixture.invalid,!spare.fixture.invalid,[*.other.invalid]:2222";
  expect(matchesKnownHostScope(scope, "Host.Fixture.Invalid")).toBe(true);
  expect(matchesKnownHostScope(scope, "spare.fixture.invalid")).toBe(false);
  expect(matchesKnownHostScope(scope, "[host.fixture.invalid]:2222")).toBe(false);
  expect(matchesKnownHostScope(scope, "[host.other.invalid]:2222")).toBe(true);
  const salt = Buffer.alloc(20, 19);
  const token = "[::1]:2200";
  const hashed = `|1|${salt.toString("base64")}|${createHmac("sha1", salt).update(token).digest("base64")}`;
  expect(matchesKnownHostScope(hashed, token)).toBe(true);
  expect(matchesKnownHostScope(hashed, "[::1]:2201")).toBe(false);
  expect(knownHostRule(`# @revoked ${token} abc aaa`)).toBeUndefined();
  expect(knownHostRule(`@revoked ${token} ssh-ed25519 ${leafKey.toString("base64")} public fixture`)).toEqual({ marker: "@revoked", scope: token, keyType: algorithm, key: leafKey });
});
const authorityKey = Buffer.concat([sshString(algorithm), sshString(rawEd25519(authority.publicKey))]);
const otherAuthority = generateKeyPairSync("ed25519");
const otherAuthorityKey = Buffer.concat([sshString(algorithm), sshString(rawEd25519(otherAuthority.publicKey))]);

type IssueOptions = {
  certificateAlgorithm?: string;
  kind?: number;
  principals?: Buffer;
  validAfter?: bigint;
  validBefore?: bigint;
  critical?: Buffer;
  extensions?: Buffer;
  ca?: Buffer;
  signer?: KeyObject;
  signatureAlgorithm?: string;
  signatureLength?: number;
  signatureTail?: Buffer;
};

function issue(options: IssueOptions = {}) {
  const type = sshString(options.certificateAlgorithm ?? OPENSSH_ED25519_CERT);
  const nonce = sshString(Buffer.from([255, 0, 127, 145, 1]));
  const data = Buffer.concat([
    type,
    nonce,
    sshString(leaf),
    uint64(0xfedcba9876543210n),
    uint32(options.kind ?? 2),
    sshString("certificate-fixture"),
    sshString(options.principals ?? sshString(host)),
    uint64(options.validAfter ?? issuedAt),
    uint64(options.validBefore ?? expiresAt),
    sshString(options.critical ?? ""),
    sshString(options.extensions ?? ""),
    sshString(Buffer.from([0x77, 0xff])), // Opaque reserved data must still be signed.
    sshString(options.ca ?? authorityKey),
  ]);
  const proof = sign(null, data, options.signer ?? authority.privateKey);
  return Buffer.concat([data, sshString(Buffer.concat([sshString(options.signatureAlgorithm ?? algorithm), sshString(proof.subarray(0, options.signatureLength ?? proof.length)), options.signatureTail ?? Buffer.alloc(0)]))]);
}

function tempDir(context: TestContext) {
  const dir = mkdtempSync(path.join(tmpdir(), "huhu-host-certificate-"));
  context.onTestFinished(() => rmSync(dir, { force: true, recursive: true }));
  return dir;
}

test("parses a canonical bare Ed25519 authority line with an optional comment", () => {
  const encoded = authorityKey.toString("base64");
  const line = `${algorithm} ${encoded}`;
  expect(parseEd25519Authority(`  ${line}\tfixture CA\r\n`)).toEqual(authorityKey);
  const certificate = issue().toString("base64");
  for (const invalid of [
    `@cert-authority fixture ${line}`,
    `${OPENSSH_ED25519_CERT} ${certificate}`,
    `${algorithm} ${certificate}`,
    `ecdsa-sha2-nistp256 ${encoded}`,
    `${algorithm} ${Buffer.alloc(authorityKey.length).toString("base64")}`,
    `${line}\n${line}`,
    `${line} name\0`,
  ]) {
    expect(() => parseEd25519Authority(invalid)).toThrow(expect.objectContaining({ code: "INVALID_INPUT" }));
  }
});

test("verifies an independently generated ssh-keygen host certificate and returns its bare keys", (context) => {
  const dir = tempDir(context);
  const ca = path.join(dir, "ca");
  const subject = path.join(dir, "host");
  const keygen = (args: string[]) => execFileSync("ssh-keygen", args, { stdio: "ignore" });
  try {
    keygen(["-q", "-t", "ed25519", "-N", "", "-f", ca]);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") context.skip("ssh-keygen is unavailable");
    throw error;
  }
  keygen(["-q", "-t", "ed25519", "-N", "", "-f", subject]);
  keygen(["-q", "-s", ca, "-I", "isolated-host-fixture", "-h", "-n", `${host},2001:db8::20`, "-V", "-1h:+1h", subject + ".pub"]);
  const caBlob = parseEd25519Authority(readFileSync(ca + ".pub", "utf8"));
  const subjectBlob = parseEd25519Authority(readFileSync(subject + ".pub", "utf8"));
  const [type, encoded] = readFileSync(subject + "-cert.pub", "utf8").split(/\s+/u);
  expect(type).toBe(OPENSSH_ED25519_CERT);
  const certificate = Buffer.from(encoded!, "base64");
  for (const principal of [host, "2001:db8::20"]) {
    expect(verifyHostCertificate(certificate, principal, new Date(), [caBlob], [])).toEqual({ ok: true, leafKey: subjectBlob, authorityKey: caBlob });
  }
});

test("verifies the original signed prefix, opaque extension data and the exact approved CA", () => {
  const extensions = Buffer.concat([sshString("a@example.invalid"), sshString(Buffer.from([0, 255])), sshString("z@example.invalid"), sshString("")]);
  const valid = issue({ extensions, validBefore: (1n << 64n) - 1n });
  const now = time(expiresAt, 999);
  expect(verifyHostCertificate(valid, host, now, [otherAuthorityKey, authorityKey], [])).toEqual({ ok: true, leafKey, authorityKey });
  expect(verifyHostCertificate(valid, host, now, [otherAuthorityKey], [])).toEqual({ ok: false, reason: "untrusted-ca" });
  expect(verifyHostCertificate(issue({ signer: otherAuthority.privateKey }), host, time(issuedAt), [authorityKey], [])).toEqual({ ok: false, reason: "invalid-signature" });
  const changed = Buffer.from(valid);
  changed[sshString(OPENSSH_ED25519_CERT).length + 4] = 128;
  expect(verifyHostCertificate(changed, host, now, [authorityKey], [])).toEqual({ ok: false, reason: "invalid-signature" });
});

test("binds exact logical principals, with no wildcard or unbound-host semantics", () => {
  const verify = (certificate: Buffer, target = host) => verifyHostCertificate(certificate, target, time(issuedAt), [authorityKey], []);
  for (const target of ["agent-side-name.fixture.invalid", host.toUpperCase(), host + ".", host + ":22"]) {
    expect(verify(issue(), target)).toEqual({ ok: false, reason: "principal-mismatch" });
  }
  expect(verify(issue({ principals: Buffer.alloc(0) }))).toEqual({ ok: false, reason: "no-principals" });
  const malformed = [
    sshString("*.fixture.invalid"),
    sshString(host + "\0"),
    sshString(host + "\n"),
    sshString(""),
    sshString(Buffer.from([0xff])),
    sshString("a".repeat(256)),
    Buffer.concat([sshString(host), sshString(host)]),
    Buffer.concat(Array.from({ length: 257 }, (_, index) => sshString(`host-${index}.fixture.invalid`))),
    uint32(0xffffffff),
  ];
  for (const principals of malformed) expect(verify(issue({ principals }))).toEqual({ ok: false, reason: "invalid-principals" });
});

test("handles certificate type, the half-open validity interval, and critical options", () => {
  const verify = (certificate: Buffer, clock = time(issuedAt)) => verifyHostCertificate(certificate, host, clock, [authorityKey], []);
  expect(verify(issue({ kind: 1 }))).toEqual({ ok: false, reason: "wrong-type" });
  expect(verify(issue({ certificateAlgorithm: "ssh-ed25519-cert" }))).toEqual({ ok: false, reason: "unsupported-certificate" });
  expect(verify(issue(), time(issuedAt - 1n, 999))).toEqual({ ok: false, reason: "not-yet-valid" });
  expect(verify(issue(), time(issuedAt))).toMatchObject({ ok: true });
  expect(verify(issue(), time(expiresAt - 1n, 999))).toMatchObject({ ok: true });
  expect(verify(issue(), time(expiresAt))).toEqual({ ok: false, reason: "expired" });
  expect(verify(issue({ validAfter: expiresAt }))).toEqual({ ok: false, reason: "invalid-validity" });
  expect(verify(issue(), new Date(NaN))).toEqual({ ok: false, reason: "invalid-validity" });
  expect(verify(issue({ critical: Buffer.concat([sshString("unknown@example.invalid"), sshString("")]) }))).toEqual({ ok: false, reason: "unsupported-critical-option" });
});

test("rejects oversized and malformed wire fields, authority keys and signature envelopes", () => {
  const verify = (certificate: Buffer) => verifyHostCertificate(certificate, host, time(issuedAt), [authorityKey], []);
  expect(verify(Buffer.alloc(64 * 1024 + 1))).toEqual({ ok: false, reason: "certificate-too-large" });
  expect(verify(uint32(0xffffffff))).toEqual({ ok: false, reason: "invalid-certificate" });
  expect(verify(issue({ extensions: Buffer.concat([sshString("z"), sshString(""), sshString("a"), sshString("")]) }))).toEqual({ ok: false, reason: "invalid-certificate" });
  expect(verify(issue({ ca: Buffer.concat([sshString("ssh-rsa"), sshString("fixture")]) }))).toEqual({ ok: false, reason: "unsupported-authority" });
  expect(verify(issue({ ca: Buffer.concat([authorityKey, Buffer.from([0])]) }))).toEqual({ ok: false, reason: "invalid-certificate" });
  for (const malformed of [issue({ signatureAlgorithm: OPENSSH_ED25519_CERT }), issue({ signatureLength: 63 }), issue({ signatureTail: Buffer.from([0]) }), issue().subarray(0, -1), Buffer.concat([issue(), Buffer.from([0])])])
    expect(verify(malformed)).toEqual({ ok: false, reason: "invalid-signature" });
});

test("checks revocation by full certificate, canonical leaf key or CA before other policy failures", () => {
  const certificate = issue({ kind: 1, signatureLength: 63 });
  for (const revoked of [certificate, leafKey, authorityKey]) {
    expect(verifyHostCertificate(certificate, "wrong.fixture.invalid", time(expiresAt), [], [revoked])).toEqual({ ok: false, reason: "revoked" });
  }
  expect(verifyHostCertificate(issue(), host, time(issuedAt), [authorityKey], [otherAuthorityKey])).toMatchObject({ ok: true });
});

test("shared wire reader preserves user certificate pairing and error categories", (context) => {
  const identity = path.join(tempDir(context), "identity");
  const file = identity + "-cert.pub";
  const write = (certificate: Buffer) => {
    const line = `${OPENSSH_ED25519_CERT} ${certificate.toString("base64")}`;
    writeFileSync(file, `${line} fixture comment\n`);
    return line;
  };
  const user = write(issue({ kind: 1 }));
  expect(readIdentityCertificate(identity, algorithm, leafKey)).toBe(user);
  expect(() => readIdentityCertificate(identity, algorithm, otherAuthorityKey)).toThrow(expect.objectContaining({ code: "SSH_AUTH_FAILED", details: { reason: "identity-certificate-mismatch" } }));
  write(issue());
  expect(() => readIdentityCertificate(identity, algorithm, leafKey)).toThrow(expect.objectContaining({ code: "SSH_AUTH_FAILED", details: { reason: "identity-certificate-not-user" } }));
  write(issue({ kind: 1 }).subarray(0, -1));
  expect(() => readIdentityCertificate(identity, algorithm, leafKey)).toThrow(expect.objectContaining({ code: "SSH_AUTH_FAILED", details: { reason: "identity-certificate-invalid" } }));
});
