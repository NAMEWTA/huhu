import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { HuhuError, errors, newId, type EventPayload, type EventType } from "@huhu/contracts";
import { parseSecretRef } from "../shared/secret-ref.js";
import { checkMatches, deriveKek, keyCheck, newDataKey, newKdf, open, seal, SealError, type Kdf } from "./crypto.js";

export type SecretType = "password" | "ssh-key" | "token" | "env";

export interface ItemMeta {
  id: string;
  name: string;
  type: SecretType;
  account: string;
  allowedModules: string[];
  updatedAt: string;
}

interface Keyring {
  kdf: Kdf;
  wrappedKey: string;
  keyCheck: string;
  createdAt: string;
  autoLockMinutes: number;
  lockOnLeave: boolean;
}

export interface AuditEntry {
  at: string;
  action: "setup" | "unlock" | "unlock-failed" | "lock" | "reveal" | "copy" | "use" | "use-denied" | "update" | "delete" | "change-password";
  itemId: string | null;
  subject: string;
  result: "ok" | "denied" | "failed";
}

export interface SafeDeps {
  /** Vault 根目录下的 safe 目录（`<Vault>/.huhu/safe`）。 */
  dir: string;
  now(): number;
  publish<T extends EventType>(type: T, payload: EventPayload<T>): void;
  /** 测试可降低 scrypt 成本；生产为 N=2^17。 */
  kdfParams?: { N: number; r: number; p: number };
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (h: unknown) => void;
}

const MAX_FAILURES = 5;
const COOLDOWN_MS = 30_000;

/** 保险箱（modules/safe.md）：数据密钥只在内存，锁定即清零；密文与元数据分离存放。 */
export class Safe {
  private dk: Buffer | null = null;
  private failures = 0;
  private cooldownUntil = 0;
  private timer: unknown = null;

  constructor(private readonly d: SafeDeps) {}

  private p(...parts: string[]): string {
    return path.join(this.d.dir, ...parts);
  }
  private keyring(): Keyring | null {
    try {
      return existsSync(this.p("keyring.json")) ? (JSON.parse(readFileSync(this.p("keyring.json"), "utf8")) as Keyring) : null;
    } catch {
      return null;
    }
  }
  private keyringCorrupt(): boolean {
    if (!existsSync(this.p("keyring.json"))) return false;
    try {
      const k = JSON.parse(readFileSync(this.p("keyring.json"), "utf8")) as Keyring;
      return !k.kdf || !k.wrappedKey;
    } catch {
      return true;
    }
  }

  status(): { initialized: boolean; locked: boolean; corrupt: boolean; autoLockMinutes: number; lockOnLeave: boolean; cooldownSeconds: number } {
    const k = this.keyring();
    return {
      initialized: k !== null, locked: this.dk === null, corrupt: this.keyringCorrupt(),
      autoLockMinutes: k?.autoLockMinutes ?? 5, lockOnLeave: k?.lockOnLeave ?? false,
      cooldownSeconds: Math.max(0, Math.ceil((this.cooldownUntil - this.d.now()) / 1000)),
    };
  }

  private audit(a: Omit<AuditEntry, "at">): void {
    mkdirSync(this.d.dir, { recursive: true });
    appendFileSync(this.p("audit.ndjson"), JSON.stringify({ at: new Date(this.d.now()).toISOString(), ...a }) + "\n"); // 不含秘密值
  }

  auditList(limit = 200): AuditEntry[] {
    if (!existsSync(this.p("audit.ndjson"))) return [];
    return readFileSync(this.p("audit.ndjson"), "utf8").split("\n").filter(Boolean).slice(-limit).map((l) => JSON.parse(l) as AuditEntry).reverse();
  }

  async setup(password: string): Promise<void> {
    if (this.keyring() || this.keyringCorrupt()) throw errors.invalidInput("保险箱已经设置过");
    if ([...password].length < 10) throw errors.invalidInput("主密码至少 10 个字符");
    const kdf = newKdf(this.d.kdfParams);
    const kek = await deriveKek(password, kdf);
    const dk = newDataKey();
    const ring: Keyring = { kdf, wrappedKey: seal(kek, dk, "huhu-safe/dk").toString("base64"), keyCheck: keyCheck(dk), createdAt: new Date(this.d.now()).toISOString(), autoLockMinutes: 5, lockOnLeave: false };
    kek.fill(0);
    mkdirSync(this.p("items"), { recursive: true });
    mkdirSync(this.p("sealed"), { recursive: true });
    writeFileSync(this.p("keyring.json"), JSON.stringify(ring, null, 2));
    this.dk = dk;
    this.audit({ action: "setup", itemId: null, subject: "desktop", result: "ok" });
    this.armTimer();
    this.d.publish("plugin.stateChanged", { id: "safe", state: "active" });
  }

