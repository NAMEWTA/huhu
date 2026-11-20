import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { VaultFiles } from "../../../packages/vault/src/write.js";
import * as crypto from "../src/engine/crypto.js";
import { deriveKek, keyCheck, newKdf, open, seal, SealError } from "../src/engine/crypto.js";
import { Safe } from "../src/engine/safe.js";
import { formatSecretRef, parseSecretRef } from "../src/shared/secret-ref.js";
import { signal } from "./signal.js";

const dirs: string[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
const FAST = { N: 2 ** 10, r: 8, p: 1 }; // 测试用低成本参数；生产为 N=2^17
const PW = "correct horse battery";
const deriveWithoutGate = deriveKek;

function setup() {
  const root = mkdtempSync(path.join(tmpdir(), "huhu-s-"));
  dirs.push(root);
  const dir = path.join(root, ".huhu", "safe");
  const files = new VaultFiles(root);
  let now = 1_700_000_000_000;
  const timers: { fn: () => void; at: number; id: number }[] = [];
  let tid = 0;
  const makeSafe = () =>
    new Safe({
      dir,
      files,
      now: () => now,
      publish: () => undefined,
      kdfParams: FAST,
      setTimer: (fn, ms) => {
        const t = { fn, at: now + ms, id: ++tid };
        timers.push(t);
        return t.id;
      },
      clearTimer: (h) => {
        const i = timers.findIndex((t) => t.id === h);
        if (i >= 0) timers.splice(i, 1);
      },
    });
  const safe = makeSafe();
  const advance = (ms: number) => {
    now += ms;
    for (const t of [...timers].filter((x) => x.at <= now)) {
      timers.splice(timers.indexOf(t), 1);
      t.fn();
    }
  };
  return { safe, root, dir, files, makeSafe, advance, timers: () => timers.length };
}

function blockNextDerivation() {
  const entered = signal();
  const release = signal();
  vi.spyOn(crypto, "deriveKek").mockImplementationOnce(async (password, kdf) => {
    entered.resolve();
    await release.promise;
    return deriveWithoutGate(password, kdf);
  });
  return { entered: entered.promise, release: release.resolve };
}

describe("密码学", () => {
  test("seal/open 往返；篡改、错误密钥、AAD 不符都失败", async () => {
    const key = await deriveKek("pw-long-enough", newKdf(FAST));
    const sealed = seal(key, Buffer.from("秘密"), "item:a");
    expect(open(key, sealed, "item:a").toString()).toBe("秘密");
    expect(() => open(key, sealed, "item:b")).toThrow(SealError); // 换 itemId
    const tampered = Buffer.from(sealed);
    tampered[tampered.length - 1] = (tampered[tampered.length - 1] ?? 0) ^ 1;
    expect(() => open(key, tampered, "item:a")).toThrow(SealError);
    expect(() => open(Buffer.alloc(32, 1), sealed, "item:a")).toThrow(SealError);
    expect(() => open(key, Buffer.from("junk"), "item:a")).toThrow(SealError);
  });
  test("每次封装 IV 不同", async () => {
    const key = Buffer.alloc(32, 7);
    expect(seal(key, Buffer.from("x"), "a").equals(seal(key, Buffer.from("x"), "a"))).toBe(false);
  });
  test("引用格式", () => {
    expect(parseSecretRef("safe://item-abc123")).toBe("item-abc123");
    for (const bad of ["item-abc123", "safe://", "safe://../x", "safe://item-abc123/extra", "http://item-1"]) expect(parseSecretRef(bad)).toBeNull();
    expect(formatSecretRef("item-1")).toBe("safe://item-1");
  });
});

describe("设置与解锁", () => {
  test("同一 Safe 并发初始化只提交一次，成功请求的密码可重开", async () => {
    const { safe } = setup();
    const passwords = [PW, "alternate-password", "third-test-password"];
    const results = await Promise.allSettled(passwords.map((password) => safe.setup(password)));
    expect(results.map((result) => result.status)).toEqual(["fulfilled", "rejected", "rejected"]);
    safe.lock();
    await expect(safe.unlock(PW)).resolves.toBeUndefined();
  });
  test.each(["manual", "close"] as const)("scrypt 等待期间 %s 锁定后拒绝迟到的解锁", async (reason) => {
    const { safe, timers } = setup();
    await safe.setup(PW);
    safe.lock();
    const gate = blockNextDerivation();
    const unlocking = safe.unlock(PW);
    const result = expect(unlocking).rejects.toMatchObject({ code: "SAFE_LOCKED" });
    await gate.entered;
    safe.lock(reason);
    gate.release();
    await result;
    expect(safe.status().locked).toBe(true);
    expect(timers()).toBe(0);
    expect(safe.auditList().some((entry) => entry.action === "unlock")).toBe(false);
  });
  test("仅剩损坏的当前格式清单时拒绝重建，保留原始字节", async () => {
    const { safe, dir } = setup();
    const current = path.join(dir, "current");
    mkdirSync(current, { recursive: true });
    const file = path.join(current, "manifest.json");
    const original = Buffer.from("{damaged");
    writeFileSync(file, original);
    expect(safe.status()).toMatchObject({ corrupt: true, locked: true });
    await expect(safe.setup(PW)).rejects.toThrow(/损坏/);
    expect(readFileSync(file)).toEqual(original);
  });
  test("停用时阻止仍在派生密钥的初始化；新实例可正常设置", async () => {
    const { safe, dir, makeSafe } = setup();
    const gate = blockNextDerivation();
    const result = expect(safe.setup(PW)).rejects.toMatchObject({ code: "SAFE_LOCKED" });
    await gate.entered;
    safe.lock("close");
    gate.release();
    await result;
    expect(existsSync(path.join(dir, "current"))).toBe(false);
    await expect(safe.setup(PW)).rejects.toMatchObject({ code: "SAFE_LOCKED" });
    await expect(makeSafe().setup(PW)).resolves.toBeUndefined();
  });
  test("第二个文件写失败后没有半个保险箱，并可重试初始化", async () => {
    const { safe, files, dir, makeSafe } = setup();
    const write = files.write.bind(files);
    vi.spyOn(files, "write").mockImplementation(async (file, data, options) => {
      if (file.endsWith("/manifest.json")) throw new Error("synthetic manifest write failure");
      return write(file, data, options);
    });
    await expect(safe.setup(PW)).rejects.toThrow("synthetic manifest write failure");
    expect(existsSync(path.join(dir, "current"))).toBe(false);
    expect(safe.status()).toMatchObject({ initialized: false, locked: true, corrupt: false });
    vi.restoreAllMocks();
    await safe.setup(PW);
    const current = path.join(dir, "current");
    const ring = JSON.parse(readFileSync(path.join(current, "keyring.json"), "utf8")) as { vaultKeyId: string };
    expect(ring).toMatchObject({ format: 1 });
    expect(JSON.parse(readFileSync(path.join(current, "manifest.json"), "utf8"))).toMatchObject({ format: 1, vaultKeyId: ring.vaultKeyId, revision: 0, entries: {}, tags: null });
    const reopened = makeSafe();
    expect(reopened.status()).toMatchObject({ initialized: true, locked: true, generation: 0 });
    await reopened.unlock(PW);
    expect(reopened.status()).toMatchObject({ locked: false, generation: 1 });
  });
  test("锁定发生于改密暂存写之后、发布前：原包装密钥保持可用", async () => {
    const { safe, files, dir } = setup();
    await safe.setup(PW);
    const ring = path.join(dir, "current", "keyring.json");
    const original = readFileSync(ring);
    const write = files.write.bind(files);
    const written = signal();
    const release = signal();
    vi.spyOn(files, "write").mockImplementationOnce(async (...args) => {
      const receipt = await write(...args);
      written.resolve();
      await release.promise;
      return receipt;
    });
    const result = expect(safe.changePassword(PW, "new-test-password")).rejects.toMatchObject({ code: "SAFE_LOCKED" });
    await written.promise;
    safe.lock();
    release.resolve();
    await result;
    expect(readFileSync(ring)).toEqual(original);
    await safe.unlock(PW);
  });
  test("仅凭旧格式 keyring 仍能解锁，且不创建当前格式文件或改写 keyring", async () => {
    const { safe, dir } = setup();
    const kdf = newKdf(FAST);
    const kek = await deriveKek(PW, kdf);
    const dk = Buffer.alloc(32, 9);
    const wrappedKey = seal(kek, dk, "huhu-safe/dk").toString("base64");
    const ring = JSON.stringify({ kdf, wrappedKey, keyCheck: keyCheck(dk), createdAt: "2026-11-20T00:00:00.000Z", autoLockMinutes: 5, lockOnLeave: false });
    kek.fill(0);
    dk.fill(0);
    mkdirSync(dir, { recursive: true });
    const file = path.join(dir, "keyring.json");
    writeFileSync(file, ring);
    await safe.unlock(PW);
    expect(safe.itemsList()).toEqual([]);
    expect(readFileSync(file, "utf8")).toBe(ring);
    expect(existsSync(path.join(dir, "current"))).toBe(false);
  });
  test("密码太短拒绝；设置后可解锁；重复设置拒绝", async () => {
    const { safe } = setup();
    await expect(safe.setup("short")).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await safe.setup(PW);
    expect(safe.status()).toMatchObject({ initialized: true, locked: false });
    await expect(safe.setup(PW)).rejects.toMatchObject({ code: "INVALID_INPUT" });
    safe.lock();
    expect(safe.status().locked).toBe(true);
    await safe.unlock(PW);
    expect(safe.status().locked).toBe(false);
  });
  test("ACC-SF-02 错误密码 5 次后进入 30 秒冷却，冷却后可再试", async () => {
    const { safe, advance } = setup();
    await safe.setup(PW);
    safe.lock();
    for (let i = 0; i < 5; i++) await expect(safe.unlock("wrong-password-1")).rejects.toMatchObject({ code: "SAFE_BAD_PASSWORD" });
    await expect(safe.unlock(PW)).rejects.toMatchObject({ code: "SAFE_BAD_PASSWORD", details: { cooldownSeconds: 30 } }); // 正确密码也被拒
    expect(safe.status().cooldownSeconds).toBeGreaterThan(0);
    advance(31_000);
    await safe.unlock(PW);
    expect(safe.status().locked).toBe(false);
  });
  test("锁定状态下操作 → SAFE_LOCKED 带解锁动作", async () => {
    const { safe } = setup();
    await safe.setup(PW);
    safe.lock();
    expect(() => safe.itemsList()).toThrowError(/已锁定/);
    try {
      safe.itemsList();
    } catch (e) {
      expect((e as { code: string; recovery: unknown }).code).toBe("SAFE_LOCKED");
      expect((e as { recovery: unknown[] }).recovery).toHaveLength(1);
    }
  });
  test("keyring 损坏 → 不可用且不覆盖文件", async () => {
    const { safe, dir } = setup();
    await safe.setup(PW);
    const file = path.join(dir, "current", "keyring.json");
    const original = readFileSync(file, "utf8").replace('"autoLockMinutes": 5', '"autoLockMinutes": 1');
    writeFileSync(file, original);
    expect(safe.status()).toMatchObject({ corrupt: true, locked: true });
    await expect(safe.unlock(PW)).rejects.toThrowError(/损坏/);
    await expect(safe.setup(PW)).rejects.toThrow(/损坏/);
    expect(readFileSync(file, "utf8")).toBe(original);
  });
  test("能通过文件校验和的清单篡改仍会被数据密钥认证拒绝", async () => {
    const { safe, dir } = setup();
    await safe.setup(PW);
    safe.lock();
    const file = path.join(dir, "current", "manifest.json");
    const { checksum: _, ...manifest } = JSON.parse(readFileSync(file, "utf8")) as { checksum: string; revision: number };
    manifest.revision++;
    const original = JSON.stringify({ ...manifest, checksum: createHash("sha256").update(JSON.stringify(manifest)).digest("hex") });
    writeFileSync(file, original);
    await expect(safe.unlock(PW)).rejects.toThrow(/manifest.json.*损坏/);
    expect(safe.status()).toMatchObject({ corrupt: true, locked: true, cooldownSeconds: 0 });
    expect(readFileSync(file, "utf8")).toBe(original);
  });
});

describe("自动锁定（ACC-SF-05）", () => {
  test("无操作超时自动锁定；有操作会重置计时", async () => {
    const { safe, advance } = setup();
    await safe.setup(PW);
    await safe.updateSettings({ autoLockMinutes: 1 });
    advance(50_000);
    safe.itemsList(); // 操作重置计时
    advance(50_000);
    expect(safe.status().locked).toBe(false);
    advance(15_000);
    expect(safe.status().locked).toBe(true);
    expect(safe.auditList().some((a) => a.action === "lock" && a.subject === "auto")).toBe(true);
  });
  test("非法的自动锁定时间被拒绝；手动锁定后不再有定时器", async () => {
    const { safe, timers } = setup();
    await safe.setup(PW);
    await expect(safe.updateSettings({ autoLockMinutes: 7 })).rejects.toThrow();
    safe.lock();
    expect(timers()).toBe(0);
  });
  test("离开遵循设置；旧会话在重开后也不能返回迟到数据或提交写入", async () => {
    const { safe } = setup();
    await safe.setup(PW);
    const original = safe.status().generation;
    safe.lock("leave");
    expect(safe.status()).toMatchObject({ locked: false, generation: original });
    await safe.updateSettings({ lockOnLeave: true });
    const gate = signal();
    const read = expect(
      safe.withSession(async () => {
        const list = safe.itemsList();
        await gate.promise;
        return list;
      }),
    ).rejects.toMatchObject({ code: "SAFE_LOCKED" });
    const write = expect(
      safe.withSession(async (assertCurrent) => {
        await gate.promise;
        assertCurrent();
        return safe.itemSave({ name: "late test", type: "token", value: "synthetic" });
      }),
    ).rejects.toMatchObject({ code: "SAFE_LOCKED" });
    safe.lock("leave");
    expect(safe.status()).toMatchObject({ locked: true, generation: original + 1 });
    await safe.unlock(PW);
    gate.resolve();
    await Promise.all([read, write]);
    expect(safe.itemsList()).toEqual([]);
    expect(safe.auditList()).toContainEqual(expect.objectContaining({ action: "lock", subject: "leave" }));
  });
});

describe("条目与秘密", () => {
  test("ACC-SF-01 整个 Vault 目录里找不到明文标记，元数据与密文分离", async () => {
    const { safe, root, dir } = setup();
    await safe.setup(PW);
    const item = safe.itemSave({ name: "GitHub", type: "token", account: "me", allowedModules: ["ssh"], value: "HUHU-MARKER-7f3a" });
    expect(safe.reveal(item.id)).toBe("HUHU-MARKER-7f3a");
    safe.lock();
    const hits: string[] = [];
    const walk = (d: string) => {
      for (const n of readdirSync(d)) {
        const p = path.join(d, n);
        if (statSync(p).isDirectory()) walk(p);
        else if (readFileSync(p).includes("HUHU-MARKER-7f3a")) hits.push(p);
      }
    };
    walk(root);
    expect(hits).toEqual([]);
    expect(readdirSync(path.join(dir, "sealed"))).toEqual([`${item.id}.bin`]);
    expect(readFileSync(path.join(dir, "items", `${item.id}.json`), "utf8")).not.toContain("HUHU-MARKER");
  });
  test("密文文件被互换（AAD 绑定 itemId）→ 无法解封", async () => {
    const { safe, dir } = setup();
    await safe.setup(PW);
    const a = safe.itemSave({ name: "A", type: "password", value: "aaa" });
    const b = safe.itemSave({ name: "B", type: "password", value: "bbb" });
    const fa = readFileSync(path.join(dir, "sealed", `${a.id}.bin`));
    writeFileSync(path.join(dir, "sealed", `${b.id}.bin`), fa);
    expect(() => safe.reveal(b.id)).toThrowError(/无法解封/);
    expect(safe.reveal(a.id)).toBe("aaa");
  });
  test("编辑时不提供新值则保留旧值；删除条目同时删密文；审计不含值", async () => {
    const { safe, dir } = setup();
    await safe.setup(PW);
    const it = safe.itemSave({ name: "A", type: "password", value: "sEcReT-9f3a" });
    safe.itemSave({ id: it.id, name: "A2", type: "password", account: "u" });
    expect(safe.reveal(it.id)).toBe("sEcReT-9f3a");
    safe.itemDelete(it.id);
    expect(readdirSync(path.join(dir, "sealed"))).toEqual([]);
    expect(readFileSync(path.join(dir, "audit.ndjson"), "utf8")).not.toContain("sEcReT-9f3a"); // 用不会出现在随机 id 里的值，避免偶发误报
  });
  test("ACC-SF-03 修改主密码：新密码可解锁，旧密码不行，秘密文件不变", async () => {
    const { safe, dir } = setup();
    await safe.setup(PW);
    const it = safe.itemSave({ name: "A", type: "token", value: "keep-me" });
    const dataFile = path.join(dir, "sealed", `${it.id}.bin`);
    const manifestFile = path.join(dir, "current", "manifest.json");
    const ringFile = path.join(dir, "current", "keyring.json");
    const before = [dataFile, manifestFile, ringFile].map((file) => readFileSync(file));
    await expect(safe.changePassword("wrong-old-pass", "brand-new-password")).rejects.toMatchObject({ code: "SAFE_BAD_PASSWORD" });
    await safe.changePassword(PW, "brand-new-password");
    safe.lock();
    await expect(safe.unlock(PW)).rejects.toMatchObject({ code: "SAFE_BAD_PASSWORD" });
    await safe.unlock("brand-new-password");
    expect(safe.reveal(it.id)).toBe("keep-me");
    expect(readFileSync(dataFile)).toEqual(before[0]);
    expect(readFileSync(manifestFile)).toEqual(before[1]);
    expect(readFileSync(ringFile)).not.toEqual(before[2]);
  });
});

describe("SecretUse（ACC-SF-04）", () => {
  test("允许的模块可解析；其他模块 SECRET_REF_INVALID 且有拒绝审计；锁定时 SAFE_LOCKED", async () => {
    const { safe } = setup();
    await safe.setup(PW);
    const it = safe.itemSave({ name: "K", type: "ssh-key", allowedModules: ["ssh"], value: "KEY" });
    const ref = formatSecretRef(it.id);
    expect(safe.resolve(ref, { plugin: "ssh", purpose: "connect" })).toBe("KEY");
    expect(() => safe.resolve(ref, { plugin: "automations", purpose: "script env" })).toThrowError(/不允许/);
    try {
      safe.resolve(ref, { plugin: "automations", purpose: "x" });
    } catch (e) {
      expect((e as { code: string }).code).toBe("SECRET_REF_INVALID");
    }
    expect(() => safe.resolve("safe://item-missing1", { plugin: "ssh", purpose: "x" })).toThrow();
    expect(() => safe.resolve("not-a-ref", { plugin: "ssh", purpose: "x" })).toThrow();
    const log = safe.auditList();
    expect(log.filter((a) => a.action === "use-denied").length).toBeGreaterThanOrEqual(2);
    expect(log.find((a) => a.action === "use")).toMatchObject({ subject: "ssh", itemId: it.id });
    safe.lock();
    try {
      safe.resolve(ref, { plugin: "ssh", purpose: "x" });
    } catch (e) {
      expect((e as { code: string }).code).toBe("SAFE_LOCKED");
    }
  });
});
