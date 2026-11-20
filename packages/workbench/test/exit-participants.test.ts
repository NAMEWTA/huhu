import { expect, test, vi } from "vitest";
import { checkExitParticipants, registerExitParticipant, type ExitRequest } from "../src/state/exit-participants.js";

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
