import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Vault, exportPackage, importPackage } from "@huhu/vault";
import { afterEach, expect, test, vi } from "vitest";
import { SessionsService } from "../src/engine/sessions.js";
import { SpaceStore } from "../src/engine/spaces.js";
import { SpaceSchema, spaceCanLaunch } from "../src/shared/space.js";

const parent = realpathSync(tmpdir());
const prefix = "huhu-space-package-";
const temporary: string[] = [];
afterEach(() => {
  for (const root of temporary.splice(0)) {
    if (path.dirname(root) !== parent || !path.basename(root).startsWith(prefix)) throw new Error("Unexpected test directory");
    rmSync(root, { recursive: true, force: true });
  }
});

const catalog = (vaultRoot: string) => path.join(vaultRoot, ".huhu", "agent-cli", "spaces");
const store = (vaultRoot: string, machine = "m1", readOnly = false) => new SpaceStore(catalog(vaultRoot), machine, undefined, { vaultRoot, readOnly });
const rowFile = (vaultRoot: string, id: string) => path.join(catalog(vaultRoot), `${id}.json`);
const runtime = (vaultRoot: string) => path.join(vaultRoot, ".huhu", "runtime");

async function fixture() {
  const base = mkdtempSync(path.join(parent, prefix));
  temporary.push(base);
  const source = path.join(base, "source");
  mkdirSync(source);
  const vault = await Vault.open(source, { create: true });
  await vault.close();
  return { base, source, target: path.join(base, "restored"), zip: path.join(base, "workspace.zip") };
}

function withFile(directory: string, file: string, contents: string) {
  mkdirSync(directory, { recursive: true });
  const target = path.join(directory, file);
  writeFileSync(target, contents);
  return target;
}

test("ZIP 保留业务 Space、本地重开和原布局，按目的地复原并显式重绑外部目录", async () => {
  const { base, source, target, zip } = await fixture();
  const sourceWork = path.join(source, "Projects", "资料");
  withFile(sourceWork, "readme.md", "# work");
  const empty = path.join(source, "empty");
  const outside = path.join(base, "external");
  mkdirSync(empty);
  mkdirSync(outside);

  const original = store(source);
  const root = original.ensureDefault(source)!;
  const relative = original.save({ name: "资料", root: sourceWork });
  const external = original.save({ name: "外部", root: outside });
  const emptySpace = original.save({ name: "空目录", root: empty });
  const layout = withFile(path.join(runtime(source), "m1", "herdr"), "layout.json", "original-layout");
  const reopened = store(source);
  expect(reopened.ensureDefault(source)).toEqual(root);
  expect(reopened.get(relative.id)).toEqual(relative);
  expect(reopened.get(external.id)).toEqual(external);

  const { files } = await exportPackage(source, zip);
  const entries = files.map(({ path: entry }) => entry);
  expect(entries).toEqual(expect.arrayContaining([`.huhu/agent-cli/spaces/${root.id}.json`, ".huhu/agent-cli/spaces/.default-created", "Projects/资料/readme.md"]));
  expect(entries.some((entry) => entry.startsWith(".huhu/runtime/"))).toBe(false);
  importPackage(zip, target);
  for (const space of [root, relative, external, emptySpace]) {
    const record = JSON.parse(readFileSync(rowFile(target, space.id), "utf8"));
    expect(record).toMatchObject({ id: space.id, name: space.name, revision: space.revision, format: 2 });
    expect(record).not.toHaveProperty("root");
    expect(record).not.toHaveProperty("machineId");
    expect(JSON.stringify(record)).not.toContain(JSON.stringify(outside));
  }

  const restored = store(target);
  expect(restored.ensureDefault(target)).toMatchObject({ id: root.id, revision: root.revision, root: target });
  expect(restored.get(relative.id)).toMatchObject({ revision: relative.revision, root: path.join(target, "Projects", "资料") });
  expect(readFileSync(path.join(target, "Projects", "资料", "readme.md"), "utf8")).toBe("# work");
  expect(store(target, "m2").get(relative.id)).toMatchObject({ machineId: "m2", root: path.join(target, "Projects", "资料") });
  const pending = SpaceSchema.parse(restored.get(external.id));
  expect(pending).toMatchObject({ root: "", binding: { status: "needs-binding", reason: "external" } });
  expect(spaceCanLaunch(pending)).toBe(false);
  expect(spaceCanLaunch(restored.get(relative.id))).toBe(true);
  expect(restored.get(emptySpace.id)).toMatchObject({ root: "", binding: { status: "needs-binding", reason: "missing" } });
  expect(existsSync(runtime(target))).toBe(false);

  const core = vi.fn(async () => {
    throw new Error("Core must not be started");
  });
  const sessions = new SessionsService({
    dir: path.join(target, ".huhu", "agent-cli", "sessions"),
    vaultId: "vault-test",
    spaces: restored,
    core,
    resolve: async () => {
      throw new Error("Unexpected agent resolution");
    },
    now: () => new Date(),
  });
  for (const space of [external, emptySpace]) {
    await expect(sessions.launch({ spaceId: space.id, spaceRevision: space.revision, provider: "shell", requestId: `launch-${space.id}` })).rejects.toMatchObject({ code: "SPACE_INVALID" });
  }
  expect(core).not.toHaveBeenCalled();

  const replacement = path.join(base, "replacement");
  mkdirSync(replacement);
  const rebound = restored.save({ id: external.id, name: external.name, root: replacement, expectedRevision: external.revision });
  expect(rebound).toMatchObject({ id: external.id, revision: external.revision + 1, root: replacement, binding: { status: "bound" } });
  expect(store(target).validateForLaunch(rebound.id, rebound.revision)).toEqual(rebound);
  expect(() => restored.validateForLaunch(external.id, external.revision)).toThrowError(expect.objectContaining({ code: "SPACE_INVALID" }));
  expect(store(target, "m2").get(external.id)).toMatchObject({ root: "", binding: { status: "needs-binding" } });
  expect(store(source).get(external.id)).toEqual(external);
  expect(readFileSync(layout, "utf8")).toBe("original-layout");

  renameSync(replacement, path.join(base, "former-replacement"));
  mkdirSync(replacement);
  expect(store(target).get(external.id)).toMatchObject({ root: "", binding: { status: "needs-binding", reason: "unsafe" } });
  expect(() => store(target).validateForLaunch(rebound.id, rebound.revision)).toThrowError(expect.objectContaining({ code: "SPACE_INVALID" }));
});

