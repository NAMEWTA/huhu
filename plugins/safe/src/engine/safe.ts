import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { HuhuError, errors, newId, type EventPayload, type EventType } from "@huhu/contracts";
import { parseSecretRef } from "../shared/secret-ref.js";
import { checkMatches, deriveKek, keyCheck, newDataKey, newKdf, open, seal, SealError } from "./crypto.js";
import type { CreateEntry, EditTarget, SafeSession, StoredEntry, UpdateAccount, UpdateEntry } from "./personal.js";
import { AUTO_LOCK_MINUTES, SAFE_FORMAT, authenticateManifest, corruptStore, SafeStore, wrappingContext, type CurrentSafe, type EntryPrecondition, type Keyring, type LoadedSafe, type SafeFiles } from "./store.js";

export type SecretType = "password" | "ssh-key" | "token" | "env";

export interface ItemMeta {
  id: string;
  name: string;
  type: SecretType;
  account: string;
  allowedModules: string[];
  updatedAt: string;
}

export interface AuditEntry {
  at: string;
  action: "setup" | "unlock" | "unlock-failed" | "lock" | "reveal" | "copy" | "use" | "use-denied" | "update" | "delete" | "change-password" | "create-entry" | "update-entry" | "update-account" | "reveal-account";
  itemId: string | null;
  subject: string;
  result: "ok" | "denied" | "failed";
}

export interface SafeDeps {
  /** Vault 根目录下的 safe 目录（`<Vault>/.huhu/safe`）。 */
  dir: string;
  files: SafeFiles;
  now(): number;
  publish<T extends EventType>(type: T, payload: EventPayload<T>): void;
  /** 测试可降低 scrypt 成本；生产为 N=2^17。 */
  kdfParams?: { N: number; r: number; p: number };
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (h: unknown) => void;
}

const MAX_FAILURES = 5;
const COOLDOWN_MS = 30_000;

function locked(): HuhuError {
  return new HuhuError("SAFE_LOCKED", "保险箱已锁定或会话已失效", { recovery: [{ action: "unlock-safe", label: "解锁保险箱" }] });
}

/** 数据密钥随解锁代持有，代失效时清零。 */
export class Safe {
  private readonly store: SafeStore;
  private readonly instanceId = randomUUID();
  private session: { key: Buffer; identity: string } | null = null;
  private damagedManifest: string | null = null;
  private generation = 0;
  private stopped = false;
  private keyOperationPending = false;
  private failures = 0;
  private cooldownUntil = 0;
  private timer: { handle: unknown } | null = null;

  constructor(private readonly d: SafeDeps) {
    this.store = new SafeStore(d.files, d.dir);
  }

  private p(...parts: string[]): string {
    return path.join(this.d.dir, ...parts);
  }
  private storageState(): ReturnType<SafeStore["load"]> {
    const state = this.store.load();
    if (state.kind === "ready" && state.manifest?.checksum === this.damagedManifest) {
      if (this.session) this.invalidate("corrupt");
      return { kind: "corrupt", file: "manifest.json" };
    }
    if (!this.session) return state;
    if (state.kind !== "ready" || this.session.identity !== state.ring.keyCheck) {
      this.invalidate("corrupt");
      return state;
    }
    try {
      this.checkManifest(state, this.session.key);
      return state;
    } catch {
      this.invalidate("corrupt");
      return { kind: "corrupt", file: "manifest.json" };
    }
  }

  status() {
    const state = this.storageState();
    const ring = state.kind === "ready" ? state.ring : null;
    return {
      initialized: state.kind !== "empty",
      locked: this.session === null,
      corrupt: state.kind === "corrupt",
      ...(state.kind === "corrupt" ? { corruptFile: state.file } : {}),
      autoLockMinutes: ring?.autoLockMinutes ?? 5,
      lockOnLeave: ring?.lockOnLeave ?? false,
      cooldownSeconds: this.cooldownRemaining(),
      instanceId: this.instanceId,
      generation: this.generation,
    };
  }

  private audit(a: Omit<AuditEntry, "at">): void {
    if (this.d.files.readOnly) return;
    mkdirSync(this.d.dir, { recursive: true });
    appendFileSync(this.p("audit.ndjson"), JSON.stringify({ at: new Date(this.d.now()).toISOString(), ...a }) + "\n"); // 不含秘密值
  }

  private auditLifecycle(action: "setup" | "unlock" | "unlock-failed" | "lock" | "change-password", subject = "desktop"): void {
    this.auditBestEffort({ action, itemId: null, subject, result: action === "unlock-failed" ? "failed" : "ok" });
  }

  private auditBestEffort(entry: Omit<AuditEntry, "at">): void {
    try {
      this.audit(entry);
    } catch {
      // Audit I/O cannot block session invalidation or reverse a published commit.
    }
  }