  async unlock(password: string): Promise<void> {
    const ring = this.keyring();
    if (this.keyringCorrupt()) throw new HuhuError("INTERNAL", "keyring 文件损坏，保险箱不可用（原文件未被修改）");
    if (!ring) throw errors.invalidInput("保险箱尚未设置");
    if (this.d.now() < this.cooldownUntil) throw new HuhuError("SAFE_BAD_PASSWORD", `尝试过多，请 ${Math.ceil((this.cooldownUntil - this.d.now()) / 1000)} 秒后再试`, { details: { cooldownSeconds: Math.ceil((this.cooldownUntil - this.d.now()) / 1000) } });
    const kek = await deriveKek(password, ring.kdf);
    try {
      const dk = open(kek, Buffer.from(ring.wrappedKey, "base64"), "huhu-safe/dk");
      if (!checkMatches(dk, ring.keyCheck)) throw new SealError("keyCheck");
      this.dk = dk;
      this.failures = 0;
      this.audit({ action: "unlock", itemId: null, subject: "desktop", result: "ok" });
      this.armTimer();
    } catch (e) {
      if (!(e instanceof SealError)) throw e;
      this.failures++;
      if (this.failures >= MAX_FAILURES) {
        this.cooldownUntil = this.d.now() + COOLDOWN_MS;
        this.failures = 0;
      }
      this.audit({ action: "unlock-failed", itemId: null, subject: "desktop", result: "failed" });
      throw new HuhuError("SAFE_BAD_PASSWORD", "主密码不正确");
    } finally {
      kek.fill(0);
    }
  }

  lock(reason: "manual" | "auto" | "leave" | "close" = "manual"): void {
    if (this.dk) {
      this.dk.fill(0); // 清零后丢弃
      this.dk = null;
      this.audit({ action: "lock", itemId: null, subject: reason, result: "ok" });
    }
    this.disarmTimer();
  }

  private armTimer(): void {
    this.disarmTimer();
    const mins = this.keyring()?.autoLockMinutes ?? 5;
    this.timer = (this.d.setTimer ?? setTimeout)(() => this.lock("auto"), mins * 60_000);
  }
  private disarmTimer(): void {
    if (this.timer !== null) (this.d.clearTimer ?? clearTimeout)(this.timer as never);
    this.timer = null;
  }

  private key(): Buffer {
    if (!this.dk) throw new HuhuError("SAFE_LOCKED", "保险箱已锁定", { recovery: [{ action: "unlock-safe", label: "解锁保险箱" }] });
    this.armTimer(); // 任何保险箱操作都会重置计时
    return this.dk;
  }

  async changePassword(oldPassword: string, newPassword: string): Promise<void> {
    const ring = this.keyring();
    if (!ring) throw errors.invalidInput("保险箱尚未设置");
    if ([...newPassword].length < 10) throw errors.invalidInput("新主密码至少 10 个字符");
    const oldKek = await deriveKek(oldPassword, ring.kdf);
    let dk: Buffer;
    try {
      dk = open(oldKek, Buffer.from(ring.wrappedKey, "base64"), "huhu-safe/dk");
    } catch {
      throw new HuhuError("SAFE_BAD_PASSWORD", "主密码不正确");
    } finally {
      oldKek.fill(0);
    }
    const kdf = newKdf(this.d.kdfParams);
    const kek = await deriveKek(newPassword, kdf);
    const next: Keyring = { ...ring, kdf, wrappedKey: seal(kek, dk, "huhu-safe/dk").toString("base64") };
    kek.fill(0);
    writeFileSync(this.p("keyring.json"), JSON.stringify(next, null, 2)); // 秘密文件不变
    this.audit({ action: "change-password", itemId: null, subject: "desktop", result: "ok" });
  }

