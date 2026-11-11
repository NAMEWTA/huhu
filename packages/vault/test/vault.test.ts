import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { Vault, findVaultRoot } from "../src/index.js";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
const tmp = () => {
  const d = mkdtempSync(path.join(tmpdir(), "huhu-vl-"));
  dirs.push(d);
  return d;
};

describe("Vault 生命周期", () => {
  test("新建：只创建 .huhu/vault.json，不动已有文件", async () => {
    const d = tmp();
    writeFileSync(path.join(d, "readme.md"), "hi");
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
    const d = tmp();
    mkdirSync(path.join(d, ".huhu"));
    writeFileSync(path.join(d, ".huhu/vault.json"), JSON.stringify({ kind: "huhu-vault", id: "vault-abc", name: "x", formatVersion: 99, createdAt: "" }));
    await expect(Vault.open(d)).rejects.toMatchObject({ code: "READ_ONLY_VAULT" });
  });
  test("过新的 formatVersion 可以只读打开", async () => {
    const d = tmp();
    mkdirSync(path.join(d, ".huhu"));
    writeFileSync(path.join(d, ".huhu/vault.json"), JSON.stringify({ kind: "huhu-vault", id: "vault-abc", name: "x", formatVersion: 99, createdAt: "" }));
    const v = await Vault.open(d, { readOnly: true });
    expect(v.readOnly).toBe(true);
    await v.close();
  });
  test("坏的 vault.json → INVALID_INPUT", async () => {
    const d = tmp();
    mkdirSync(path.join(d, ".huhu"));
    writeFileSync(path.join(d, ".huhu/vault.json"), JSON.stringify({ kind: "nope" }));
    await expect(Vault.open(d)).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });
  test("向上查找 Vault 根", async () => {
    const d = tmp();
    (await Vault.open(d, { create: true })).close();
    mkdirSync(path.join(d, "a/b"), { recursive: true });
    expect(findVaultRoot(path.join(d, "a/b"))).toBe(path.resolve(d));
    expect(findVaultRoot(tmp())).toBeNull();
  });
});

describe("Vault 名称与描述", () => {
  test("updateInfo：只改 vault.json 的名称与描述，去首尾空白，重新打开仍在；其余字段（id、createdAt）不变", async () => {
    const d = tmp();
    const v = await Vault.open(d, { create: true, name: "旧名" });
    const before = { ...v.info };
    const r = v.updateInfo({ name: "  新名称  ", description: " 写给自己的说明 " });
    expect(r).toMatchObject({ name: "新名称", description: "写给自己的说明", id: before.id, createdAt: before.createdAt });
    expect(v.info.name).toBe("新名称");
    expect(v.updateInfo({ description: "" }).name).toBe("新名称"); // 只改一个字段
    await v.close();
    const again = await Vault.open(d);
    expect(again.info).toMatchObject({ name: "新名称", description: "", id: before.id });
    expect(JSON.parse(readFileSync(path.join(d, ".huhu/vault.json"), "utf8"))).toMatchObject({ kind: "huhu-vault", name: "新名称" });
    expect(readdirSync(path.join(d, ".huhu")).filter((f) => f.endsWith(".tmp"))).toEqual([]);
    await again.close();
  });
  test("updateInfo 以磁盘上的最新 vault.json 为基础：同步拉取/外部改名后只改描述不会把名字改回去；currentInfo 反映磁盘", async () => {
    const d = tmp();
    const v = await Vault.open(d, { create: true, name: "本地旧名" });
    const f = path.join(d, ".huhu/vault.json");
    writeFileSync(f, JSON.stringify({ ...JSON.parse(readFileSync(f, "utf8")), name: "远端新名" }, null, 2));
    expect(v.currentInfo().name).toBe("远端新名");
    writeFileSync(f, JSON.stringify({ ...JSON.parse(readFileSync(f, "utf8")), name: "再次远端改名" }, null, 2));
    const r = v.updateInfo({ description: "只改描述" });
    expect(r).toMatchObject({ name: "再次远端改名", description: "只改描述" });
    expect(JSON.parse(readFileSync(f, "utf8"))).toMatchObject({ name: "再次远端改名", description: "只改描述" });
    writeFileSync(f, "{坏的"); // 文件损坏：读取退回缓存；写入拒绝（不用缓存去覆盖用户的文件）
    expect(v.currentInfo().name).toBe("再次远端改名");
    expect(() => v.updateInfo({ description: "x" })).toThrow(/无法读取/);
    expect(readFileSync(f, "utf8")).toBe("{坏的");
    await v.close();
  });
  test("updateInfo：长度按字符计（emoji 不按 UTF-16 码元算两个）", async () => {
    const v = await Vault.open(tmp(), { create: true, name: "库" });
    expect(v.updateInfo({ name: "😀".repeat(80) }).name).toBe("😀".repeat(80));
    expect(() => v.updateInfo({ name: "😀".repeat(81) })).toThrow();
    await v.close();
  });
  test("updateInfo：名称不能含换行/控制字符；描述可以换行但不能含其他控制字符", async () => {
    const d = tmp();
    const v = await Vault.open(d, { create: true, name: "库" });
    expect(() => v.updateInfo({ name: "第一行\n第二行" })).toThrow();
    expect(() => v.updateInfo({ description: "a\u0000b" })).toThrow();
    expect(v.updateInfo({ description: "第一行\n第二行" }).description).toBe("第一行\n第二行");
    await v.close();
  });
  test("updateInfo：名称不能为空或超过 80 字，描述最多 500 字；失败不改变文件；只读 Vault 拒绝", async () => {
    const d = tmp();
    const v = await Vault.open(d, { create: true, name: "库" });
    expect(() => v.updateInfo({ name: "   " })).toThrow();
    expect(() => v.updateInfo({ name: "长".repeat(81) })).toThrow();
    expect(() => v.updateInfo({ description: "长".repeat(501) })).toThrow();
    expect(JSON.parse(readFileSync(path.join(d, ".huhu/vault.json"), "utf8")).name).toBe("库");
    const ro = await Vault.open(d, { readOnly: true });
    expect(() => ro.updateInfo({ name: "改" })).toThrowError(expect.objectContaining({ code: "READ_ONLY_VAULT" }));
    await ro.close();
    await v.close();
  });
});
