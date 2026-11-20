import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import postcss from "postcss";
import okScopePlugin from "../packages/editor/build/ok-scope-plugin.mjs";

function check(css, filename = "ok.css", sources) {
  const assets = mkdtempSync(join(tmpdir(), "huhu-ok-css-"));
  try {
    let script = join(import.meta.dirname, "check-ok-class-collisions.mjs");
    if (sources) {
      for (const dir of ["packages", "plugins", "apps", "scripts"]) mkdirSync(join(assets, dir));
      for (const [file, content] of Object.entries(sources)) writeFileSync(join(assets, file), content);
      const original = script;
      script = join(assets, "scripts/check-ok-class-collisions.mjs");
      copyFileSync(original, script);
      symlinkSync(join(import.meta.dirname, "../node_modules"), join(assets, "node_modules"), "junction");
    }
    writeFileSync(join(assets, "main.css"), "@layer vendor.ok-rules { .ok-root { color: inherit } }");
    writeFileSync(join(assets, filename), css);
    const result = spawnSync(process.execPath, [script, "--desktop", assets], { encoding: "utf8" });
    assert.ifError(result.error);
    return { status: result.status, output: result.stdout + result.stderr };
  } finally {
    rmSync(assets, { recursive: true, force: true });
  }
}

for (const selector of [":where(:root)", ".ok-root + .host", ":is(html, .ok-root)", ".host:not(.ok-root)", ".host:has(.ok-root)", ".host, .ok-root", ".ok-root .leaf + .host, .ok-root ~ .host", ".host"]) {
  test(`rejects an OK selector outside its root: ${selector}`, () => {
    const { status, output } = check(`@layer vendor.ok-utilities { ${selector} { --sample: red } }`, "unrelated-name.css");
    assert.equal(status, 1, output);
    assert.match(output, /C .*1/);
  });
}

test("checks OK fallback property declarations even without a scope marker", () => {
  const { status, output } = check("@layer properties.huhu-ok { .host { --tw-scale-x: 1 } }");
  assert.equal(status, 1, output);
});

test("rejects nested selectors that can leave the root", () => {
  const { status, output } = check("@layer vendor.ok-utilities { .ok-root { @media (hover: hover) { & + .host { color: red } } } }");
  assert.equal(status, 1, output);
});

for (const declaration of ["color: red", "--custom: red", "--tw-unregistered: 0", "--tw-translate-x: 1px", "--tw-translate-x: 0 !important"]) {
  test(`rejects a backdrop declaration outside the defaults: ${declaration}`, () => {
    const { status, output } = check(`@layer properties.huhu-ok { .ok-root *, ::backdrop { --tw-translate-x: 0; ${declaration} } }`);
    assert.equal(status, 1, output);
  });
}

test("allows known backdrop defaults and selectors that stay within the root", () => {
  const { status, output } = check(`
    @layer properties.huhu-ok { .ok-root *, ::backdrop { --tw-translate-x: 0 } }
    @layer vendor.ok-rules {
      :where(.ok-root, .ok-root *) .leaf, .leaf:is(.ok-root, .ok-root > *) { color: inherit }
      .ok-root > .leaf + .sibling, .cross + .ok-root, [class~="ok-root"] { color: inherit }
    }
  `);
  assert.equal(status, 0, output);
});

test("rejects scoped A/B intersections", () => {
  const { status, output } = check("@layer vendor.ok-rules { .ok-root .hu-page-head, .ok-root .ok-editor-error { color: inherit } }");
  assert.equal(status, 1, output);
  assert.match(output, /待决 A.*hu-page-head/);
  assert.match(output, /待决 B.*ok-editor-error/);
});

test("a host UI rule excluding the OK boundary does not collide with it", () => {
  const built = "@layer vendor.ok-rules { .ok-root { color: inherit } }";
  const excluded = check(built, "ok.css", {
    "packages/component.css": '@layer components { h1:where(:not([class~="ok-root"] *)) { color: inherit } }',
  });
  assert.equal(excluded.status, 0, excluded.output);
  const styled = check(built, "ok.css", {
    "packages/component.css": '@layer components { [class~="ok-root"] h1 { color: inherit } }',
  });
  assert.equal(styled.status, 1, styled.output);
  assert.match(styled.output, /待决 A.*ok-root/);
});

test("OK host mappings are also checked for scope violations", () => {
  const inside = check("@layer vendor.ok-host { .ok-root .mapping-target { --background: red } }");
  assert.equal(inside.status, 0, inside.output);
  const outside = check("@layer vendor.ok-host { .hu-page-head { --background: red } }");
  assert.equal(outside.status, 1, outside.output);
  assert.match(outside.output, /C 1/);
});

test("checks UI layers, all host CSS rules and class tokens in TSX and HTML", () => {
  const { status, output } = check(
    "@layer vendor.ok-utilities { .ok-root :is(.host-component, .host-shell, .host-module, .host-huhu-ok, .host-nested, .token-only, .vendor-only, .gap-1\\.5, .html-only, .jsx-only, .attribute-text) { color: inherit } }",
    "ok.css",
    {
      "packages/entry.css": '@import "./component.css" layer(components);',
      "packages/component.css": '[class~="host-component"] { color: inherit }',
      "packages/layers.css": `
        @layer shell { .host-shell { color: inherit } }
        @layer modules { @media (hover: hover) { .host-module { color: inherit } } }
        @layer modules.huhu-ok { .host-huhu-ok { color: inherit } }
        @layer modules { @layer nested { .host-nested { color: inherit } } }
        @layer tokens { .token-only { color: inherit } }
        @layer vendor { @layer components { .vendor-only { color: inherit } } }
      `,
      "packages/view.tsx": 'const view = <div className={clsx("token-only vendor-only", enabled && "gap-1.5")}><custom-element class="jsx-only" /></div>;',
      "packages/view.html": '<div title="ignored class=attribute-text" class=html-only></div>',
    },
  );
  assert.equal(status, 1, output);
  assert.match(output, /A 5：host-component host-huhu-ok host-module host-nested host-shell/);
  assert.match(output, /B 3：gap-1\.5 html-only jsx-only/);
});

test("emits a backdrop selector that also matches a dialog which is itself an OK root", async () => {
  const result = await postcss([okScopePlugin()]).process("@layer properties { .other, ::backdrop { --tw-translate-x: 0 } }", { from: "ok-globals.css" });
  assert.match(result.css, /, :where\(\.ok-root, \.ok-root \*\)::backdrop/);
});

test("ignores host CSS even in a chunk named rich", () => {
  const { status, output } = check("@layer modules { :root { --host: red } .hu-page-head { color: red } }", "rich-decoy.css");
  assert.equal(status, 0, output);
});

test("keeps OK base and component rules within vendor sublayers", async () => {
  const result = await postcss([okScopePlugin()]).process("@layer base { input { color: inherit } } @layer components { .widget { color: inherit } }", { from: "ok-globals.css" });
  assert.deepEqual(
    result.root.nodes.map((node) => node.params),
    ["vendor.ok-base", "vendor.ok-components", "vendor.ok-rules"],
  );
  assert.match(result.css, /input:where\(\.ok-root, \.ok-root \*\)/);
});
