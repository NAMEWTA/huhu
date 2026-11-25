import { createHash } from "node:crypto";
import { lstatSync, mkdirSync, readFileSync } from "node:fs";
import { request } from "node:http";
import path from "node:path";
import { z } from "zod";
import { endpointRootBinding } from "./identity.js";
import { HUHU_DIR, machineId, VaultJsonSchema } from "./vault.js";

export const EngineModeSchema = z.enum(["temporary", "resident"]);
export type EngineMode = z.infer<typeof EngineModeSchema>;
const EngineStatusSchema = z.object({
  pid: z.int().positive(),
  port: z.int().min(1).max(65535),
  vaultId: z.string(),
  rootBinding: z.string(),
  startedAt: z.string(),
  mode: EngineModeSchema.default("temporary"),
  instance: z.uuid().optional(),
});
const EngineEndpointSchema = EngineStatusSchema.extend({ cliToken: z.string().min(1) });
export type EngineEndpointRecord = z.infer<typeof EngineEndpointSchema>;
export type EngineStatus = z.infer<typeof EngineStatusSchema>;

export function engineEndpointPath(root: string): string {
  return path.join(root, HUHU_DIR, "runtime", machineId(), "engine.json");
}

export function readEngineEndpoint(root: string, file = engineEndpointPath(root)):
  | { state: "stopped" }
  | { state: "conflict"; message: string }
  | { state: "running"; endpoint: EngineEndpointRecord } {
  let raw: string;
  try {
    raw = readFileSync(file, "utf8");
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "ENOENT" ? { state: "stopped" } : { state: "conflict", message: "无法读取本机 Engine 发现记录" };
  }
  try {
    const endpoint = EngineEndpointSchema.parse(JSON.parse(raw));
    const vault = VaultJsonSchema.parse(JSON.parse(readFileSync(path.join(root, HUHU_DIR, "vault.json"), "utf8")));
    if (endpoint.rootBinding !== endpointRootBinding(root) || endpoint.vaultId !== vault.id) return { state: "conflict", message: "本机 Engine 发现记录不属于所选 Vault" };
    process.kill(endpoint.pid, 0);
    return { state: "running", endpoint };
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "ESRCH" ? { state: "stopped" } : { state: "conflict", message: "无法确认本机 Engine 发现记录的身份" };
  }
}

/** Engine Main and local owners exchange host credentials only via a private Unix socket. */
export function engineControlSocket(rootBinding: string, create = false): string {
  const uid = process.getuid?.();
  if (uid === undefined) throw new Error("此平台不支持本机 Engine 管理套接字");
  const dir = path.join("/tmp", `huhu-engine-${uid}`);
  if (create) {
    try {
      mkdirSync(dir, { mode: 0o700 });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
  }
  const actual = lstatSync(dir);
  if (!actual.isDirectory() || actual.uid !== uid || (actual.mode & 0o077) !== 0) throw new Error("本机 Engine 管理目录不可信");
  const name = createHash("sha256").update(rootBinding).digest("hex").slice(0, 40);
  return path.join(dir, `${name}.sock`);
}

export async function probeEngine(endpoint: EngineEndpointRecord, action: "status" | "attach" | "stop" = "status"): Promise<{ status: EngineStatus; rendererToken?: string }> {
  if (!endpoint.instance) throw new Error("此 Engine 没有本机管理入口，请从启动它的宿主退出");
  const socketPath = engineControlSocket(endpoint.rootBinding);
  const data = await new Promise<unknown>((resolve, reject) => {
    const req = request({ socketPath, path: `/${action}`, method: action === "stop" ? "POST" : "GET", headers: { authorization: `Bearer ${endpoint.cliToken}` }, signal: AbortSignal.timeout(2_000) }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("error", reject);
      res.on("data", (chunk: string) => {
        body += chunk;
        if (body.length > 8192) req.destroy(new Error("Engine 管理响应过大"));
      });
      res.once("end", () => {
        try {
          if (res.statusCode !== 200) throw new Error("Engine 拒绝本机管理请求");
          resolve(JSON.parse(body));
        } catch (error) {
          reject(error);
        }
      });
    });
    req.once("error", reject);
    req.end();
  });
  const result = z.object({ status: EngineStatusSchema, rendererToken: z.string().optional() }).parse(data);
  const { pid, port, vaultId, rootBinding, instance, mode } = result.status;
  if (pid !== endpoint.pid || port !== endpoint.port || vaultId !== endpoint.vaultId || rootBinding !== endpoint.rootBinding || instance !== endpoint.instance || mode !== endpoint.mode) {
    throw new Error("Engine 管理响应与本机发现记录的身份不符");
  }
  return result;
}
