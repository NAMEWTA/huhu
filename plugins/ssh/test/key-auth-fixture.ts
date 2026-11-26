import { argon2Sync, createCipheriv, createHash, createHmac, generateKeyPairSync, randomBytes } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import ssh2 from "ssh2";

// ssh2 is CommonJS; Playwright loads this fixture through Node ESM, which has no named exports for it.
const { utils } = ssh2;

function raw(value: string | undefined) {
  if (!value) throw new Error("Synthetic key field missing");
  return Buffer.from(value, "base64url");
}

function field(value: Buffer | string) {
  const bytes = Buffer.from(value);
  const size = Buffer.alloc(4);
  size.writeUInt32BE(bytes.length);
  return Buffer.concat([size, bytes]);
}

function number(value: string | undefined) {
  const bytes = raw(value);
  return field((bytes[0]! & 0x80) !== 0 ? Buffer.concat([Buffer.from([0]), bytes]) : bytes);
}

// Generates disposable PuTTY credentials for the loopback SSH server.
export function makePuttyKey(version: 2 | 3, passphrase?: string, format: "ed25519" | "rsa" = "ed25519") {
  const key = format === "rsa" ? generateKeyPairSync("rsa", { modulusLength: 2048 }) : generateKeyPairSync("ed25519");
  const jwk = key.privateKey.export({ format: "jwk" });
  const algorithm = format === "rsa" ? "ssh-rsa" : "ssh-ed25519";
  const publicBlob = Buffer.concat([field(algorithm), ...(format === "rsa" ? [number(jwk.e), number(jwk.n)] : [field(raw(jwk.x))])]);
  let privateBlob = format === "rsa" ? Buffer.concat([number(jwk.d), number(jwk.p), number(jwk.q), number(jwk.qi)]) : raw(jwk.d);
  const encrypted = passphrase !== undefined;
  const encryption = encrypted ? "aes256-cbc" : "none";
  const comment = "huhu fixture with trailing space ";
  let macKey: Buffer = version === 2 ? createHash("sha1").update("putty-private-key-file-mac-key").update(passphrase ?? "").digest() : Buffer.alloc(0);
  const transferHeaders: string[] = [];
  let ciphertext = privateBlob;
  if (encrypted) {
    let keyAndIv: Buffer;
    if (version === 3) {
      const salt = randomBytes(16);
      keyAndIv = argon2Sync("argon2id", { message: passphrase, nonce: salt, memory: 64, passes: 2, parallelism: 1, tagLength: 80 });
      transferHeaders.push("Key-Derivation: Argon2id", "Argon2-Memory: 64", "Argon2-Passes: 2", "Argon2-Parallelism: 1", `Argon2-Salt: ${salt.toString("hex")}`);
      macKey = keyAndIv.subarray(48);
    } else {
      const one = createHash("sha1").update(Buffer.from([0, 0, 0, 0])).update(passphrase).digest();
      const two = createHash("sha1").update(Buffer.from([0, 0, 0, 1])).update(passphrase).digest();
      keyAndIv = Buffer.concat([one, two.subarray(0, 12), Buffer.alloc(16)]);
    }
    const pad = (16 - (privateBlob.length % 16)) % 16;
    privateBlob = Buffer.concat([privateBlob, randomBytes(pad)]);
    const cipher = createCipheriv("aes-256-cbc", keyAndIv.subarray(0, 32), keyAndIv.subarray(32, 48));
    cipher.setAutoPadding(false);
    ciphertext = Buffer.concat([cipher.update(privateBlob), cipher.final()]);
  }
  const digest = createHmac(version === 3 ? "sha256" : "sha1", macKey).update(Buffer.concat([algorithm, encryption, comment, publicBlob, privateBlob].map(field))).digest("hex");
  function lines(label: string, value: Buffer) {
    const encoded = value.toString("base64").match(/.{1,64}/gu)!;
    return [`${label}-Lines: ${encoded.length}`, ...encoded];
  }
  return {
    publicKey: `${algorithm} ${publicBlob.toString("base64")}`,
    privateKey: [
      `PuTTY-User-Key-File-${version}: ${algorithm}`, `Encryption: ${encryption}`, `Comment: ${comment}`,
      ...lines("Public", publicBlob), ...transferHeaders, ...lines("Private", ciphertext), `Private-MAC: ${digest}`, "",
    ].join("\n"),
  };
}

export function supportsFixtureAgent() {
  return process.platform === "linux" && ["/usr/bin/ssh-keygen", "/usr/bin/ssh-agent", "/usr/bin/ssh-add"].every(existsSync);
}

export function makeEncryptedOpenSshKey(passphrase: string) {
  for (let attempt = 0; attempt < 10; attempt++) {
    const key = utils.generateKeyPairSync("ed25519", { passphrase, cipher: "aes256-ctr", rounds: 16 });
    if (!(utils.parseKey(key.private, passphrase) instanceof Error)) return { privateKey: key.private, publicKey: key.public };
  }
  throw new Error("Could not generate an encrypted OpenSSH fixture");
}

export async function startFixtureAgent() {
  const directory = await mkdtemp(path.join(tmpdir(), "huhu-ssh-agent-"));
  const key = path.join(directory, "id");
  const socket = path.join(directory, "agent.sock");
  const child = spawn("/usr/bin/ssh-agent", ["-D", "-a", socket], { stdio: "ignore" });
  const exited = once(child, "exit").catch(() => undefined);
  const close = async () => {
    child.kill();
    await exited;
    await rm(directory, { recursive: true, force: true });
  };
  try {
    execFileSync("/usr/bin/ssh-keygen", ["-q", "-t", "ed25519", "-N", "", "-f", key]);
    const deadline = performance.now() + 2000;
    while (!existsSync(socket) && performance.now() < deadline && child.exitCode === null) await delay(15);
    if (!existsSync(socket)) throw new Error("SSH Agent fixture did not open an isolated socket");
    execFileSync("/usr/bin/ssh-add", [key], { env: { ...process.env, SSH_AUTH_SOCK: socket }, stdio: "ignore" });
    return { socket, publicKey: (await readFile(key + ".pub", "utf8")).trim(), close };
  } catch (error) {
    await close();
    throw error;
  }
}
