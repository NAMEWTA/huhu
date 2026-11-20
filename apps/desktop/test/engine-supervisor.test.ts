import { EventEmitter } from "node:events";
import { afterEach, expect, test, vi } from "vitest";
import { EngineSupervisor } from "../src/main/engine-supervisor.js";

const { fork } = vi.hoisted(() => ({ fork: vi.fn() }));
vi.mock("electron", () => ({ utilityProcess: { fork } }));

class Child extends EventEmitter {
  postMessage = vi.fn();
  kill = vi.fn();
}

afterEach(() => {
  fork.mockReset();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

async function stoppedAtDeadline() {
  vi.useFakeTimers();
  vi.stubEnv("HUHU_HERDR_BIN", "fixture-herdr");
  const child = new Child();
  fork.mockReturnValueOnce(child).mockReturnValueOnce(new Child());
  const engine = new EngineSupervisor("fixture-vault", {}, () => undefined, "fixture-engine.js");
  engine.start();
  const stopping = engine.stop(5);
  await vi.advanceTimersByTimeAsync(5);
  await stopping;
  expect(child.kill).toHaveBeenCalledOnce();
  expect(fork).toHaveBeenCalledOnce();
  return { engine, child };
}

test("退出取消后等旧子进程退出，再恢复原 Engine", async () => {
  const { engine, child } = await stoppedAtDeadline();
  engine.restartAfterStop();
  expect(fork).toHaveBeenCalledOnce();
  child.emit("exit");
  expect(fork).toHaveBeenCalledTimes(2);
  expect(engine.current).toBe("starting");
});

test("第二次确认退出撤销上次取消所请求的延迟恢复", async () => {
  const { engine, child } = await stoppedAtDeadline();
  engine.restartAfterStop();
  const quitting = engine.stop(50);
  child.emit("exit");
  await quitting;
  expect(child.postMessage).toHaveBeenCalledTimes(2);
  expect(fork).toHaveBeenCalledOnce();
  expect(engine.current).toBe("stopped");
});
