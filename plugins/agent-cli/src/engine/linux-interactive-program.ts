import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { closeSync, constants, existsSync, fstatSync, openSync, readSync, readdirSync, realpathSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { errors } from "@huhu/contracts";
import { findOnPath } from "./detect.js";
import { linuxProgramIdentity, pinNativeImage, type LinuxInstallation, type NativeLaunchPlan, type PinnedImage } from "./native-pty.js";

const piPackages = ["@earendil-works/pi-coding-agent", "@mariozechner/pi-coding-agent"];
const codexPackage = "@openai/codex";
const codexPlatform = "@openai/codex-linux-x64";
const codexTarget = "x86_64-unknown-linux-musl";
const script = /\.(?:js|mjs|cjs)$/i;
const canonical = realpathSync.native;
const invalid = () => errors.invalidInput("无法核对 Linux 智能体的安装入口或解释器，请检查本机安装并重新预览");
const within = (root: string, file: string) => file.startsWith(root + path.sep);
const managerFlags = ["CODEX_MANAGED_BY_NPM", "CODEX_MANAGED_BY_BUN", "CODEX_MANAGED_BY_PNPM", "CODEX_MANAGED_BY_VITE_PLUS"];

/** Only these derived variables are reserved within their respective packaged launch. */
export function linuxInstallationEnvironment(installation: LinuxInstallation | undefined): readonly string[] {
  if (installation?.kind === "codex-npm") return ["CODEX_MANAGED_PACKAGE_ROOT", ...managerFlags];
  return installation?.kind === "pi-node" ? ["PI_PACKAGE_DIR", "PI_MANAGED_INSTALL_ROOT"] : [];
}

type Metadata = Map<string, string>;
type Manifest = { name?: string; version?: string; bin?: string | Record<string, string> };

function boundPath(file: string, aliases: Map<string, string>) {
  if (!path.isAbsolute(file) || path.normalize(file) !== file) throw invalid();
  const target = canonical(file);
  if (target !== file) aliases.set(file, target);
  return target;
}

function metadata(file: string, recorded: Metadata) {
  if (canonical(file) !== file) throw invalid();
  const fd = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const before = fstatSync(fd, { bigint: true });
    if (!before.isFile() || before.size > 1024n * 1024n) throw invalid();
    const data = Buffer.alloc(Number(before.size));
    let offset = 0;
    while (offset < data.length) {
      const n = readSync(fd, data, offset, data.length - offset, offset);
      if (!n) throw invalid();
      offset += n;
    }
    if (fstatSync(fd, { bigint: true }).ctimeNs !== before.ctimeNs) throw invalid();
    recorded.set(file, createHash("sha256").update(data).digest("hex"));
    return JSON.parse(data.toString("utf8")) as unknown;
  } finally {
    closeSync(fd);
  }
}

function packageFor(entry: string, names: string[], bin: string, recorded: Metadata) {
  for (let root = path.dirname(entry); root !== path.dirname(root); root = path.dirname(root)) {
    const file = path.join(root, "package.json");
    if (!existsSync(file)) continue;
    const manifest = metadata(file, recorded) as Manifest;
    const binding = typeof manifest.bin === "string" ? manifest.bin : manifest.bin?.[bin];
    if (!manifest.name || !names.includes(manifest.name)) continue;
    if (typeof binding !== "string" || !within(root, path.resolve(root, binding)) || path.resolve(root, binding) !== entry) throw invalid();
    return { root, file, manifest };
  }
  throw invalid();
}

function voltaHome(command: string, target: string) {
  if (path.basename(target) !== "volta-shim") return undefined;
  const bin = path.dirname(target);
  if (path.basename(bin) !== "bin" || canonical(path.dirname(command)) !== bin || canonical(path.join(bin, "volta")) !== path.join(bin, "volta")) throw invalid();
  return path.dirname(bin);
}

function voltaWhich(home: string, name: "codex" | "pi" | "node", cwd: string, env: Record<string, string>, aliases: Map<string, string>): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(path.join(home, "bin", "volta"), ["which", name], { cwd, env: { HOME: env.HOME ?? home, VOLTA_HOME: home, PATH: `${home}/bin:/usr/bin:/bin` }, timeout: 4000, maxBuffer: 4096 }, (error, stdout) => {
      const file = stdout.replace(/\r?\n$/, "");
      if (error || !path.isAbsolute(file) || /[\r\n\0]/.test(file)) return reject(invalid());
      try {
        const target = boundPath(file, aliases);
        if (path.basename(target) === "volta-shim") throw invalid();
        resolve(target);
      } catch {
        reject(invalid());
      }
    });
  });
}

