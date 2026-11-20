import path from "node:path";
import { serveStatic } from "@hono/node-server/serve-static";
import { getRequestListener } from "@hono/node-server";
import { Hono } from "hono";

/** `root` 指向随包交付的 Renderer 构建目录。其中只有公开构建资源。 */
export function webAssets(root: string) {
  if (!path.isAbsolute(root)) throw new Error("Web 资源目录必须是绝对路径");

  const app = new Hono();
  app.use("*", async (c, next) => {
    c.header("X-Content-Type-Options", "nosniff");
    c.header("X-Frame-Options", "DENY");
    c.header("Referrer-Policy", "no-referrer");
    await next();
  });

  const asset = serveStatic({ root });
  const missingAsset = (c: Parameters<typeof asset>[0]) => c.text("Web 资源不存在", 404);
  for (const directory of ["assets", "cmaps", "standard_fonts", "wasm"]) {
    app.on(["GET", "HEAD"], `/${directory}/*`, asset, missingAsset);
  }

  const index = serveStatic({ root, path: "index.html" });
  app.on(
    ["GET", "HEAD"],
    ["/", "/index.html", "/notes", "/notes/*", "/tasks", "/tasks/*"],
    async (c, next) => {
      c.header("Cache-Control", "no-store");
      return index(c, next);
    },
    (c) => c.text("Web 工作台构建资源不可用", 503),
  );

  return getRequestListener(app.fetch);
}