  auditList(limit = 200): AuditEntry[] {
    if (!existsSync(this.p("audit.ndjson"))) return [];
    return readFileSync(this.p("audit.ndjson"), "utf8")
      .split("\n")
      .filter(Boolean)
      .slice(-limit)
      .map((l) => JSON.parse(l) as AuditEntry)
      .reverse();
  }

  async setup(password: string, signal?: AbortSignal): Promise<void> {
    await this.withKeyOperation(signal, async (guard) => {
      const state = this.storageState();
      if (state.kind === "corrupt") throw corruptStore(state.file);
      if (state.kind === "ready") throw errors.invalidInput("保险箱已经设置过");
      if ([...password].length < 10) throw errors.invalidInput("主密码至少 10 个字符");
      this.d.files.assertWritable();
      const kdf = newKdf(this.d.kdfParams);
      const kek = await deriveKek(password, kdf);
      const dk = newDataKey();
      try {
        guard();
        const identity = { format: SAFE_FORMAT, vaultKeyId: randomUUID() } as const;
        const ring = {
          ...identity,
          kdf,
          wrappedKey: seal(kek, dk, wrappingContext(identity)).toString("base64"),
          keyCheck: keyCheck(dk),
          createdAt: new Date(this.d.now()).toISOString(),
          autoLockMinutes: 5,
          lockOnLeave: false,
        };
        await this.store.initialize(ring, dk, guard);
        guard();
        this.activate(dk, ring);
        this.auditLifecycle("setup");
        this.d.publish("plugin.stateChanged", { id: "safe", state: "active" });
      } finally {
        kek.fill(0);
        if (this.session?.key !== dk) dk.fill(0);
      }
    });
  }

  async unlock(password: string, signal?: AbortSignal): Promise<void> {
    await this.withKeyOperation(signal, async (guard) => {
      const store = this.requireStore();
      const dk = await this.unwrap(password, store, guard);
      try {
        guard();
        this.activate(dk, store.ring);
        this.auditLifecycle("unlock");
        this.d.publish("safe.unlocked", {});
      } finally {
        if (this.session?.key !== dk) dk.fill(0);
      }
    });
  }

  async changePassword(oldPassword: string, newPassword: string, signal?: AbortSignal): Promise<void> {
    await this.withKeyOperation(signal, async (guard) => {
      const store = this.requireStore();
      if ([...newPassword].length < 10) throw errors.invalidInput("新主密码至少 10 个字符");
      this.d.files.assertWritable();
      const dk = await this.unwrap(oldPassword, store, guard);
      try {
        guard();
        const kdf = newKdf(this.d.kdfParams);
        const kek = await deriveKek(newPassword, kdf);
        try {
          guard();
          const next: Keyring = { ...store.ring, kdf, wrappedKey: seal(kek, dk, wrappingContext(store.ring)).toString("base64") };
          await this.store.replaceRing(store, next, guard);
          guard();
          this.auditLifecycle("change-password");
        } finally {
          kek.fill(0);
        }
      } finally {
        dk.fill(0);
      }
    });
  }

  async updateSettings(s: { autoLockMinutes?: number; lockOnLeave?: boolean }, signal?: AbortSignal): Promise<void> {
    await this.withKeyOperation(signal, async (guard) => {
      const store = this.requireStore();
      const autoLockMinutes = s.autoLockMinutes ?? store.ring.autoLockMinutes;
      if (!AUTO_LOCK_MINUTES.some((minutes) => minutes === autoLockMinutes)) throw errors.invalidInput("自动锁定时间只能是 1/5/15/30 分钟");
      await this.store.replaceRing(store, { ...store.ring, autoLockMinutes, lockOnLeave: s.lockOnLeave ?? store.ring.lockOnLeave }, guard);
      guard();
      if (this.session) this.armTimer(autoLockMinutes);
    });
  }

  private requireStore(): LoadedSafe {
    const state = this.storageState();
    if (state.kind === "corrupt") throw corruptStore(state.file);
    if (state.kind === "empty") throw errors.invalidInput("保险箱尚未设置");
    return state;
  }

  private checkManifest(store: LoadedSafe, dk: Buffer): void {
    try {
      authenticateManifest(store, dk);
    } catch (error) {
      this.damagedManifest = store.manifest?.checksum ?? null;
      throw error;
    }
  }

  private async withKeyOperation(signal: AbortSignal | undefined, operation: (guard: () => void) => Promise<void>): Promise<void> {
    const generation = this.generation;
    const guard = () => {
      if (this.stopped || this.generation !== generation) throw locked();
      signal?.throwIfAborted();
    };
    guard();
    if (this.keyOperationPending) throw errors.invalidInput("保险箱操作正在进行，请稍后重试");
    this.keyOperationPending = true;
    try {
      await operation(guard);
    } finally {
      this.keyOperationPending = false;
    }
  }

