import net from "node:net";
import type { ServerChannel } from "ssh2";

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
