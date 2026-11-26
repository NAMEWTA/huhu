import { argon2dAsync, argon2iAsync, argon2idAsync } from "@noble/hashes/argon2.js";
import { argon2, createDecipheriv, createHash, createHmac, timingSafeEqual, type Argon2Algorithm } from "node:crypto";
import { promisify } from "node:util";
import { errors, HuhuError } from "@huhu/contracts";
import ssh2 from "ssh2";
import { SshFields } from "./ssh-wire.js";

const nativeArgon2 = promisify(argon2);
const portableArgon2 = { argon2d: argon2dAsync, argon2i: argon2iAsync, argon2id: argon2idAsync } as const;

/**
 * Electron ships BoringSSL, whose Node crypto rejects Argon2 ("Argon2 algorithm not supported"),
 * so PPK v3 falls back to the audited pure-JS implementation when the native KDF is unavailable.
 */
async function derive(algorithm: Argon2Algorithm, options: { message: string; nonce: Buffer; memory: number; passes: number; parallelism: number; tagLength: number }): Promise<Buffer> {
  try {
    return await nativeArgon2(algorithm, options);
  } catch (error) {
    if (!(error instanceof Error) || !/not supported/iu.test(error.message)) throw error;
  }
  const output = await portableArgon2[algorithm](options.message, options.nonce, {
    t: options.passes, m: options.memory, p: options.parallelism, dkLen: options.tagLength, maxmem: options.memory * 1024 + 1024 * 1024,
  });
  return Buffer.from(output);
}
const invalid = (): never => { throw errors.invalidInput("无法读取 PuTTY 私钥，请核对格式、算法与口令"); };
const nativeV2 = /^PuTTY-User-Key-File-2: ssh-(?:rsa|dss)(?:\r?\n)/u;
const prefix = "PuTTY-User-Key-File-";
const defaultCipher = "aes256-cbc";
const macLabel = "putty-private-key-file-mac-key";
const maximumBytes = 64 * 1024;

const uint32 = (value: number) => {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32BE(value);
  return buffer;
};
const field = (value: Buffer | string) => {
  const bytes = Buffer.from(value);
  return Buffer.concat([uint32(bytes.length), bytes]);
};

function positiveInteger(text: string, max: number): number {
  if (!/^[1-9][0-9]{0,6}$/u.test(text)) return invalid();
  const value = Number(text);
  if (value > max) return invalid();
  return value;
}

function opensshKey(algorithm: string, publicBlob: Buffer, privateBlob: Buffer, comment: string) {
  const pub = new SshFields(publicBlob, invalid);
  const priv = new SshFields(privateBlob, invalid);
  if (pub.string().toString() !== algorithm) return invalid();
  const number = (source: SshFields) => {
    const term = source.string();
    if (term.length < 1 || term.length > 1025 || (term[0]! & 0x80) !== 0) return invalid();
    return term;
  };
  let parameters: Buffer[];
  if (algorithm === "ssh-rsa") {
    const exponent = number(pub);
    const modulus = number(pub);
    const d = number(priv);
    const p = number(priv);
    const q = number(priv);
    const inverse = number(priv);
    parameters = [modulus, exponent, d, inverse, p, q];
  } else if (algorithm === "ssh-dss") {
    parameters = [number(pub), number(pub), number(pub), number(pub), number(priv)];
  } else if (/^ecdsa-sha2-nistp(?:256|384|521)$/u.test(algorithm)) {
    const curve = pub.string();
    if (`ecdsa-sha2-${curve.toString()}` !== algorithm) return invalid();
    parameters = [curve, pub.string(), number(priv)];
  } else if (algorithm === "ssh-ed25519") {
    const point = pub.string();
    if (point.length !== 32 || privateBlob.length < 1 || privateBlob.length > 32) return invalid();
    const seed = Buffer.alloc(32);
    privateBlob.copy(seed);
    parameters = [point, Buffer.concat([seed, point])];
  } else return invalid();
  if (!pub.done) return invalid();
  const key = Buffer.concat([uint32(1), uint32(1), field(algorithm), ...parameters.map(field), field(comment)]);
  const pad = Buffer.from(Array.from({ length: 8 - (key.length % 8) }, (_, index) => index + 1));
  const envelope = Buffer.concat([Buffer.from("openssh-key-v1\0"), field("none"), field("none"), uint32(0), uint32(1), field(publicBlob), field(Buffer.concat([key, pad]))]);
  const armored = `-----BEGIN OPENSSH PRIVATE KEY-----\n${envelope.toString("base64").match(/.{1,70}/gu)!.join("\n")}\n-----END OPENSSH PRIVATE KEY-----`;
  const parsed = ssh2.utils.parseKey(armored);
  if (parsed instanceof Error || Array.isArray(parsed) || !parsed.isPrivateKey() || !parsed.getPublicSSH().equals(publicBlob)) return invalid();
  const check = Buffer.from("HUHU PuTTY key validation");
  const hash = algorithm === "ssh-rsa" ? "sha256" : undefined;
  if (parsed.verify(check, parsed.sign(check, hash), hash) !== true) return invalid();
  return armored;
}