  private cooldownRemaining(): number {
    return Math.max(0, Math.ceil((this.cooldownUntil - this.d.now()) / 1000));
  }

  private async unwrap(password: string, store: LoadedSafe, guard: () => void): Promise<Buffer> {
    const cooldownSeconds = this.cooldownRemaining();
    if (cooldownSeconds) throw new HuhuError("SAFE_BAD_PASSWORD", `尝试过多，请 ${cooldownSeconds} 秒后再试`, { details: { cooldownSeconds } });
    const { ring } = store;
    const kek = await deriveKek(password, ring.kdf);
    let dk: Buffer;
    try {
      guard();
      this.store.assertVersion(store);
      dk = open(kek, Buffer.from(ring.wrappedKey, "base64"), wrappingContext(ring));
    } catch (error) {
      if (!(error instanceof SealError)) throw error;
      this.failures++;
      if (this.failures >= MAX_FAILURES) {
        this.cooldownUntil = this.d.now() + COOLDOWN_MS;
        this.failures = 0;
      }
      this.auditLifecycle("unlock-failed");
      throw new HuhuError("SAFE_BAD_PASSWORD", "主密码不正确");
    } finally {
      kek.fill(0);
    }
    try {
      if (!checkMatches(dk, ring.keyCheck)) throw corruptStore("keyring.json");
      this.checkManifest(store, dk);
      this.failures = 0;
      this.cooldownUntil = 0;
      return dk;
    } catch (error) {
      dk.fill(0);
      throw error;
    }
  }

  lock(reason: Exclude<EventPayload<"safe.locked">["reason"], "corrupt"> = "manual"): void {
    if (this.stopped || (reason === "leave" && !this.status().lockOnLeave)) return;
    if (reason === "close") this.stopped = true;
    const wasUnlocked = this.session !== null;
    this.invalidate(reason);
    if (wasUnlocked) this.auditLifecycle("lock", reason);
  }

  private invalidate(reason?: EventPayload<"safe.locked">["reason"]): void {
    this.generation++;
    this.session?.key.fill(0);
    this.session = null;
    this.disarmTimer();
    if (reason) this.d.publish("safe.locked", { instanceId: this.instanceId, generation: this.generation, reason });
  }

  private activate(key: Buffer, ring: Keyring): void {
    this.invalidate();
    this.session = { key, identity: ring.keyCheck };
    this.armTimer(ring.autoLockMinutes);
  }

  private armTimer(minutes: number): void {
    this.disarmTimer();
    const timer: { handle: unknown } = { handle: undefined };
    this.timer = timer;
    timer.handle = (this.d.setTimer ?? setTimeout)(() => {
      if (this.timer === timer) this.lock("auto");
    }, minutes * 60_000);
  }

  private disarmTimer(): void {
    const timer = this.timer;
    this.timer = null;
    if (timer) (this.d.clearTimer ?? clearTimeout)(timer.handle as never);
  }

  private key(): Buffer {
    if (!this.session) throw locked();
    const state = this.storageState();
    if (state.kind === "corrupt") throw corruptStore(state.file);
    if (state.kind !== "ready" || !this.session) throw locked();
    this.armTimer(state.ring.autoLockMinutes);
    return this.session.key;
  }

  async withSession<T>(operation: (assertCurrent: () => void) => T | Promise<T>): Promise<T> {
    return this.runSession(operation);
  }

  private async runSession<T>(operation: (assertCurrent: () => void, key: Buffer) => T | Promise<T>, expected?: SafeSession): Promise<T> {
    if (expected && (expected.instanceId !== this.instanceId || expected.generation !== this.generation)) throw locked();
    const key = this.key();
    const generation = this.generation;
    const assertCurrent = () => {
      if (this.generation !== generation) throw locked();
      const state = this.storageState();
      if (state.kind === "corrupt") throw corruptStore(state.file);
      if (this.generation !== generation) throw locked();
    };
    const result = await operation(assertCurrent, key);
    assertCurrent();
    return result;
  }

  private withPersonalSession<T>(session: SafeSession, signal: AbortSignal, operation: (store: CurrentSafe, dk: Buffer, guard: () => void) => T | Promise<T>): Promise<T> {
    return this.runSession((assertCurrent, dk) => {
      signal.throwIfAborted();
      const store = this.requireStore();
      if (!store.manifest) throw errors.invalidInput("个人条目需要当前格式的保险箱");
      return operation({ ...store, manifest: store.manifest }, dk, () => {
        assertCurrent();
        signal.throwIfAborted();
      });
    }, session);
  }

