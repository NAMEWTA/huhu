import { randomUUID } from "node:crypto";
import { errors, PeriodicEnabledWindowSchema, type PeriodicEnabledWindow } from "@huhu/contracts";
import type { VaultFiles } from "@huhu/vault";
import { z } from "zod";

const file = "automations/schedule-gate.json";
export const ScheduleGateView = z.strictObject({
  paused: z.boolean(),
  revision: z.string(),
  changedAt: z.iso.datetime().nullable(),
  writable: z.boolean(),
});
const Store = ScheduleGateView.omit({ writable: true }).extend({ pauses: z.array(PeriodicEnabledWindowSchema) });
type Store = z.infer<typeof Store>;

/** A durable barrier for automatic admissions. Manual operations and receipt reconciliation have their own lifetimes. */
export class ScheduleGate {
  private state: Store;
  private version: string | null;

  constructor(
    private readonly files: VaultFiles,
    private readonly now: () => Date,
  ) {
    const stored = files.read(file);
    this.state = stored
      ? Store.parse(JSON.parse(stored.bytes.toString("utf8")))
      : {
          paused: false,
          revision: "initial",
          changedAt: null,
          pauses: [],
        };
    this.version = stored?.version ?? null;
  }

  view() {
    const { paused, revision, changedAt } = this.state;
    return { paused, revision, changedAt, writable: !this.files.readOnly };
  }

  allows = (slot: string): boolean => !this.state.paused && (!this.state.changedAt || slot > this.state.changedAt);

  calendarWindows(windows: readonly PeriodicEnabledWindow[]): PeriodicEnabledWindow[] {
    return windows.flatMap(({ from, until }) => {
      const result: PeriodicEnabledWindow[] = [];
      let start = from;
      for (const pause of this.state.pauses) {
        if (pause.until && pause.until <= start) continue;
        if (until && pause.from >= until) break;
        if (start < pause.from) result.push({ from: start, until: pause.from });
        if (!pause.until || (until && pause.until >= until)) return result;
        start = pause.until;
      }
      result.push({ from: start, until });
      return result;
    });
  }

  /** Called under the same configuration queue used for schedule admission. */
  async set(paused: boolean, revision: string, signal: AbortSignal) {
    signal.throwIfAborted();
    this.files.assertWritable();
    if (revision !== this.state.revision) throw errors.versionConflict(this.state.revision);
    if (paused === this.state.paused) return this.view();
    const changedAt = this.now().toISOString();
    const pauses = [...this.state.pauses];
    if (paused) pauses.push({ from: changedAt, until: null });
    else pauses[pauses.length - 1] = { ...pauses[pauses.length - 1]!, until: changedAt };
    const next = { paused, revision: randomUUID(), changedAt, pauses };
    const { version } = await this.files.write(file, Buffer.from(JSON.stringify(next) + "\n"), {
      expectedVersion: this.version,
      beforeCommit: () => signal.throwIfAborted(),
    });
    this.state = next;
    this.version = version;
    return this.view();
  }
}
