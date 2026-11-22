import { execFileSync } from "node:child_process";
import { createHmac, generateKeyPairSync, sign, type KeyObject } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test, type TestContext } from "vitest";
import { OPENSSH_ED25519_CERT, parseEd25519Authority, verifyHostCertificate } from "../src/engine/host-certificate.js";
import { readIdentityCertificate } from "../src/engine/identity-certificate.js";
import { knownHostRule, matchesKnownHostScope } from "../src/engine/known-host-rules.js";
import { fingerprintSha256, KnownHosts } from "../src/engine/known-hosts.js";

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
const otherLeaf = rawEd25519(generateKeyPairSync("ed25519").publicKey);
const otherLeafKey = Buffer.concat([sshString(algorithm), sshString(otherLeaf)]);
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
  subject?: Buffer;
  serial?: bigint;
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
    sshString(options.subject ?? leaf),
    uint64(options.serial ?? 0xfedcba9876543210n),
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

function withKnownHosts(context: TestContext, ...lines: string[]) {
  const file = path.join(tempDir(context), "known_hosts");
  if (lines.length) writeFileSync(file, lines.join("\n") + "\n");
  return new KnownHosts(file);
}

function knownHostLine(scope: string, key = authorityKey, keyType = algorithm) {
  return `${scope} ${keyType} ${key.toString("base64")}`;
}

function hashedScope(hostToken: string) {
  const salt = Buffer.alloc(20, 19);
  return `|1|${salt.toString("base64")}|${createHmac("sha1", salt).update(hostToken).digest("base64")}`;
}

test("revokes renewed certificates and bare keys with the same leaf within the recorded scope", (context) => {
  const prior = issue({ serial: 10n, validBefore: issuedAt });
  const renewed = issue({ serial: 11n, ca: otherAuthorityKey, signer: otherAuthority.privateKey });
  const different = issue({ subject: otherLeaf });
  const revoke = knownHostLine(`@revoked [${host}]:2200`, prior, OPENSSH_ED25519_CERT);
  const certPolicy = withKnownHosts(context, revoke, knownHostLine(`@cert-authority [${host}]:2200`), knownHostLine(`@cert-authority [${host}]:2200`, otherAuthorityKey), knownHostLine(`@cert-authority [${host}]:2201`, otherAuthorityKey));
  const now = time(issuedAt);
  for (const cert of [prior, renewed]) {
    expect(certPolicy.check(host, 2200, OPENSSH_ED25519_CERT, cert, now)).toEqual({ state: "blocked", reason: "revoked" });
  }
  expect(certPolicy.check(host, 2200, OPENSSH_ED25519_CERT, different, now)).toMatchObject({ state: "trusted", key: otherLeafKey });
  expect(certPolicy.check(host, 2201, OPENSSH_ED25519_CERT, renewed, now)).toMatchObject({ state: "trusted", key: leafKey });
  expect(verifyHostCertificate(renewed, host, now, [otherAuthorityKey], [prior])).toEqual({ ok: false, reason: "revoked" });
  const barePolicy = withKnownHosts(context, revoke, knownHostLine(`[${host}]:2200`, leafKey), knownHostLine(`[${host}]:2201`, leafKey), knownHostLine(`[${host}]:2200`, otherLeafKey));
  expect(barePolicy.check(host, 2200, algorithm, leafKey, now)).toEqual({ state: "blocked", reason: "revoked" });
  expect(barePolicy.check(host, 2200, algorithm, otherLeafKey, now)).toEqual({ state: "trusted", key: otherLeafKey });
  expect(barePolicy.check(host, 2201, algorithm, leafKey, now)).toEqual({ state: "trusted", key: leafKey });
});

for (const { pattern, port } of [
  { pattern: host, port: 22 },
  { pattern: hashedScope(host), port: 22 },
  { pattern: "*.fixture.invalid,!spare.fixture.invalid", port: 22 },
  { pattern: "[*.fixture.invalid]:2222", port: 2222 },
  { pattern: hashedScope(`[${host}]:2222`), port: 2222 },
]) {
  test(`applies ordinary ${pattern} pins to the certified leaf at port ${port}`, (context) => {
    const token = port === 22 ? host : `[${host}]:${port}`;
    const store = withKnownHosts(context, knownHostLine(`@cert-authority ${token}`), knownHostLine(pattern, otherLeafKey), knownHostLine(`[${host}]:2201`, leafKey));
    expect(store.check(host, port, OPENSSH_ED25519_CERT, issue(), time(issuedAt))).toEqual({ state: "mismatch", key: leafKey, recorded: [fingerprintSha256(otherLeafKey)] });
    expect(store.check(host, port, OPENSSH_ED25519_CERT, issue({ subject: otherLeaf }), time(issuedAt))).toMatchObject({ state: "trusted", key: otherLeafKey });
  });
}

