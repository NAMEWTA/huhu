import { defineProject } from "vitest/config";

export default defineProject({
  test: { name: "perf", include: [] },
  benchmark: { include: ["*.bench.ts"] },
});
