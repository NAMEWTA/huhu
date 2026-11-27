import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test } from "vitest";
import { Archives } from "../src/engine/archives.js";
import { FileSessions } from "../src/engine/file-sessions.js";
import { SshManager } from "../src/engine/manager.js";
import { startFakeSsh } from "./fake-server.js";
import { ownedHosts } from "./owned-hosts.js";

test.skipIf(process.platform !== "linux" || !existsSync("/usr/bin/python3"))("Linux ZIP lists and publishes verified SFTP files, and rejects archived link entries", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "huhu-linux-zip-"));
  const server = await startFakeSsh();
  const hosts = ownedHosts();
  const host = hosts.save({ host: "127.0.0.1", name: "ZIP fixture", user: "fixture", port: server.port, jumpHostIds: [], tags: [] });
  const manager = new SshManager({
    hosts,
    knownHostsFile: path.join(root, "known_hosts"),
    auditDir: path.join(root, "audit"),
    now: () => new Date(),
    withManagedAuth: (_host, connect) => connect({ password: "pw" }),
    publish: () => undefined,
  });
  const sessions = new FileSessions(manager);
  const archives = new Archives(sessions, manager);
  try {
    const dial = manager.connect(host.id);
    const signal = new AbortController().signal;
    await expect.poll(() => manager.connectionStatuses()[0]?.state).toBe("waiting");
    const waiting = manager.connectionStatuses()[0];
    if (waiting?.state !== "waiting") throw new Error("Expected SSH host-key prompt");
    expect(manager.decide(waiting.attemptId, 0, true, waiting.prompt.promptId, false)).toBe(true);
    await dial;
    const { fileSessionId } = sessions.open({ hostId: host.id, attached: false });
    const directory = { kind: "remote" as const, fileSessionId, path: "/home/test" };

    const content = Buffer.from([0, 255, 1, 2, 3]);
    const stamp = 1_700_000_001_000;
    const name = "项目/文件.txt";
    server.fs.dirs.add("/home/test/项目");
    server.fs.files.set("/home/test/" + name, content);
    server.fs.timestamps.set("/home/test/" + name, stamp / 1000);
    const expected = { name, mtime: stamp, sha256: createHash("sha256").update(content).digest("hex"), size: content.length };

    expect(await archives.support(fileSessionId, signal)).toMatchObject({ local: { zip: true }, remote: { zip: true } });
    const compressed = await archives.run({ directory, operation: "compress", name: "项目", output: "fixture.zip" }, signal);
    expect(compressed.entries).toContainEqual(expect.objectContaining(expected));
    const read = await archives.run({ directory, operation: "list", name: "fixture.zip" }, signal);
    expect(read.entries).toContainEqual(expect.objectContaining(expected));
    expect(read.archiveSha256).toBe(compressed.archiveSha256);
    const extracted = await archives.run({ directory, operation: "extract", name: "fixture.zip", output: "unpacked" }, signal);
    expect(extracted.extractedPath).toBe("/home/test/unpacked");
    expect(server.fs.files.get("/home/test/unpacked/" + name)).toEqual(content);
    expect(server.fs.timestamps.get("/home/test/unpacked/" + name)).toBe(stamp / 1000);
    await expect(archives.run({ directory, operation: "extract", name: "fixture.zip", output: "unpacked" }, signal)).rejects.toMatchObject({ code: "NAME_CONFLICT" });

    const localPath = path.join(root, "local");
    const localSource = path.join(localPath, "source");
    mkdirSync(localSource, { recursive: true });
    const localFile = path.join(localSource, "文档.txt");
    writeFileSync(localFile, content);
    const fractional = stamp / 1000 + 0.125_375;
    utimesSync(localSource, fractional, fractional);
    utimesSync(localFile, fractional, fractional);
    expect(statSync(localFile).mtimeMs % 1).not.toBe(0);
    await sessions.localList(fileSessionId, [], localPath);
    const local = { directory: { kind: "local" as const, path: localPath }, localFileSessionId: fileSessionId };
    const made = await archives.run({ ...local, operation: "compress", name: "source", output: "local.zip" }, signal);
    const localRead = await archives.run({ ...local, operation: "list", name: "local.zip" }, signal);
    expect(localRead.archiveSha256).toBe(made.archiveSha256);
    expect(localRead.entries).toContainEqual(expect.objectContaining({ ...expected, name: "source/文档.txt" }));
    await archives.run({ ...local, operation: "extract", name: "local.zip", output: "restored" }, signal);
    expect(readFileSync(path.join(localPath, "restored", "source", "文档.txt"))).toEqual(content);

    const linked = path.join(root, "link.zip");
    execFileSync("/usr/bin/python3", [
      "-I",
      "-c",
      `
from zipfile import ZipFile, ZipInfo
import sys
with ZipFile(sys.argv[1], "x") as archive:
    entry = ZipInfo("link")
    entry.create_system = 3
    entry.external_attr = 0o120777 << 16
    archive.writestr(entry, "fixture-target")
`,
      linked,
    ]);
    server.fs.files.set("/home/test/link.zip", readFileSync(linked));
    await expect(archives.run({ directory, operation: "extract", name: "link.zip", output: "should-stay-absent" }, signal)).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(server.fs.dirs.has("/home/test/should-stay-absent")).toBe(false);
    expect([...server.fs.files.keys()].some((file) => file.includes(".huhu-zip-"))).toBe(false);
  } finally {
    sessions.dispose();
    manager.disposeAll();
    await server.close();
    rmSync(root, { recursive: true, force: true });
  }
});
