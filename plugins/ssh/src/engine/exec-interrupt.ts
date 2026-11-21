import type { ClientChannel } from "ssh2";

export function interruptExecChannel(channel: ClientChannel): void {
  try {
    channel.signal("INT");
  } catch {
    // Server support is optional; report an exit only when one is received.
  }
}