function globalVoltaRecord(home: string, name: "pi" | "codex", pkg: ReturnType<typeof packageFor>, recorded: Metadata) {
  const packageImages = path.join(home, "tools/image/packages");
  if (!within(packageImages, pkg.root)) return undefined;
  const found = metadata(path.join(home, "tools/user/bins", `${name}.json`), recorded) as { name?: string; package?: string; version?: string; platform?: { node?: string } };
  const node = found.platform?.node;
  if (
    found.name !== name ||
    found.package !== pkg.manifest.name ||
    found.version !== pkg.manifest.version ||
    (found.package && !within(path.join(packageImages, found.package), pkg.root)) ||
    typeof node !== "string" ||
    !/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(node)
  )
    throw invalid();
  return path.join(home, "tools/image/node", node, "bin/node");
}

function pathProgram(name: string, cwd: string, env: Record<string, string>) {
  return findOnPath(
    name,
    {
      PATH: (env.PATH ?? "/usr/bin:/bin")
        .split(":")
        .map((dir) => path.resolve(cwd, dir))
        .join(":"),
    },
    "linux",
  );
}

async function nodeFor(entry: string, cwd: string, env: Record<string, string>, aliases: Map<string, string>) {
  const fd = openSync(entry, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  let shebang: string;
  try {
    if (!fstatSync(fd).isFile()) throw invalid();
    const buffer = Buffer.alloc(384);
    shebang = buffer.subarray(0, readSync(fd, buffer)).toString("utf8").split(/\r?\n/, 1)[0]!;
  } finally {
    closeSync(fd);
  }
  const direct = /^#!\s*(\/[^\s]+\/(?:node|nodejs))\s*$/.exec(shebang)?.[1];
  const command = direct ?? (/^#!\s*\/[^\s]+\/env\s+(?:-S\s+)?node\s*$/.test(shebang) ? pathProgram("node", cwd, env) : null);
  if (!command) throw invalid();
  const target = boundPath(command, aliases);
  const volta = voltaHome(command, target);
  return volta ? voltaWhich(volta, "node", cwd, env, aliases) : target;
}

function declaredFiles(root: string, include = (_file: string) => true) {
  if (!existsSync(root)) return [];
  const files: string[] = [];
  for (const item of readdirSync(root, { recursive: true, withFileTypes: true })) {
    const file = path.join(item.parentPath, item.name);
    if (item.isSymbolicLink() || (!item.isFile() && !item.isDirectory())) throw invalid();
    if (item.isFile() && include(file)) files.push(file);
    if (files.length > 128) throw invalid();
  }
  return files;
}

function modulesOf(root: string) {
  const local = path.join(root, "node_modules");
  const localModules = existsSync(local) ? canonical(local) : undefined;
  let hoistedModules: string | undefined;
  for (let dir = path.dirname(root); dir !== path.dirname(dir); dir = path.dirname(dir)) {
    if (path.basename(dir) === "node_modules") {
      hoistedModules = dir;
      break;
    }
  }
  if ((localModules && !statSync(localModules).isDirectory()) || (hoistedModules && !statSync(hoistedModules).isDirectory())) throw invalid();
  return { ...(localModules && { localModules }), ...(hoistedModules && { hoistedModules }) };
}

function codexLayout(entry: string, pkg: ReturnType<typeof packageFor>, recorded: Metadata) {
  const { root, file, manifest } = pkg;
  let platformFile: string | undefined;
  try {
    platformFile = canonical(createRequire(entry).resolve(`${codexPlatform}/package.json`));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "MODULE_NOT_FOUND") throw error;
  }
  if (platformFile) {
    const platform = metadata(platformFile, recorded) as Manifest;
    if (platform.name !== codexPackage && platform.name !== codexPlatform) throw invalid();
    if (platform.version !== manifest.version && platform.version !== `${manifest.version}-linux-x64`) throw invalid();
  }
  const vendor = path.join(platformFile ? path.dirname(platformFile) : root, "vendor", codexTarget);
  const descriptor = path.join(vendor, "codex-package.json");
  let image: string | undefined;
  if (existsSync(descriptor)) {
    const layout = metadata(descriptor, recorded) as { layoutVersion?: number; target?: string; version?: string; entrypoint?: string; resourcesDir?: string; pathDir?: string };
    if (layout.layoutVersion !== 1 || layout.target !== codexTarget || layout.version !== manifest.version || layout.entrypoint !== "bin/codex" || layout.resourcesDir !== "codex-resources" || layout.pathDir !== "codex-path") {
      throw invalid();
    }
    image = path.join(vendor, layout.entrypoint);
  } else {
    image = ["bin/codex", "codex/codex", "codex"].map((relative) => path.join(vendor, relative)).find((candidate) => existsSync(candidate) && statSync(candidate).isFile());
  }
  if (!image) throw invalid();
  let common = root;
  while (!within(common, image) && common !== path.dirname(common)) common = path.dirname(common);
  if (!within(common, image)) throw invalid();
  return {
    image,
    files: [file, entry, ...(platformFile ? [platformFile] : []), ...declaredFiles(vendor).filter((candidate) => candidate !== image)],
    installation: { kind: "codex-npm", root: common, packageRoot: root } satisfies LinuxInstallation,
  };
}

type LinuxProgram = Pick<NativeLaunchPlan, "image" | "entry" | "files" | "argv" | "linuxInstallation" | "returnShell">;

export async function linuxInteractiveProgram(helper: PinnedImage, provider: string, cwd: string, resolvedArgv: string[] | undefined, env: Record<string, string>): Promise<LinuxProgram> {
  try {
    const shell = env.SHELL || "/bin/sh";
    const shellPath = () => (path.isAbsolute(shell) ? shell : (pathProgram(shell, cwd, env) ?? ""));
    const [command = "", ...args] = resolvedArgv ?? [shellPath(), "-l"];
    const aliases = new Map<string, string>();
    const target = boundPath(command, aliases);
    let imagePath = target;
    let entryPath: string | undefined;
    let files: string[] = [];
    let installation: LinuxInstallation | undefined;
    const recorded: Metadata = new Map();
    const volta = voltaHome(command, target);
    if (volta && provider !== "codex" && provider !== "pi") throw invalid();
    if (volta && path.basename(command) !== provider) throw invalid();
    const entry = volta ? await voltaWhich(volta, provider as "codex" | "pi", cwd, env, aliases) : target;
    if (provider === "pi" && script.test(entry)) {
      const pkg = packageFor(entry, piPackages, "pi", recorded);
      const paired = volta && globalVoltaRecord(volta, "pi", pkg, recorded);
      imagePath = paired ? boundPath(paired, aliases) : volta ? await voltaWhich(volta, "node", cwd, env, aliases) : await nodeFor(entry, cwd, env, aliases);
      entryPath = entry;
      const bundle = path.join(pkg.root, "dist/bundle");
      const dist = within(bundle, entry) ? bundle : path.join(pkg.root, "dist");
      const theme = path.join(pkg.root, "dist/modes/interactive/theme");
      const exportTemplate = path.join(pkg.root, "dist/core/export-html");
      files = [pkg.file, ...declaredFiles(dist, (file) => /\.(?:js|mjs|cjs|json|wasm|node)$/i.test(file)), ...declaredFiles(theme), ...declaredFiles(exportTemplate)];
      installation = { kind: "pi-node", root: pkg.root, ...modulesOf(pkg.root) };
    } else if (provider === "codex" && script.test(entry)) {
      const pkg = packageFor(entry, [codexPackage], "codex", recorded);
      if (volta) globalVoltaRecord(volta, "codex", pkg, recorded);
      const layout = codexLayout(entry, pkg, recorded);
      ({ image: imagePath, files, installation } = layout);
    } else if (volta) {
      throw invalid();
    } else if (provider === "claude") {
      installation = { kind: "claude-native", root: path.dirname(target) };
    } else if (provider !== "shell" && /^(?:node(?:js)?|volta-shim|mise)$/.test(path.basename(target))) {
      throw invalid();
    }
    const declared = [...new Set(files)].filter((file) => file !== entryPath).sort();
    if (declared.length + Number(!!entryPath) > 128) throw invalid();
    const image = await linuxProgramIdentity(helper, await pinNativeImage(imagePath));
    const pinnedEntry = entryPath ? await pinNativeImage(entryPath) : undefined;
    const pinned: PinnedImage[] = [];
    for (const file of declared) {
      const verified = await pinNativeImage(file);
      if (verified.path !== file || (recorded.has(file) && recorded.get(file) !== verified.sha256)) throw invalid();
      pinned.push(verified);
    }
    if (installation) {
      const records: PinnedImage[] = [];
      const copied = new Set(declared);
      for (const [file, digest] of recorded) {
        if (copied.has(file)) continue;
        const verified = await pinNativeImage(file);
        if (verified.path !== file || verified.sha256 !== digest) throw invalid();
        records.push(verified);
      }
      if (aliases.size) installation.aliases = [...aliases].map(([file, target]) => ({ path: file, target }));
      if (records.length) installation.records = records;
    }
    const returnSource = provider === "shell" ? undefined : shellPath();
    const returnImage = returnSource === undefined ? undefined : await linuxProgramIdentity(helper, await pinNativeImage(returnSource));
    return {
      image,
      ...(pinnedEntry && { entry: pinnedEntry }),
      files: pinned,
      argv: [image.path, ...(pinnedEntry ? [pinnedEntry.path] : []), ...args],
      ...(installation && { linuxInstallation: installation }),
      ...(returnImage && { returnShell: { image: returnImage, argv: [returnSource ?? returnImage.path, "-i"], ...(returnSource && returnSource !== returnImage.path && { source: returnSource }) } }),
    };
  } catch {
    throw invalid();
  }
}
