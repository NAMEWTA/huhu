import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { VaultFiles } from "@huhu/vault";
import { afterEach, describe, expect, test } from "vitest";
import { GuideService } from "../src/engine/service.js";
import { buildGuideFiles, GUIDE_PATHS } from "../src/shared/guide-files.js";
import { judgeFile, overall, type FileFacts } from "../src/shared/guide-state.js";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
const caps = [
  { name: "vault.info", plugin: "kernel", scope: "read", exposable: true },
  { name: "safe.items.reveal", plugin: "safe", scope: "read", exposable: false },
];
function setup(version = "1.0.0", readOnly = false) {
  const root = mkdtempSync(path.join(tmpdir(), "huhu-guide-"));
  dirs.push(root);
  mkdirSync(path.join(root, ".huhu"), { recursive: true });
  const files = new VaultFiles(root, undefined, readOnly);
  let v = version;
  let t = 0;
  const svc = new GuideService({ files, version: v, capabilities: () => caps, now: () => new Date(Date.UTC(2026, 10, 11, 0, 0, t++)) });
  const upgrade = (next: string) => {
    v = next;
    return new GuideService({ files, version: v, capabilities: () => caps, now: () => new Date(Date.UTC(2026, 10, 11, 1, 0, t++)) });
  };
  return { root, svc, upgrade, files };
}
const SKILL = ".agents/skills/huhu/SKILL.md";

describe("状态判定（纯函数）", () => {
  const base: FileFacts = { current: "a", builtin: "a", baseline: "a", preserved: false, needsCheck: false, error: false };
  test("八种状态里的七种由文件事实决定", () => {
    expect(judgeFile(base)).toBe("current");
    expect(judgeFile({ ...base, current: null })).toBe("missing");
    expect(judgeFile({ ...base, current: "old", baseline: "old", builtin: "new" })).toBe("outdated");
    expect(judgeFile({ ...base, current: "hand", baseline: "old", builtin: "new" })).toBe("conflict");
    expect(judgeFile({ ...base, current: "hand", baseline: null, builtin: "new" })).toBe("conflict");
    expect(judgeFile({ ...base, current: "hand", builtin: "new", preserved: true })).toBe("preserved");
    expect(judgeFile({ ...base, current: "old", baseline: "old", builtin: "new", needsCheck: true })).toBe("needs-check");
    expect(judgeFile({ ...base, error: true })).toBe("error");
  });
  test("总状态取最需要处理的", () => {
    expect(overall(["current", "outdated", "conflict"])).toBe("conflict");
    expect(overall(["current", "current"])).toBe("current");
    expect(overall(["missing", "outdated"])).toBe("outdated");
  });
});

describe("生成内容", () => {
  test("只列出可对外开放的能力；版本写入 SKILL.md", () => {
    const f = buildGuideFiles("1.2.3", caps);
    expect(f.map((x) => x.path)).toEqual([...GUIDE_PATHS]);
    expect(f[0]?.content).toContain('version: "1.2.3"');
    expect(f[1]?.content).toContain("| vault.info |");
    expect(f[1]?.content).not.toContain("safe.items.reveal");
  });
});

describe("GuideService", () => {
  test("missing 自动补写；current；幂等", async () => {
    const { svc, root } = setup();
    expect(svc.status().overall).toBe("missing");
    await svc.maintain();
    expect(existsSync(path.join(root, SKILL))).toBe(true);
    expect(svc.status().overall).toBe("current");
    const before = readFileSync(path.join(root, SKILL), "utf8");
    await svc.maintain();
    expect(readFileSync(path.join(root, SKILL), "utf8")).toBe(before);
  });
  test("outdated：内置版本升级后自动备份并升级", async () => {
    const { svc, upgrade, root } = setup("1.0.0");
    await svc.maintain();
    const v2 = upgrade("1.1.0");
    expect(v2.status().files[0]?.status).toBe("outdated");
    await v2.maintain();
    expect(readFileSync(path.join(root, SKILL), "utf8")).toContain('version: "1.1.0"');
    expect(v2.backups()).toHaveLength(1);
    expect(v2.status().overall).toBe("current");
  });
  test("ACC-PL-07：手改后是 conflict，维护不写；备份并恢复内置版本后文件为内置内容，备份里有手改版本", async () => {
    const { svc, root } = setup();
    await svc.maintain();
    writeFileSync(path.join(root, SKILL), "我手改的内容");
    expect(svc.status().files[0]?.status).toBe("conflict");
    await svc.maintain();
    expect(readFileSync(path.join(root, SKILL), "utf8")).toBe("我手改的内容"); // 重新打开 Vault 不覆盖
    const r = await svc.restoreBuiltin(SKILL);
    expect(r.backupId).not.toBeNull();
    expect(readFileSync(path.join(root, SKILL), "utf8")).toContain("HUHU Vault 操作指南");
    expect(readFileSync(path.join(root, ".huhu/guide/backups", r.backupId!, SKILL), "utf8")).toBe("我手改的内容");
    expect(svc.status().overall).toBe("current");
  });
  test("保留当前文件 → preserved，维护不写；恢复备份回到手改版本", async () => {
    const { svc, upgrade, root } = setup("1.0.0");
    await svc.maintain();
    writeFileSync(path.join(root, SKILL), "保留我");
    await svc.preserve(SKILL);
    const v2 = upgrade("2.0.0");
    expect(v2.status().files[0]?.status).toBe("preserved");
    await v2.maintain();
    expect(readFileSync(path.join(root, SKILL), "utf8")).toBe("保留我");
    const { backupId } = await v2.restoreBuiltin(SKILL);
    expect(readFileSync(path.join(root, SKILL), "utf8")).toContain('version: "2.0.0"');
    await v2.restoreBackup(backupId!);
    expect(readFileSync(path.join(root, SKILL), "utf8")).toBe("保留我");
  });
  test("版本历史恢复后标记 needs-check，检查后按内容重新判定", async () => {
    const { svc, upgrade } = setup("1.0.0");
    await svc.maintain();
    const v2 = upgrade("2.0.0"); // 磁盘上是旧版本
    await v2.markNeedsCheck([SKILL, "别的文件.md"]);
    expect(v2.status().files[0]?.status).toBe("needs-check");
    await v2.maintain(); // needs-check 不写
    expect(v2.status().files[0]?.status).toBe("needs-check");
    await v2.check();
    expect(v2.status().files[0]?.status).toBe("outdated");
  });
  test("只读 Vault 不写；非三份文件的路径被拒绝", async () => {
    const { svc, root } = setup("1.0.0", true);
    await svc.maintain();
    expect(existsSync(path.join(root, SKILL))).toBe(false);
    expect(svc.status().readOnly).toBe(true);
    await expect(svc.preserve(SKILL)).rejects.toMatchObject({ code: "READ_ONLY_VAULT" });
    const w = setup();
    await expect(w.svc.restoreBuiltin("../../etc/passwd")).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(w.svc.restoreBackup("../x")).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });
  test("不动 .agents/skills 下的其他内容", async () => {
    const { svc, root } = setup();
    mkdirSync(path.join(root, ".agents/skills/other"), { recursive: true });
    writeFileSync(path.join(root, ".agents/skills/other/SKILL.md"), "别人的");
    await svc.maintain();
    await svc.restoreBuiltin();
    expect(readFileSync(path.join(root, ".agents/skills/other/SKILL.md"), "utf8")).toBe("别人的");
  });
});
