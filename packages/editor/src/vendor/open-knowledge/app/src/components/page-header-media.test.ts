import { expect, test } from "vitest";
import { resolvePageCover, resolvePageIcon } from "./page-header-utils";

test.each([
  ["目录/封面 图.png", "/%E7%9B%AE%E5%BD%95/%E5%B0%81%E9%9D%A2%20%E5%9B%BE.png"],
  ["/img/a.png", "/img/a.png"],
])("H04 page icon and cover both use the vault media URL for %s", (path, href) => {
  expect(resolvePageIcon(path)).toEqual({ kind: "path", value: href });
  expect(resolvePageCover(path)).toEqual({ kind: "path", value: href });
});

test.each(["../private.png", "//other.example/img.png", "img//empty.png"])("H04 rejects an invalid local image path %s", (path) => {
  expect(resolvePageIcon(path).kind).toBe("unsupported");
  expect(resolvePageCover(path).kind).toBe("unsupported");
});
