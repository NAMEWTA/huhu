import { expect, test, vi } from "vitest";
import { onMailSearchRequest, requestMailSearch } from "../src/ui/mail-search-command.js";

test("切换到邮件被拒绝后，后来打开邮件不会显示此前的搜索", async () => {
  await requestMailSearch(async () => false);
  const search = vi.fn();
  const off = onMailSearchRequest(search);
  expect(search).not.toHaveBeenCalled();
  off();
  await requestMailSearch(async () => true);
  const stop = onMailSearchRequest(search);
  try {
    expect(search).toHaveBeenCalledOnce();
  } finally {
    stop();
  }
});