  createEntry(input: CreateEntry, signal: AbortSignal) {
    return this.withPersonalSession(input.session, signal, async (_store, dk, guard) => {
      const now = new Date(this.d.now()).toISOString();
      const entry = {
        entryId: randomUUID(),
        name: input.name,
        url: input.url,
        tagIds: [],
        createdAt: now,
        updatedAt: now,
        accounts: input.accounts.map((fields) => ({ ...fields, accountId: randomUUID(), createdAt: now, updatedAt: now })),
      };
      const revision = await this.savePersonalEntry(dk, entry, { kind: "create", expectedRevision: input.expectedRevision }, guard);
      this.auditBestEffort({ action: "create-entry", itemId: entry.entryId, subject: "desktop", result: "ok" });
      return { entryId: entry.entryId, revision, accountIds: entry.accounts.map((account) => account.accountId), status: "saved" as const };
    });
  }

  private async savePersonalEntry(dk: Buffer, entry: Omit<StoredEntry, "revision">, precondition: EntryPrecondition, guard: () => void): Promise<number> {
    try {
      return await this.store.commitEntry(dk, entry, precondition, guard);
    } catch (error) {
      if (error instanceof HuhuError) throw error;
      throw new HuhuError("INTERNAL", "保险箱条目写入失败，请重试");
    }
  }

  private editEntry(input: EditTarget, signal: AbortSignal, update: (entry: StoredEntry, now: string) => StoredEntry, audit: { action: "update-entry" | "update-account"; itemId: string }) {
    return this.withPersonalSession(input.session, signal, async (store, dk, guard) => {
      const currentRevision = store.manifest.entries[input.entryId];
      if (currentRevision === undefined) throw errors.notFound("条目不存在");
      if (currentRevision !== input.expectedRevision) throw errors.versionConflict(String(currentRevision));
      const now = new Date(this.d.now()).toISOString();
      const edited = { ...update(this.store.readEntry(store, dk, input.entryId), now), updatedAt: now };
      const revision = await this.savePersonalEntry(dk, edited, { kind: "update", expectedRevision: currentRevision }, guard);
      this.auditBestEffort({ ...audit, subject: "desktop", result: "ok" });
      return { ...edited, revision };
    });
  }

  async updateEntry(input: UpdateEntry, signal: AbortSignal) {
    const { entryId, revision } = await this.editEntry(input, signal, (entry) => ({ ...entry, name: input.name ?? entry.name, url: input.url ?? entry.url }), { action: "update-entry", itemId: input.entryId });
    return { entryId, revision };
  }

  async updateAccount(input: UpdateAccount, signal: AbortSignal) {
    const { accountId } = input;
    const { entryId, revision, accounts } = await this.editEntry(
      input,
      signal,
      (entry, now) => {
        const existing = entry.accounts.find((account) => account.accountId === accountId);
        if (!existing) throw errors.notFound("账号不存在");
        let password = existing.password;
        if (input.password.kind === "set") password = input.password.value;
        if (input.password.kind === "clear") password = "";
        const updated = {
          ...existing,
          account: input.account ?? existing.account,
          phone: input.phone ?? existing.phone,
          email: input.email ?? existing.email,
          note: input.note ?? existing.note,
          password,
          updatedAt: now,
        };
        return { ...entry, accounts: entry.accounts.map((account) => (account === existing ? updated : account)) };
      },
      { action: "update-account", itemId: accountId },
    );
    const hasPassword = accounts.some((account) => account.accountId === accountId && account.password.length > 0);
    return { entryId, accountId, revision, hasPassword };
  }

  listEntries(session: SafeSession, signal: AbortSignal) {
    return this.withPersonalSession(session, signal, ({ manifest }) => ({
      revision: manifest.revision,
      entries: Object.entries(manifest.entries).map(([entryId, revision]) => ({ entryId, revision })),
    }));
  }

  getEntry(session: SafeSession, entryId: string, signal: AbortSignal) {
    return this.withPersonalSession(session, signal, (store, dk) => {
      const { accounts, ...entry } = this.store.readEntry(store, dk, entryId);
      return { ...entry, accounts: accounts.map(({ password, ...fields }) => ({ ...fields, hasPassword: password.length > 0 })) };
    });
  }

  revealAccount(session: SafeSession, entryId: string, accountId: string, signal: AbortSignal) {
    return this.withPersonalSession(session, signal, (store, dk) => {
      const account = this.store.readEntry(store, dk, entryId).accounts.find((item) => item.accountId === accountId);
      if (!account) throw errors.notFound("账号不存在");
      this.auditBestEffort({ action: "reveal-account", itemId: accountId, subject: "desktop", result: "ok" });
      return { password: account.password };
    });
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
    return readdirSync(dir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => JSON.parse(readFileSync(path.join(dir, f), "utf8")) as ItemMeta)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  itemSave(input: { id?: string; name: string; type: SecretType; account?: string; allowedModules?: string[]; value?: string }): ItemMeta {
    const dk = this.key();
    this.d.files.assertWritable();
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
    this.d.files.assertWritable();
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
    if (!this.session) throw locked();
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