// The container layout and authenticated encryption are documented by PuTTY
// Appendix C, with equivalent bounded parsing in Motty internal/ppk.
export async function prepareSshPrivateKey(privateKey: string, passphrase?: string): Promise<{ privateKey: string; passphrase?: string; encrypted?: boolean }> {
  const text = privateKey.replace(/^\uFEFF/u, "");
  if (!text.startsWith(prefix) || nativeV2.test(text)) return { privateKey, ...(passphrase !== undefined && { passphrase }) };
  try {
    if (Buffer.byteLength(privateKey, "utf8") > 256 * 1024) return invalid();
    const lines = text.replace(/\r\n/g, "\n").replace(/\n+$/u, "").split("\n");
    let next = 0;
    function header(name: string) {
      const line = lines[next++];
      if (!line?.startsWith(name + ": ")) return invalid();
      return line.slice(name.length + 2);
    }
    function blob(name: string) {
      const count = positiveInteger(header(name), 2048);
      const end = next + count;
      if (end > lines.length) return invalid();
      const base64 = lines.slice(next, end).join("");
      next = end;
      if (base64.length > (maximumBytes * 4) / 3 + 4) return invalid();
      const bytes = Buffer.from(base64, "base64");
      if (bytes.length > maximumBytes || bytes.toString("base64") !== base64) return invalid();
      return bytes;
    }
    const version = /^PuTTY-User-Key-File-([23]): /u.exec(lines[0]!)?.[1];
    if (!version) return invalid();
    const algorithm = header(prefix + version);
    const encryption = header("Encryption");
    const encrypted = encryption === defaultCipher;
    if ((!encrypted && encryption !== "none") || (encrypted && !passphrase)) return invalid();
    const comment = header("Comment");
    const publicBlob = blob("Public-Lines");
    let cipherMaterial: Buffer | undefined;
    let macKey: Buffer;
    if (version === "3" && encrypted) {
      const derivation = header("Key-Derivation").toLowerCase();
      if (!["argon2d", "argon2i", "argon2id"].includes(derivation)) return invalid();
      const memory = positiveInteger(header("Argon2-Memory"), 128 * 1024);
      const passes = positiveInteger(header("Argon2-Passes"), 64);
      const parallelism = positiveInteger(header("Argon2-Parallelism"), 8);
      const salt = header("Argon2-Salt");
      if (!/^(?:[0-9a-f]{2}){8,64}$/iu.test(salt) || memory < 8 * parallelism || memory * passes > 4 * 1024 * 1024) return invalid();
      cipherMaterial = await derive(derivation as Argon2Algorithm, { message: passphrase!, nonce: Buffer.from(salt, "hex"), memory, passes, parallelism, tagLength: 80 });
      macKey = cipherMaterial.subarray(48);
    } else if (version === "2") {
      const secret = encrypted ? passphrase! : "";
      macKey = createHash("sha1").update(macLabel).update(secret).digest();
      if (encrypted) {
        const parts = [0, 1].map((counter) => createHash("sha1").update(uint32(counter)).update(secret).digest());
        cipherMaterial = Buffer.concat([...parts, Buffer.alloc(16)]).fill(0, 32);
      }
    } else macKey = Buffer.alloc(0);
    const privateBlob = blob("Private-Lines");
    const mac = header("Private-MAC");
    if (next !== lines.length || !/^[0-9a-f]+$/iu.test(mac)) return invalid();
    const decoded = (() => {
      if (!cipherMaterial) return privateBlob;
      if (privateBlob.length % 16) return invalid();
      const decipher = createDecipheriv("aes-256-cbc", cipherMaterial.subarray(0, 32), cipherMaterial.subarray(32, 48));
      decipher.setAutoPadding(false);
      return Buffer.concat([decipher.update(privateBlob), decipher.final()]);
    })();
    const supplied = Buffer.from(mac, "hex");
    const expected = createHmac(version === "3" ? "sha256" : "sha1", macKey)
      .update(Buffer.concat([algorithm, encryption, comment, publicBlob, decoded].map(field))).digest();
    if (mac.length !== expected.length * 2 || !timingSafeEqual(supplied, expected)) return invalid();
    return { privateKey: opensshKey(algorithm, publicBlob, decoded, comment), encrypted };
  } catch (error) {
    if (error instanceof HuhuError) throw error;
    return invalid();
  }
}
