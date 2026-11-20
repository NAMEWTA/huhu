import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { VaultFiles } from "../../../packages/vault/src/write.js";
import * as crypto from "../src/engine/crypto.js";
import { deriveKek, keyCheck, newKdf, open, seal, SealError } from "../src/engine/crypto.js";
import { CreateEntry } from "../src/engine/personal.js";
import { Safe } from "../src/engine/safe.js";
import { writeLegacyItem } from "./legacy-fixture.js";
import { signal } from "./signal.js";

const dirs: string[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
const FAST = { N: 2 ** 10, r: 8, p: 1 }; // 测试用低成本参数；生产为 N=2^17
const PW = "correct horse battery";
const deriveWithoutGate = deriveKek;
const local = { subject: "desktop", check: () => undefined };

function currentSession(safe: Safe) {
  const { instanceId, generation } = safe.status();
  return { instanceId, generation };
}

function personalEntry(safe: Safe, password: string) {
  return CreateEntry.parse({ session: currentSession(safe), expectedRevision: 0, name: "Synthetic account", accounts: [{ account: "fixture", password }] });
}

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
    expect(safe.status()).toMatchObject({ locked: false, initialized: true });
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
    await expect(safe.listEntries(currentSession(safe), local)).rejects.toMatchObject({ code: "SAFE_LOCKED", recovery: [{ action: "unlock-safe", label: "解锁保险箱" }] });
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
    await safe.listEntries(currentSession(safe), local);
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
    const { safe, files } = setup();
    await safe.setup(PW);
    const original = safe.status().generation;
    safe.lock("leave");
    expect(safe.status()).toMatchObject({ locked: false, generation: original });
    await safe.updateSettings({ lockOnLeave: true });
    const reached = signal(),
      release = signal();
    const writeFile = files.write.bind(files);
    vi.spyOn(files, "write").mockImplementation(async (...args) => {
      if (args[0].endsWith("/entry.bin")) {
        reached.resolve();
        await release.promise;
      }
      return writeFile(...args);
    });
    const write = expect(safe.createEntry(personalEntry(safe, "synthetic"), local)).rejects.toMatchObject({ code: "SAFE_LOCKED" });
    await reached.promise;
    const read = expect(safe.listEntries(currentSession(safe), local)).rejects.toMatchObject({ code: "SAFE_LOCKED" });
    safe.lock("leave");
    expect(safe.status()).toMatchObject({ locked: true, generation: original + 1 });
    await safe.unlock(PW);
    release.resolve();
    await Promise.all([read, write]);
    expect(await safe.listEntries(currentSession(safe), local)).toEqual({ revision: 0, entries: [] });
    expect(safe.auditList()).toContainEqual(expect.objectContaining({ action: "lock", subject: "leave" }));
  });
});

describe("个人条目与旧数据保全", () => {
  test("个人账号只经显式读取取密码，账号内容与名字不进入明文存储", async () => {
    const { safe, root } = setup();
    await safe.setup(PW);
    const value = "synthetic-personal-marker";
    const created = await safe.createEntry(personalEntry(safe, value), local);
    const session = currentSession(safe);
    expect(await safe.revealAccount(session, created.entryId, created.accountIds[0]!, local)).toEqual({ password: value });
    const detail = await safe.getEntry(session, created.entryId, local);
    expect(detail.accounts[0]?.hasPassword).toBe(true);
    expect(JSON.stringify(detail)).not.toContain(value);
    safe.lock();
    const contains = (dir: string): boolean =>
      readdirSync(dir).some((name) => {
        const file = path.join(dir, name);
        return statSync(file).isDirectory() ? contains(file) : readFileSync(file).includes(value);
      });
    expect(contains(root)).toBe(false);
  });

  test("主密码轮换只替换包裹，同一账号密文及清单字节保留", async () => {
    const { safe, dir } = setup();
    await safe.setup(PW);
    const value = "synthetic-rotation-fixture";
    const it = await safe.createEntry(personalEntry(safe, value), local);
    const dataFile = path.join(dir, "current", "entries", it.entryId + "-1.bin");
    const manifestFile = path.join(dir, "current", "manifest.json");
    const ringFile = path.join(dir, "current", "keyring.json");
    const before = [dataFile, manifestFile, ringFile].map((file) => readFileSync(file));
    await expect(safe.changePassword("wrong-old-pass", "brand-new-password")).rejects.toMatchObject({ code: "SAFE_BAD_PASSWORD" });
    await safe.changePassword(PW, "brand-new-password");
    safe.lock();
    await expect(safe.unlock(PW)).rejects.toMatchObject({ code: "SAFE_BAD_PASSWORD" });
    await safe.unlock("brand-new-password");
    expect(await safe.revealAccount(currentSession(safe), it.entryId, it.accountIds[0]!, local)).toEqual({ password: value });
    expect(readFileSync(dataFile)).toEqual(before[0]);
    expect(readFileSync(manifestFile)).toEqual(before[1]);
    expect(readFileSync(ringFile)).not.toEqual(before[2]);
  });

  test("退役保险箱仍能校验原主密码，启动、锁定、失败的个人条目读取均保全旧文件", async () => {
    const { safe, dir, root } = setup();
    const item = await writeLegacyItem(root, { masterPassword: PW, value: "synthetic-retired-marker", type: "token", allowedModules: ["ssh"] });
    const files = [path.join(dir, "keyring.json"), item.metadataPath, item.sealedPath];
    const original = files.map((file) => readFileSync(file));
    await safe.unlock(PW);
    expect(safe.status()).toMatchObject({ initialized: true, locked: false, corrupt: false });
    await expect(safe.listEntries(currentSession(safe), local)).rejects.toMatchObject({ code: "INVALID_INPUT" });
    safe.lock();
    await expect(safe.setup(PW)).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(files.map((file) => readFileSync(file))).toEqual(original);
    expect(existsSync(path.join(dir, "current"))).toBe(false);
  });
});
