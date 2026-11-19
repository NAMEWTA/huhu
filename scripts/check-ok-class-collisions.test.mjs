import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

function check(css, filename = "ok.css") {
  const assets = mkdtempSync(join(tmpdir(), "huhu-ok-css-"));
  try {
    writeFileSync(join(assets, "main.css"), "@layer vendor.ok-rules { .ok-root { color: inherit } }");
    writeFileSync(join(assets, filename), css);
    const result = spawnSync(process.execPath, [join(import.meta.dirname, "check-ok-class-collisions.mjs"), "--desktop", assets], { encoding: "utf8" });
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

test("rejects unregistered scoped A/B intersections", () => {
  const { status, output } = check("@layer vendor.ok-rules { .ok-root .hu-page-head, .ok-root .ok-editor-error { color: inherit } }");
  assert.equal(status, 1, output);
  assert.match(output, /未登记 A.*hu-page-head/);
  assert.match(output, /未登记 B.*ok-editor-error/);
});

test("ignores host CSS even in a chunk named rich", () => {
  const { status, output } = check("@layer modules { :root { --host: red } .hu-page-head { color: red } }", "rich-decoy.css");
  assert.equal(status, 0, output);
});