test("accepts any matching pin, honors exclusions and keeps unmodified bare-key lookup", (context) => {
  const spare = "spare.fixture.invalid";
  const now = time(issuedAt);
  const store = withKnownHosts(context, knownHostLine("@cert-authority *.fixture.invalid"), knownHostLine(`*.fixture.invalid,!${spare}`, otherLeafKey), knownHostLine(hashedScope(host), leafKey));
  expect(store.check(host, 22, OPENSSH_ED25519_CERT, issue(), now)).toMatchObject({ state: "trusted", key: leafKey });
  expect(store.check(spare, 22, OPENSSH_ED25519_CERT, issue({ principals: sshString(spare) }), now)).toMatchObject({ state: "trusted", key: leafKey });
  const bare = withKnownHosts(context, knownHostLine(hashedScope(host), otherLeafKey), knownHostLine("*.fixture.invalid", otherLeafKey));
  expect(bare.check(host, 22, algorithm, leafKey, now)).toEqual({ state: "unknown" });
  expect(bare.list()).toEqual([{ host: "*.fixture.invalid", port: 22, keyType: algorithm, fingerprint: fingerprintSha256(otherLeafKey) }]);
});

test("CA approvals preserve the chosen literal DNS/IP address and actual port", async (context) => {
  const store = withKnownHosts(context);
  const key = `${algorithm} ${authorityKey.toString("base64")}`;
  const approved = await store.addAuthority(host.toUpperCase(), 2222, key, null, context.signal);
  const cases = [
    [`[${host}]:2222`, 22],
    [`${host}:2222`, 22],
    ["[2001:db8::20]", 2222],
    ["2001:db8::not-ip", 2222],
    ["almost..fixture.invalid", 22],
    ["a".repeat(64) + ".fixture.invalid", 22],
    ["*.fixture.invalid", 22],
    [host, 0],
    [host, 65536],
  ] as const;
  for (const [name, port] of cases) {
    await expect(store.addAuthority(name, port, key, approved.revision, context.signal)).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(store.authorities()).toEqual(approved);
  }
  expect(approved.authorities.map(({ scope }) => scope)).toEqual([`[${host}]:2222`]);
  expect(store.certificateRequired(host, 2222)).toBe(true);
  expect(store.certificateRequired(host, 22)).toBe(false);
  expect(() => store.certificateRequired(`[${host}]:2222`, 22)).toThrow(expect.objectContaining({ code: "SSH_HOST_KEY_MISMATCH" }));

  for (const [name, port, expectedScope] of [
    ["192.0.2.10", 22, "192.0.2.10"],
    ["2001:DB8::20", 22, "2001:db8::20"],
    ["2001:DB8::20", 2222, "[2001:db8::20]:2222"],
    ["dns.fixture.invalid.", 65535, "[dns.fixture.invalid.]:65535"],
  ] as const) {
    const literal = withKnownHosts(context);
    const saved = await literal.addAuthority(name, port, key, null, context.signal);
    expect(saved.authorities.map(({ scope }) => scope)).toEqual([expectedScope]);
    expect(literal.certificateRequired(name, port)).toBe(true);
    expect(literal.certificateRequired(name, port === 22 ? 2222 : 22)).toBe(false);
  }
});

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

test("recognizes a CA by its revoked certificate leaf and requires complete revocation wire fields", () => {
  const revokedAuthority = issue({ subject: rawEd25519(authority.publicKey), ca: otherAuthorityKey, signer: otherAuthority.privateKey });
  expect(verifyHostCertificate(issue(), host, time(issuedAt), [authorityKey], [revokedAuthority])).toEqual({ ok: false, reason: "revoked" });
  const truncated = issue({ serial: 1n }).subarray(0, -1);
  expect(verifyHostCertificate(issue(), host, time(issuedAt), [authorityKey], [truncated])).toMatchObject({ ok: true });
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
