import { randomUUID } from "node:crypto";
import { errors, HuhuError } from "@huhu/contracts";
import { CredentialError, ModuleCredentials, type CredentialSummary } from "@huhu/kernel";
import ssh2 from "ssh2";
import type { z } from "zod";
import { SshKeySummary, type AddSshKey } from "../shared/key-library.js";
import { fingerprintSha256 } from "./known-hosts.js";
import type { ConnectionAuth, SshCredentialHost } from "./host-configurations.js";

const KeyDefinition = SshKeySummary.pick({ name: true, keyType: true, publicKey: true, fingerprint: true, encrypted: true });
type KeyDefinition = z.infer<typeof KeyDefinition>;

function translate(error: unknown): never {
  if (!(error instanceof CredentialError)) throw error;
  switch (error.code) {
    case "not-found":
      throw errors.notFound("SSH 密钥");
    case "conflict":
      throw new HuhuError("VERSION_CONFLICT", "SSH 密钥库已更新");
    case "cancelled":
      throw new HuhuError("SSH_DISCONNECTED", "SSH 操作已取消");
    default:
      throw new HuhuError("SSH_AUTH_FAILED", "本机 SSH 密钥不可用", { details: { reason: error.code } });
  }
}

// Normalization follows Motty internal/keyidentity/generate.go (Apache-2.0).
function normalizePrivateKey(value: string): string {
  const text = value.replace(/\r\n?/g, "\n").split("\n").map((line) => line.trim()).join("\n").trim();
  if (!text.includes("PRIVATE KEY") && !text.startsWith("PuTTY-User-Key-File-")) throw errors.invalidInput("请选择或粘贴私钥内容");
  return text + "\n";
}

async function generate(passphrase: string | undefined): Promise<string> {
  // ssh2 emits the OpenSSH format and handles the optional key passphrase.
  return new Promise((resolve, reject) => {
    ssh2.utils.generateKeyPair("ed25519", passphrase ? { passphrase, cipher: "aes256-ctr", rounds: 16 } : {}, (error, pair) => {
      if (error) reject(new HuhuError("INTERNAL", "无法生成 Ed25519 密钥"));
      else resolve(pair.private);
    });
  });
}

export class KeyLibrary {
  private readonly owner: ModuleCredentials<KeyDefinition> | undefined;

  constructor(host?: SshCredentialHost) {
    if (host) {
      this.owner = new ModuleCredentials({
        ...host,
        pluginId: "ssh.keys",
        definition: KeyDefinition,
        targets: ({ encrypted }) => ({ privateKey: "", ...(encrypted ? { passphrase: "" } : {}) }),
      });
    }
  }

  private credentials() {
    if (!this.owner) throw new HuhuError("SSH_AUTH_FAILED", "本机密钥保护不可用");
    return this.owner;
  }

  async list(): Promise<Omit<SshKeySummary, "referenced">[]> {
    const rows = (await this.owner?.list().catch(translate)) ?? [];
    return rows.map(({ definition, ...row }) => this.summary(definition, row)).sort((a, b) => a.name.localeCompare(b.name));
  }

  private summary(definition: KeyDefinition, row: CredentialSummary): Omit<SshKeySummary, "referenced"> {
    return {
      ...definition,
      id: row.entityId,
      revision: row.revision,
      available: row.authState.privateKey === "configured" && (!definition.encrypted || row.authState.passphrase === "configured"),
    };
  }

  async add(input: AddSshKey, signal: AbortSignal): Promise<Omit<SshKeySummary, "referenced">> {
    signal.throwIfAborted();
    const owner = this.credentials();
    const privateKey = input.action === "generate" ? await generate(input.passphrase) : normalizePrivateKey(input.privateKey);
    const key = ssh2.utils.parseKey(privateKey, input.passphrase);
    if (key instanceof Error || Array.isArray(key) || !key.isPrivateKey()) throw errors.invalidInput("无法读取私钥，请核对格式与口令");
    const publicBytes = key.getPublicSSH();
    // A supplied passphrase need not be persisted when an imported key is already unencrypted.
    const parsedWithoutPassphrase = ssh2.utils.parseKey(privateKey);
    const encrypted = parsedWithoutPassphrase instanceof Error;
    const definition = { name: input.name, publicKey: `${key.type} ${publicBytes.toString("base64")}`, keyType: key.type, fingerprint: fingerprintSha256(publicBytes), encrypted };
    const saved = await owner.save({
      entityId: randomUUID(),
      expectedRevision: null,
      definition,
      actions: [
        { purpose: "privateKey", action: "replace", value: privateKey },
        ...(encrypted && input.passphrase ? [{ purpose: "passphrase", action: "replace" as const, value: input.passphrase }] : []),
      ],
      signal,
    }).catch(translate);
    return this.summary(definition, saved);
  }

  async use(id: string, connect: (auth: ConnectionAuth) => Promise<void>) {
    const key = (await this.list()).find((candidate) => candidate.id === id);
    if (!key?.available) throw new HuhuError("SSH_AUTH_FAILED", "所选密钥在本机不可用", { details: { reason: "stored-key-unavailable" } });
    const result = await this.credentials().use(id, key.encrypted ? ["privateKey", "passphrase"] : ["privateKey"], async (_definition, values, revision) => {
      try {
        if (key.revision !== revision) throw errors.versionConflict(revision);
        await connect({ privateKey: values.get("privateKey")!, ...(key.encrypted && { passphrase: values.get("passphrase")! }) });
        return null;
      } catch (error) {
        return error instanceof HuhuError ? error : new HuhuError("SSH_AUTH_FAILED", "所选密钥认证失败");
      }
    }).catch(translate);
    if (result) throw result;
  }

  async remove(id: string, revision: string, signal: AbortSignal): Promise<void> {
    await this.credentials().delete(id, revision, signal).catch(translate);
  }
}
