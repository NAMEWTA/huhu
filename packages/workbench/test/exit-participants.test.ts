import { expect, test, vi } from "vitest";
import { checkExitParticipants, registerExitParticipant, type ExitRequest } from "../src/state/exit-participants.js";
import { registerFlusher, runFlushers } from "../src/state/flushers.js";

test("退出结算失败时保留已写入的文档和草稿计数", async () => {
  const failure = new Error("fixture save failed");
  const release = [
    registerFlusher(async () => "file"),
    registerFlusher(async () => "draft"),
    registerFlusher(async () => {
      throw failure;
    }),
  ];
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    await expect(runFlushers()).resolves.toEqual({ files: 1, drafts: 1, failed: true });
    expect(log).toHaveBeenCalledWith(expect.objectContaining({ errors: [failure] }));
  } finally {
    for (const unregister of release) unregister();
    log.mockRestore();
  }
});

function request(signal = new AbortController().signal): ExitRequest {
  return { signal, waitForUser: (decision) => decision };
}

function pendingChoice() {
  let decide!: (leave: boolean) => void;
  const promise = new Promise<boolean>((resolve) => {
    decide = resolve;
  });
  return { promise, decide };
}

test("离场按登记顺序等待当前决定，继续编辑会停止其余检查", async () => {
  const choice = pendingChoice();
  const delayed = vi.fn((exit: ExitRequest) => exit.waitForUser(choice.promise));
  const next = vi.fn(() => true);
  const unregisterFirst = registerExitParticipant(delayed);
  const unregisterNext = registerExitParticipant(next);
  try {
    const pending = checkExitParticipants(request());
    expect(delayed).toHaveBeenCalledOnce();
    expect(next).not.toHaveBeenCalled();
    choice.decide(false);
    await expect(pending).resolves.toBe(false);
    expect(next).not.toHaveBeenCalled();

    unregisterFirst();
    await expect(checkExitParticipants(request())).resolves.toBe(true);
    expect(next).toHaveBeenCalledOnce();
  } finally {
    unregisterFirst();
    unregisterNext();
  }
});

test("取消后的迟到许可无法放行，业务失败也会传回宿主", async () => {
  const choice = pendingChoice();
  const unregister = registerExitParticipant(() => choice.promise);
  try {
    const controller = new AbortController();
    const pending = checkExitParticipants(request(controller.signal));
    controller.abort();
    choice.decide(true);
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  } finally {
    unregister();
  }
  const failure = new Error("保存布局失败");
  const unregisterFailure = registerExitParticipant(() => {
    throw failure;
  });
  try {
    await expect(checkExitParticipants(request())).rejects.toBe(failure);
  } finally {
    unregisterFailure();
  }
});

test("等待中登记的新参与者也可要求留在当前窗口", async () => {
  const choice = pendingChoice();
  const unregister = registerExitParticipant(() => choice.promise);
  const pending = checkExitParticipants(request());
  const added = vi.fn(() => false);
  const unregisterAdded = registerExitParticipant(added);
  try {
    choice.decide(true);
    await expect(pending).resolves.toBe(false);
    expect(added).toHaveBeenCalledOnce();
  } finally {
    unregister();
    unregisterAdded();
  }
});
