import { spawn } from "node:child_process";
import net from "node:net";
import type { ServerChannel } from "ssh2";

export function localPosixCommand(channel: ServerChannel, command?: string) {
  const process = spawn("/bin/sh", command === undefined ? [] : ["-c", command], { env: { PATH: "/usr/bin:/bin", LANG: "C.UTF-8" } });
  channel.pipe(process.stdin);
  process.stdout.pipe(channel, { end: false });
  process.stderr.resume();
  process.stdin.on("error", () => channel.end());
  process.once("error", () => channel.destroy());
  process.once("close", (code) => {
    channel.exit(code ?? 1);
    channel.end();
  });
  channel.once("close", () => process.kill());
}

export const localPosixRelayShell = (channel: ServerChannel) => localPosixCommand(channel);

export function relayToLoopback(port: number) {
  return (channel: ServerChannel) => {
    channel.write("fixture shell startup\n");
    channel.once("data", (input: Buffer) => {
      const match = /HUHU_RELAY_ ([a-f0-9]{32}) && exec nc '127\.0\.0\.1' (\d+); exit\n$/u.exec(input.toString());
      if (!match || Number(match[2]) !== port) {
        channel.end();
        return;
      }
      const upstream = net.connect(port, "127.0.0.1");
      upstream.once("error", () => channel.destroy());
      channel.once("close", () => upstream.destroy());
      upstream.once("data", (banner) => {
        channel.write("HUHU_REL");
        channel.write(Buffer.concat([Buffer.from(`AY_${match[1]}\n`), banner]));
        upstream.pipe(channel).pipe(upstream);
      });
    });
  };
}