  updateSettings(s: { autoLockMinutes?: number; lockOnLeave?: boolean }): void {
    const ring = this.keyring();
    if (!ring) throw errors.invalidInput("保险箱尚未设置");
    if (s.autoLockMinutes !== undefined && ![1, 5, 15, 30].includes(s.autoLockMinutes)) throw errors.invalidInput("自动锁定时间只能是 1/5/15/30 分钟");
    writeFileSync(this.p("keyring.json"), JSON.stringify({ ...ring, ...(s.autoLockMinutes !== undefined ? { autoLockMinutes: s.autoLockMinutes } : {}), ...(s.lockOnLeave !== undefined ? { lockOnLeave: s.lockOnLeave } : {}) }, null, 2));
    if (this.dk) this.armTimer();
  }

  // ---- 条目 ----
  private meta(id: string): ItemMeta | null {
    try {
      return JSON.parse(readFileSync(this.p("items", `${id}.json`), "utf8")) as ItemMeta;
    } catch {
      return null;
    }
  }

  itemsList(): ItemMeta[] {
    this.key();
    const dir = this.p("items");
    if (!existsSync(dir)) return [];
    return readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => JSON.parse(readFileSync(path.join(dir, f), "utf8")) as ItemMeta).sort((a, b) => a.name.localeCompare(b.name));
  }

  itemSave(input: { id?: string; name: string; type: SecretType; account?: string; allowedModules?: string[]; value?: string }): ItemMeta {
    const dk = this.key();
    if (!input.name.trim()) throw errors.invalidInput("名称必填");
    const existing = input.id ? this.meta(input.id) : null;
    if (input.id && !existing) throw errors.notFound("条目不存在");
    if (!existing && (input.value === undefined || input.value === "")) throw errors.invalidInput("新条目必须提供秘密值");
    const id = existing?.id ?? newId("item");
    const meta: ItemMeta = { id, name: input.name.trim(), type: input.type, account: input.account ?? "", allowedModules: input.allowedModules ?? existing?.allowedModules ?? [], updatedAt: new Date(this.d.now()).toISOString() };
    mkdirSync(this.p("items"), { recursive: true });
    mkdirSync(this.p("sealed"), { recursive: true });
    if (input.value !== undefined && input.value !== "") writeFileSync(this.p("sealed", `${id}.bin`), seal(dk, Buffer.from(input.value), `item:${id}`)); // AAD 绑定 itemId
    writeFileSync(this.p("items", `${id}.json`), JSON.stringify(meta, null, 2));
    this.audit({ action: "update", itemId: id, subject: "desktop", result: "ok" });
    return meta;
  }

  itemDelete(id: string): void {
    this.key();
    if (!this.meta(id)) throw errors.notFound("条目不存在");
    rmSync(this.p("items", `${id}.json`), { force: true });
    rmSync(this.p("sealed", `${id}.bin`), { force: true });
    this.audit({ action: "delete", itemId: id, subject: "desktop", result: "ok" });
  }

  private readValue(id: string): string {
    const dk = this.key();
    const f = this.p("sealed", `${id}.bin`);
    if (!existsSync(f)) throw errors.notFound("秘密值不存在");
    try {
      return open(dk, readFileSync(f), `item:${id}`).toString("utf8");
    } catch {
      throw new HuhuError("INTERNAL", "秘密值无法解封（文件被篡改或损坏）");
    }
  }

  /** 桌面显示/复制；记录审计，不记值。 */
  reveal(id: string, purpose: "reveal" | "copy" = "reveal"): string {
    const v = this.readValue(id);
    this.audit({ action: purpose, itemId: id, subject: "desktop", result: "ok" });
    return v;
  }

  /** 其他模块按引用使用秘密（SecretUse）：校验格式、存在、允许模块、已解锁。 */
  resolve(ref: string, ctx: { plugin: string; purpose: string }): string {
    const id = parseSecretRef(ref);
    if (!id) throw new HuhuError("SECRET_REF_INVALID", "凭据引用格式无效");
    if (!this.dk) throw new HuhuError("SAFE_LOCKED", "保险箱已锁定", { recovery: [{ action: "unlock-safe", label: "解锁保险箱" }] });
    const meta = this.meta(id);
    if (!meta || !meta.allowedModules.includes(ctx.plugin)) {
      this.audit({ action: "use-denied", itemId: meta ? id : null, subject: ctx.plugin, result: "denied" });
      throw new HuhuError("SECRET_REF_INVALID", "引用的凭据不存在或不允许本模块使用");
    }
    const v = this.readValue(id);
    this.audit({ action: "use", itemId: id, subject: ctx.plugin, result: "ok" });
    return v;
  }
}

