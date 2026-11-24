import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

const namespace = "virtual:huhu-homarr/";
const internal = "\0" + namespace;
const modules = new Set(["constants", "geometry", "reflow"]);

export function homarrSource(sourceDir) {
  return {
    name: "huhu-grid-homarr-source",
    resolveId(source, importer) {
      if (source.startsWith(namespace)) {
        const name = source.slice(namespace.length);
        if (modules.has(name)) return internal + name;
      }
      if (importer?.startsWith(internal) && source.startsWith("./")) {
        const name = source.slice(2);
        if (modules.has(name)) return internal + name;
      }
    },
    load(id) {
      const name = id.startsWith(internal) && id.slice(internal.length);
      if (!modules.has(name)) return;
      const fileName = join(sourceDir, name + ".ts");
      this.addWatchFile(fileName);
      // Compile the originals as isolated modules, independent of Homarr's Next.js workspace config.
      const result = ts.transpileModule(readFileSync(fileName, "utf8"), {
        fileName,
        compilerOptions: { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext },
      });
      return result.outputText;
    },
  };
}
