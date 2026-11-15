import type { Plugin } from "postcss";

declare function okScopePlugin(): Plugin & { postcss: true };
export default okScopePlugin;
