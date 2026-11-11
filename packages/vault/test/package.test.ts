import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { unzipSync, zipSync } from "fflate";
import { createHash } from "node:crypto";
import { afterEach, describe, expect, test } from "vitest";
import { exportPackage, importPackage } from "../src/index.js";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
const tmp = () => {
  const d = mkdtempSync(path.join(tmpdir(), "huhu-pk-"));
  dirs.push(d);
  return d;
};
function makeVault() {
  const root = tmp();
  mkdirSync(path.join(root, ".huhu/runtime/m1"), { recursive: true });
  mkdirSync(path.join(root, ".huhu/safe"), { recursive: true });
  writeFileSync(path.join(root, ".huhu/vault.json"), JSON.stringify({ kind: "huhu-vault", id: "vault-abc123", name: "测试库", description: "", formatVersion: 1, createdAt: "2026-11-10T00:00:00Z" }));
  writeFileSync(path.join(root, ".huhu/runtime/m1/engine.json"), "runtime");
  writeFileSync(path.join(root, ".huhu/safe/keyring.json"), "{}");
  writeFileSync(path.join(root, "笔记.md"), "# 笔记\n");
  writeFileSync(path.join(root, "pic.png"), Buffer.from([1, 2, 3]));
  return root;
}
const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
function evilZip(files: Record<string, string>, manifestFiles?: { path: string; content: string }[]) {
  const entries: Record<string, Uint8Array> = {};
  for (const [p, c] of Object.entries(files)) entries[p] = Buffer.from(c);
  const list = (manifestFiles ?? Object.entries(files).map(([path, content]) => ({ path, content }))).map((f) => ({ path: f.path, sha256: sha(Buffer.from(f.content)), size: Buffer.from(f.content).length }));
  entries["huhu-package.json"] = Buffer.from(JSON.stringify({ format: "huhu-package", version: 1, vaultId: "vault-x", vaultName: "x", createdAt: "", files: list }));
  const d = tmp();
  const p = path.join(d, "evil.zip");
  writeFileSync(p, zipSync(entries));
  return p;
}
const VJ = JSON.stringify({ kind: "huhu-vault", id: "vault-evil1", name: "e", description: "", formatVersion: 1, createdAt: "" });

describe("数据包", () => {
  test("导出排除 runtime，导入后哈希一致，保留 vaultId", async () => {
    const root = makeVault();
    const zip = path.join(tmp(), "out.zip");
    const m = await exportPackage(root, zip);
    expect(m.files.map((f) => f.path)).toEqual([".huhu/safe/keyring.json", ".huhu/vault.json", "pic.png", "笔记.md"]);
    const target = path.join(tmp(), "imported");
    const r = importPackage(zip, target);
    expect(r.vaultId).toBe("vault-abc123");
    expect(readFileSync(path.join(target, "笔记.md"), "utf8")).toBe("# 笔记\n");
    expect([...readFileSync(path.join(target, "pic.png"))]).toEqual([1, 2, 3]);
    expect(existsSync(path.join(target, ".huhu/runtime"))).toBe(false);
  });
  test("不含附件", async () => {
    const m = await exportPackage(makeVault(), path.join(tmp(), "o.zip"), { includeAttachments: false });
    expect(m.files.map((f) => f.path)).not.toContain("pic.png");
  });
  test("同 id 已存在 → 生成新 id", async () => {
    const zip = path.join(tmp(), "o.zip");
    await exportPackage(makeVault(), zip);
    const r = importPackage(zip, path.join(tmp(), "t"), { existingVaultIds: ["vault-abc123"] });
    expect(r.vaultId).not.toBe("vault-abc123");
  });
  test("取消导出不留半成品", async () => {
    const ac = new AbortController();
    ac.abort();
    const dest = path.join(tmp(), "o.zip");
    await expect(exportPackage(makeVault(), dest, { signal: ac.signal })).rejects.toThrow();
    expect(existsSync(dest)).toBe(false);
    expect(readdirSync(path.dirname(dest)).filter((f) => f.endsWith(".partial"))).toEqual([]);
  });
  test("目标非空 → 拒绝", async () => {
    const zip = path.join(tmp(), "o.zip");
    await exportPackage(makeVault(), zip);
    const t = tmp();
    writeFileSync(path.join(t, "x"), "1");
    expect(() => importPackage(zip, t)).toThrowError(/必须为空/);
  });
  const cases: [string, () => string, RegExp][] = [
    ["绝对路径", () => evilZip({ "/etc/x": "1", ".huhu/vault.json": VJ }), /非法路径/],
    ["..", () => evilZip({ "../escape.md": "1", ".huhu/vault.json": VJ }), /非法路径/],
    ["重复路径(大小写)", () => evilZip({ "A.md": "1", "a.md": "2", ".huhu/vault.json": VJ }), /重复路径/],
    [
      "哈希不符",
      () =>
        evilZip({ "a.md": "tampered", ".huhu/vault.json": VJ }, [
          { path: "a.md", content: "original" },
          { path: ".huhu/vault.json", content: VJ },
        ]),
      /哈希不符/,
    ],
    [
      "清单外文件",
      () => {
        const zip = evilZip({ ".huhu/vault.json": VJ });
        const entries = unzipSync(readFileSync(zip));
        entries["extra.md"] = Buffer.from("x");
        writeFileSync(zip, zipSync(entries));
        return zip;
      },
      /清单之外/,
    ],
    ["缺 vault.json", () => evilZip({ "a.md": "1" }), /缺少 \.huhu\/vault\.json/],
  ];
  for (const [name, make, msg] of cases) {
    test(`ACC-WB-04：恶意包被拒且不留文件：${name}`, () => {
      const zip = make();
      const parent = tmp();
      const target = path.join(parent, "t");
      expect(() => importPackage(zip, target)).toThrowError(msg);
      expect(existsSync(target)).toBe(false);
      expect(readdirSync(parent)).toEqual([]);
    });
  }
  test("不是 zip", () => {
    const f = path.join(tmp(), "x.zip");
    writeFileSync(f, "not a zip");
    expect(() => importPackage(f, path.join(tmp(), "t"))).toThrowError(/zip/);
  });
});

describe("导出的安全与内存", () => {
  test("预置的 <dest>.partial 符号链接不会被跟随：导出到别处不动被指向的文件；临时名随机、用完不留", async () => {
    const root = makeVault();
    const out = tmp();
    const victim = path.join(out, "victim.txt");
    writeFileSync(victim, "原内容");
    symlinkSync(victim, path.join(out, "o.zip.partial"));
    const dest = path.join(out, "o.zip");
    await exportPackage(root, dest);
    expect(readFileSync(victim, "utf8")).toBe("原内容");
    expect(readFileSync(dest).subarray(0, 2).toString()).toBe("PK");
    expect(readdirSync(out).filter((f) => f.endsWith(".partial") && f !== "o.zip.partial")).toEqual([]);
  });
  test("大文件分块压缩：内容完整往返（含 > 1 MiB 的文件），导出期间事件循环有机会运行", async () => {
    const root = makeVault();
    const big = Buffer.alloc(3 * 1024 * 1024 + 123, 7);
    writeFileSync(path.join(root, "big.bin"), big);
    const zip = path.join(tmp(), "big.zip");
    let ticks = 0;
    const timer = setInterval(() => {
      ticks++;
    }, 1);
    await exportPackage(root, zip);
    clearInterval(timer);
    expect(ticks).toBeGreaterThan(0);
    const target = path.join(tmp(), "back");
    importPackage(zip, target);
    expect(readFileSync(path.join(target, "big.bin")).equals(big)).toBe(true);
  });
});
