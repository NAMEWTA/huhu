import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { deriveKek, newKdf, open, seal, SealError } from "../src/engine/crypto.js";
import { Safe } from "../src/engine/safe.js";
import { formatSecretRef, parseSecretRef } from "../src/shared/secret-ref.js";

const dirs: string[] = [];
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });
const FAST = { N: 2 ** 10, r: 8, p: 1 }; // 测试用低成本参数；生产为 N=2^17
const PW = "correct horse battery";

function setup() {
  const root = mkdtempSync(path.join(tmpdir(), "huhu-s-")); dirs.push(root);
  const dir = path.join(root, ".huhu", "safe");
  let now = 1_700_000_000_000;
  const timers: { fn: () => void; at: number; id: number }[] = [];
  let tid = 0;
  const safe = new Safe({
    dir, now: () => now, publish: () => undefined, kdfParams: FAST,
    setTimer: (fn, ms) => { const t = { fn, at: now + ms, id: ++tid }; timers.push(t); return t.id; },
    clearTimer: (h) => { const i = timers.findIndex((t) => t.id === h); if (i >= 0) timers.splice(i, 1); },
  });
  const advance = (ms: number) => { now += ms; for (const t of [...timers].filter((x) => x.at <= now)) { timers.splice(timers.indexOf(t), 1); t.fn(); } };
  return { safe, root, dir, advance, timers: () => timers.length };
}

describe("密码学", () => {
  test("seal/open 往返；篡改、错误密钥、AAD 不符都失败", async () => {
    const key = await deriveKek("pw-long-enough", newKdf(FAST));
    const sealed = seal(key, Buffer.from("秘密"), "item:a");
    expect(open(key, sealed, "item:a").toString()).toBe("秘密");
    expect(() => open(key, sealed, "item:b")).toThrow(SealError); // 换 itemId
    const tampered = Buffer.from(sealed); tampered[tampered.length - 1] = (tampered[tampered.length - 1] ?? 0) ^ 1;
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
    await safe.setup(PW); safe.lock();
    for (let i = 0; i < 5; i++) await expect(safe.unlock("wrong-password-1")).rejects.toMatchObject({ code: "SAFE_BAD_PASSWORD" });
    await expect(safe.unlock(PW)).rejects.toMatchObject({ code: "SAFE_BAD_PASSWORD", details: { cooldownSeconds: 30 } }); // 正确密码也被拒
    expect(safe.status().cooldownSeconds).toBeGreaterThan(0);
    advance(31_000);
    await safe.unlock(PW);
    expect(safe.status().locked).toBe(false);
  });
  test("锁定状态下操作 → SAFE_LOCKED 带解锁动作", async () => {
    const { safe } = setup();
    await safe.setup(PW); safe.lock();
    expect(() => safe.itemsList()).toThrowError(/已锁定/);
    try { safe.itemsList(); } catch (e) { expect((e as { code: string; recovery: unknown }).code).toBe("SAFE_LOCKED"); expect((e as { recovery: unknown[] }).recovery).toHaveLength(1); }
  });
  test("keyring 损坏 → 不可用且不覆盖文件", async () => {
    const { safe, dir } = setup();
    await safe.setup(PW); safe.lock();
    writeFileSync(path.join(dir, "keyring.json"), "{broken");
    expect(safe.status().corrupt).toBe(true);
    await expect(safe.unlock(PW)).rejects.toThrowError(/损坏/);
    await expect(safe.setup(PW)).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(readFileSync(path.join(dir, "keyring.json"), "utf8")).toBe("{broken");
  });
});

describe("自动锁定（ACC-SF-05）", () => {
  test("无操作超时自动锁定；有操作会重置计时", async () => {
    const { safe, advance } = setup();
    await safe.setup(PW);
    safe.updateSettings({ autoLockMinutes: 1 });
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
    expect(() => safe.updateSettings({ autoLockMinutes: 7 })).toThrow();
    safe.lock();
    expect(timers()).toBe(0);
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
    const walk = (d: string) => { for (const n of readdirSync(d)) { const p = path.join(d, n); if (statSync(p).isDirectory()) walk(p); else if (readFileSync(p).includes("HUHU-MARKER-7f3a")) hits.push(p); } };
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
    const it = safe.itemSave({ name: "A", type: "password", value: "v1" });
    safe.itemSave({ id: it.id, name: "A2", type: "password", account: "u" });
    expect(safe.reveal(it.id)).toBe("v1");
    safe.itemDelete(it.id);
    expect(readdirSync(path.join(dir, "sealed"))).toEqual([]);
    expect(readFileSync(path.join(dir, "audit.ndjson"), "utf8")).not.toContain("v1");
  });
  test("ACC-SF-03 修改主密码：新密码可解锁，旧密码不行，秘密文件不变", async () => {
    const { safe, dir } = setup();
    await safe.setup(PW);
    const it = safe.itemSave({ name: "A", type: "token", value: "keep-me" });
    const before = readFileSync(path.join(dir, "sealed", `${it.id}.bin`));
    await expect(safe.changePassword("wrong-old-pass", "brand-new-password")).rejects.toMatchObject({ code: "SAFE_BAD_PASSWORD" });
    await safe.changePassword(PW, "brand-new-password");
    safe.lock();
    await expect(safe.unlock(PW)).rejects.toMatchObject({ code: "SAFE_BAD_PASSWORD" });
    await safe.unlock("brand-new-password");
    expect(safe.reveal(it.id)).toBe("keep-me");
    expect(readFileSync(path.join(dir, "sealed", `${it.id}.bin`)).equals(before)).toBe(true);
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
    try { safe.resolve(ref, { plugin: "automations", purpose: "x" }); } catch (e) { expect((e as { code: string }).code).toBe("SECRET_REF_INVALID"); }
    expect(() => safe.resolve("safe://item-missing1", { plugin: "ssh", purpose: "x" })).toThrow();
    expect(() => safe.resolve("not-a-ref", { plugin: "ssh", purpose: "x" })).toThrow();
    const log = safe.auditList();
    expect(log.filter((a) => a.action === "use-denied").length).toBeGreaterThanOrEqual(2);
    expect(log.find((a) => a.action === "use")).toMatchObject({ subject: "ssh", itemId: it.id });
    safe.lock();
    try { safe.resolve(ref, { plugin: "ssh", purpose: "x" }); } catch (e) { expect((e as { code: string }).code).toBe("SAFE_LOCKED"); }
  });
});
