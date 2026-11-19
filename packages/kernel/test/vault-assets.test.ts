import { mkdtempSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Vault, VaultIndex } from "@huhu/vault";
import { expect, test } from "vitest";
import { CapabilityRegistry } from "../src/capabilities/define.js";
import { registerVaultCapabilities } from "../src/capabilities/vault.js";

async function withVault(run: (root: string, call: (name: string, input: object) => Promise<unknown>) => Promise<void>) {
  const root = mkdtempSync(path.join(tmpdir(), "huhu-read-assets-"));
  const vault = await Vault.open(root, { create: true });
  const registry = new CapabilityRegistry();
  registerVaultCapabilities(registry, vault, new VaultIndex(root));
  try {
    await run(root, async (name, input) => {
      const capability = registry.get(name)!;
      return capability.output.parse(await capability.handler({ signal: new AbortController().signal, caller: "desktop", requestId: "test" }, capability.input.parse(input)));
    });
  } finally {
    await vault.close();
    rmSync(root, { recursive: true, force: true });
  }
}

test("共享附件读取按真实目录执行权限，列表仅在明确包含受保护项时给出元数据", async () => {
  await withVault(async (root, call) => {
    writeFileSync(path.join(root, ".huhu", "fixture.txt"), "测试夹具");
    for (const name of ["vault.readRange", "vault.readBinary"]) {
      const range = name === "vault.readRange" ? { offset: 0, length: 32 } : {};
      await expect(call(name, { path: "./.huhu//fixture.txt", ...range })).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
    }
    if (process.platform !== "win32") {
      symlinkSync(path.join(root, ".huhu"), path.join(root, "alias"), "dir");
      await expect(call("vault.readRange", { path: "alias/fixture.txt", offset: 0, length: 32 })).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
      await expect(call("vault.list", { dir: "alias", includeProtected: true })).resolves.toMatchObject({
        entries: expect.arrayContaining([expect.objectContaining({ path: "alias/fixture.txt", protected: "internal" })]),
      });
    }
  });
});

test("分段读取拒绝同尺寸的文件替换，并返回实际读到的尾段长度", async () => {
  await withVault(async (root, call) => {
    const original = path.join(root, "sample.bin");
    writeFileSync(original, "original");
    const first = (await call("vault.readRange", { path: "sample.bin", offset: 0, length: 4 })) as { version: string };
    expect(first).toMatchObject({ size: 8, length: 4, base64: Buffer.from("orig").toString("base64"), version: expect.any(String) });
    await expect(call("vault.readRange", { path: "sample.bin", offset: 6, length: 4, expectedVersion: first.version })).resolves.toMatchObject({
      length: 2,
      base64: Buffer.from("al").toString("base64"),
      eof: true,
    });
    writeFileSync(path.join(root, "replacement"), "replaced");
    renameSync(path.join(root, "replacement"), original);
    await expect(call("vault.readRange", { path: "sample.bin", offset: 4, length: 4, expectedVersion: first.version })).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
  });
});