test("恢复后目录联接与相对路径穿越都不能指回仍存在的源 Vault", async () => {
  const { source, target, zip } = await fixture();
  withFile(path.join(source, "projects", "work"), "note.md", "fixture");
  const sourceStore = store(source);
  sourceStore.ensureDefault(source);
  const relative = sourceStore.save({ name: "资料", root: path.join(source, "projects", "work") });
  await exportPackage(source, zip);
  importPackage(zip, target);
  const restored = store(target);
  expect(restored.validateForLaunch(relative.id, relative.revision).root).toBe(path.join(target, "projects", "work"));

  renameSync(path.join(target, "projects"), path.join(target, "original-projects"));
  symlinkSync(path.join(source, "projects"), path.join(target, "projects"), process.platform === "win32" ? "junction" : "dir");
  const unsafe = { root: "", binding: { status: "needs-binding", reason: "unsafe" } };
  expect(restored.get(relative.id)).toMatchObject(unsafe);
  expect(() => restored.validateForLaunch(relative.id, relative.revision)).toThrowError(expect.objectContaining({ code: "SPACE_INVALID" }));
  expect(() => restored.save({ name: "联接", root: path.join(target, "projects", "work") })).toThrowError(expect.objectContaining({ code: "PATH_OUTSIDE_VAULT" }));
  if (process.platform === "win32") {
    expect(() => restored.save({ name: "联接", root: path.join(target.toUpperCase(), "projects", "work") })).toThrowError(expect.objectContaining({ code: "PATH_OUTSIDE_VAULT" }));
  }

  const file = rowFile(target, relative.id);
  const record = JSON.parse(readFileSync(file, "utf8"));
  for (const directory of ["../source/projects/work", "projects/../../source/projects/work", "C:/source/projects/work"]) {
    writeFileSync(file, JSON.stringify({ ...record, directory: { kind: "relative", path: directory } }));
    expect(restored.get(relative.id)).toMatchObject(unsafe);
    expect(() => restored.validateForLaunch(relative.id, relative.revision)).toThrowError(expect.objectContaining({ code: "SPACE_INVALID" }));
  }
  expect(sourceStore.validateForLaunch(relative.id, relative.revision).root).toBe(path.join(source, "projects", "work"));
});

test("旧绝对记录只迁移可归属于当前库的本机目录，恢复副本和他机记录待绑定", async () => {
  const { base, source, target, zip } = await fixture();
  const work = path.join(source, "projects");
  const outside = path.join(base, "external");
  const otherLocal = path.join(source, "foreign");
  withFile(work, "note.md", "fixture");
  mkdirSync(outside);
  mkdirSync(otherLocal);
  const legacy = new SpaceStore(catalog(source), "m1");
  const root = legacy.ensureDefault(source)!;
  const relative = legacy.save({ name: "原库内", root: work });
  const external = legacy.save({ name: "原库外", root: outside });
  const foreign = new SpaceStore(catalog(source), "m2").save({ name: "他机记录", root: otherLocal });
  const before = readFileSync(rowFile(source, root.id), "utf8");
  const readOnly = store(source, "m1", true);
  expect(readOnly.ensureDefault(source)).toMatchObject({ id: root.id, root: source });
  expect(() => readOnly.save({ name: "尝试写入", root: outside })).toThrow();
  expect(readFileSync(rowFile(source, root.id), "utf8")).toBe(before);
  expect(existsSync(runtime(source))).toBe(false);

  await exportPackage(source, zip);
  importPackage(zip, target);
  const restored = store(target);
  expect(restored.ensureDefault(target)).toBeNull();
  const pending = { root: "", binding: { status: "needs-binding", reason: "legacy" } };
  for (const space of [root, relative, external, foreign]) {
    expect(restored.get(space.id)).toMatchObject(pending);
    expect(() => restored.validateForLaunch(space.id, space.revision)).toThrowError(expect.objectContaining({ code: "SPACE_INVALID" }));
    expect(JSON.parse(readFileSync(rowFile(target, space.id), "utf8"))).toMatchObject({ directory: { kind: "legacy" } });
  }
  const local = store(source);
  expect(local.ensureDefault(source)).toMatchObject({ id: root.id, root: source, revision: root.revision });
  expect(local.validateForLaunch(relative.id, relative.revision).root).toBe(work);
  expect(local.get(external.id)).toMatchObject(pending);
  expect(local.get(foreign.id)).toMatchObject(pending);
});
