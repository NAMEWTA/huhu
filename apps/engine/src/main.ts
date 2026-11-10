import { boot } from "./boot.js";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

/** Engine 入口：`--vault <path> [--create] [--idle-exit-ms N]`。就绪后向父进程/标准输出报告端口与令牌。 */
async function main(): Promise<void> {
  const vaultPath = arg("--vault");
  if (!vaultPath) {
    console.error("缺少 --vault");
    process.exit(2);
  }
  const idle = Number(arg("--idle-exit-ms") ?? 0);
  const engine = await boot({
    vaultPath,
    create: process.argv.includes("--create"),
    readOnly: process.argv.includes("--read-only"),
    idleExitMs: idle,
  });
  // Renderer 令牌只经 IPC 通道交给 Main；独立运行（无 IPC）时不输出任何令牌
  if (process.send) process.send({ type: "ready", port: engine.port, rendererToken: engine.rendererToken, vaultId: engine.vault.id });
  else process.stdout.write(JSON.stringify({ type: "ready", port: engine.port, vaultId: engine.vault.id }) + "\n");

  const stop = async () => {
    const timer = setTimeout(() => process.exit(1), 15_000);
    await engine.shutdown();
    clearTimeout(timer);
    process.exit(0);
  };
  process.on("SIGTERM", () => void stop());
  process.on("SIGINT", () => void stop());
  process.on("message", (m) => {
    if ((m as { type?: string }).type === "shutdown") void stop();
  });

  if (idle > 0) {
    let last = Date.now();
    engine.events.subscribe(() => (last = Date.now()));
    const t = setInterval(() => {
      if (engine.server.activeConnections() === 0 && Date.now() - Math.max(last, engine.server.lastActivity()) > idle) {
        clearInterval(t);
        void stop();
      }
    }, Math.min(1000, idle));
  }
}

main().catch((e) => {
  const err = e as { code?: string; message?: string };
  process.stderr.write(JSON.stringify({ type: "error", code: err.code ?? "INTERNAL", message: err.message ?? String(e) }) + "\n");
  process.exit(1);
});
