import { expect, test } from "vitest";
import { recordDirectoryMove, type DirectoryHistory } from "../src/ui/file-history.js";

test("file history revisits loaded paths and discards the forward branch after opening a new location", () => {
  const empty = { back: [], forward: [] };
  const first = recordDirectoryMove(empty, "/home/test", "open");
  const second = recordDirectoryMove(first, "/home/test/docs", "open");
  const back = recordDirectoryMove(second, "/home/test/pictures", "back");
  expect(back).toEqual({ back: ["/home/test"], forward: ["/home/test/pictures"] });
  expect(recordDirectoryMove(back, "/home/test/docs", "forward")).toEqual(second);
  expect(recordDirectoryMove(back, "/home/test/docs", "open")).toEqual({ back: ["/home/test", "/home/test/docs"], forward: [] });
});

test("a long browsing session retains at most 64 previous locations", () => {
  let history: DirectoryHistory<string[]> = { back: [], forward: [] };
  for (let step = 0; step < 100; step++) history = recordDirectoryMove(history, [String(step)], "open");
  expect(history.back).toHaveLength(64);
  expect(history.back.at(0)).toEqual(["36"]);
  expect(history.back.at(-1)).toEqual(["99"]);
});
