import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { Vault, findVaultRoot } from "../src/index.js";

const dirs: string[] = [];
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });
const tmp = () => { const d = mkdtempSync(path.join(tmpdir(), "huhu-vl-")); dirs.push(d); return d; };

describe("Vault 生命周期", () => {
  test("新建：只创建 .huhu/vault.json，不动已有文件", async () => {
    const d = tmp(); writeFileSync(path.join(d, "readme.md"), "hi");
    const v = await Vault.open(d, { create: true, name: "我的库" });
    expect(v.info).toMatchObject({ kind: "huhu-vault", name: "我的库", formatVersion: 1 });
    expect(v.id).toMatch(/^vault-/);
    expect(readFileSync(path.join(d, "readme.md"), "utf8")).toBe("hi");
    await v.close();
    const again = await Vault.open(d);
    expect(again.id).toBe(v.id);
    await again.close();
  });
  test("非 Vault 目录且未 create → NOT_FOUND；目录不存在 → NOT_FOUND", async () => {
    await expect(Vault.open(tmp())).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(Vault.open("/nonexistent/xyz")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
  test("写者锁：第二个实例不能写入，可只读打开", async () => {
    const d = tmp();
    const a = await Vault.open(d, { create: true });
    await expect(Vault.open(d)).rejects.toMatchObject({ code: "READ_ONLY_VAULT", recovery: [{ action: "open-readonly" }] });
    const ro = await Vault.open(d, { readOnly: true });
    expect(() => ro.assertWritable()).toThrowError(/只读/);
    await ro.close();
    await a.close();
    const b = await Vault.open(d);
    await b.close();
  });
  test("持锁 Engine 崩溃（pid 不存在）后立即回收陈旧锁；pid 仍存活时不抢", async () => {
    const d = tmp();
    await Vault.open(d, { create: true });
    // 模拟崩溃：锁目录还在（未释放），pid 记录指向已死进程
    writeFileSync(path.join(d, ".huhu/writer.pid"), String(2 ** 22 + 12345));
    const b = await Vault.open(d);
    expect(b.readOnly).toBe(false);
    await b.close();
    // pid 存活（本进程）→ 不抢锁
    const c = await Vault.open(d, { create: false });
    expect(Number(readFileSync(path.join(d, ".huhu/writer.pid"), "utf8"))).toBe(process.pid);
    await expect(Vault.open(d)).rejects.toMatchObject({ code: "READ_ONLY_VAULT" });
    await c.close();
    expect(existsSync(path.join(d, ".huhu/writer.pid"))).toBe(false);
  });
  test("过新的 formatVersion → 拒绝写入打开", async () => {
    const d = tmp(); mkdirSync(path.join(d, ".huhu"));
    writeFileSync(path.join(d, ".huhu/vault.json"), JSON.stringify({ kind: "huhu-vault", id: "vault-abc", name: "x", formatVersion: 99, createdAt: "" }));
    await expect(Vault.open(d)).rejects.toMatchObject({ code: "READ_ONLY_VAULT" });
  });
  test("过新的 formatVersion 可以只读打开", async () => {
    const d = tmp(); mkdirSync(path.join(d, ".huhu"));
    writeFileSync(path.join(d, ".huhu/vault.json"), JSON.stringify({ kind: "huhu-vault", id: "vault-abc", name: "x", formatVersion: 99, createdAt: "" }));
    const v = await Vault.open(d, { readOnly: true });
    expect(v.readOnly).toBe(true);
    await v.close();
  });
  test("坏的 vault.json → INVALID_INPUT", async () => {
    const d = tmp(); mkdirSync(path.join(d, ".huhu"));
    writeFileSync(path.join(d, ".huhu/vault.json"), JSON.stringify({ kind: "nope" }));
    await expect(Vault.open(d)).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });
  test("向上查找 Vault 根", async () => {
    const d = tmp(); (await Vault.open(d, { create: true })).close();
    mkdirSync(path.join(d, "a/b"), { recursive: true });
    expect(findVaultRoot(path.join(d, "a/b"))).toBe(path.resolve(d));
    expect(findVaultRoot(tmp())).toBeNull();
  });
});
