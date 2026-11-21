import path from "node:path";
import { pathToFileURL } from "node:url";

const actualConfig = pathToFileURL(path.join(process.cwd(), "electron.vite.config.ts")).href;
export default (await import(actualConfig)).default;
