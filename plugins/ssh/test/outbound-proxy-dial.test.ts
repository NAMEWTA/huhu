import { once } from "node:events";
import { createServer, type AddressInfo } from "node:net";
import { duplexPair, type Duplex } from "node:stream";
import { afterEach, describe, expect, test, vi, type TestContext } from "vitest";
import { dialOutboundProxy } from "../src/engine/outbound-proxy-dial.js";

const sockets = vi.hoisted(() => ({ create: undefined as (() => Duplex) | undefined }));

vi.mock("node:net", async (importOriginal) => {
  const net = await importOriginal<typeof import("node:net")>();
  return {
    ...net,
    Socket: function () {
      return sockets.create ? sockets.create() : new net.Socket();
    },
  };
});

afterEach(() => {
  sockets.create = undefined;
  vi.useRealTimers();
});

const credentials = { username: "proxy-fixture-user", password: "proxy-fixture-password" };
const target = { host: "First-Hop.Fixture.invalid", port: 2222 };
const banner = Buffer.from("SSH-2.0-proxy-fixture\r\n");
const followUp = Buffer.from([0, 255, 128]);
const accepted = Buffer.from([5, 0, 0, 1, 127, 0, 0, 1, 0, 22]);

type Mode = "memory" | "loopback";
type Protocol = Parameters<typeof dialOutboundProxy>[0]["protocol"];
type Proxy = Parameters<typeof dialOutboundProxy>[0];

function inMemorySocket(onConnect: (peer: Duplex, local: Duplex) => void) {
  const [local, peer] = duplexPair();
  local.once("close", () => peer.destroy());
  peer.once("close", () => local.destroy());
  return Object.assign(local, {
    connecting: false,
    connect() {
      this.connecting = true;
      queueMicrotask(() => {
        if (local.destroyed) return;
        this.connecting = false;
        onConnect(peer, local);
        if (!local.destroyed) local.emit("connect");
      });
      return this;
    },
    setTimeout() {
      return this;
    },
  });
}

async function fixture(context: TestContext, mode: Mode, protocol: Protocol) {
  const peers = new Set<Duplex>();
  let connected!: (peer: Duplex) => void;
  const connection = new Promise<Duplex>((resolve) => {
    connected = resolve;
  });
  function accept(peer: Duplex) {
    peer.on("error", () => {});
    peers.add(peer);
    peer.once("close", () => peers.delete(peer));
    connected(peer);
  }
  const proxy: Proxy = { protocol, host: "127.0.0.1", port: 3128 };
  if (mode === "memory") {
    sockets.create = () => {
      const local = inMemorySocket(accept);
      context.onTestFinished(() => {
        local.destroy();
        for (const peer of peers) peer.destroy();
      });
      return local;
    };
  } else {
    const server = createServer(accept);
    const listening = once(server, "listening");
    server.listen(0, proxy.host);
    try {
      await listening;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "EPERM" || code === "EACCES") context.skip(`Loopback listen failed with ${code}`);
      throw error;
    }
    proxy.port = (server.address() as AddressInfo).port;
    context.onTestFinished(() => {
      for (const peer of peers) peer.destroy();
      return new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    });
  }
  return { proxy, peer: connection };
}

function readBytes(stream: Duplex, length: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    function cleanup() {
      stream.off("readable", read);
      stream.off("close", closed);
      stream.off("end", closed);
    }
    function closed() {
      cleanup();
      reject(new Error("Fixture stream closed before the expected bytes"));
    }
    function read() {
      const bytes = stream.read(length) as Buffer | null;
      if (bytes === null) return;
      cleanup();
      resolve(bytes);
    }
    stream.on("readable", read);
    stream.once("close", closed);
    stream.once("end", closed);
    read();
  });
}

async function readHttpRequest(peer: Duplex) {
  let request = "";
  while (!request.endsWith("\r\n\r\n")) {
    request += (await readBytes(peer, 1)).toString("ascii");
  }
  return request;
}

async function socksRequest(peer: Duplex, auth: boolean) {
  expect(await readBytes(peer, auth ? 4 : 3)).toEqual(Buffer.from(auth ? [5, 2, 0, 2] : [5, 1, 0]));
  peer.write(Buffer.from([5, auth ? 2 : 0]));
  if (auth) {
    expect(await readBytes(peer, 2)).toEqual(Buffer.from([1, credentials.username.length]));
    expect((await readBytes(peer, credentials.username.length)).toString()).toBe(credentials.username);
    expect(await readBytes(peer, 1)).toEqual(Buffer.from([credentials.password.length]));
    expect((await readBytes(peer, credentials.password.length)).toString()).toBe(credentials.password);
    peer.write(Buffer.from([1, 0]));
  }
  const prefix = await readBytes(peer, 4);
  expect(prefix.subarray(0, 3)).toEqual(Buffer.from([5, 1, 0]));
  const type = prefix[3];
  const length = type === 3 ? (await readBytes(peer, 1)).readUInt8() : type === 1 ? 4 : 16;
  const address = await readBytes(peer, length);
  const port = (await readBytes(peer, 2)).readUInt16BE();
  return { type, address, port };
}

function expectFailure(dial: Promise<Duplex>, reason: string, secret?: string) {
  return expect(
    dial.catch((error) => {
      const serialized = JSON.stringify(error);
      expect(serialized).not.toContain(credentials.password);
      expect(serialized).not.toContain(credentials.username);
      if (secret) expect(serialized).not.toContain(secret);
      throw error;
    }),
  ).rejects.toMatchObject({
    code: reason === "timeout" ? "SSH_TIMEOUT" : "SSH_DISCONNECTED",
    details: { stage: "proxy", reason },
  });
}

function whenClosed(peer: Duplex) {
  const closed = new Promise<void>((resolve) => peer.once("close", resolve));
  peer.resume();
  return closed;
}

async function expectTunnel(dial: Promise<Duplex>, peer: Duplex, delayRead: boolean) {
  const tunnel = await dial;
  try {
    // Exercise both ssh2-style immediate resume and a consumer that arrives later.
    if (delayRead) await new Promise<void>((resolve) => setImmediate(resolve));
    const expected = Buffer.concat([banner, followUp]);
    const received = await new Promise<Buffer>((resolve) => {
      const chunks: Buffer[] = [];
      let length = 0;
      function receive(chunk: Buffer) {
        chunks.push(chunk);
        length += chunk.length;
        if (length >= expected.length) {
          tunnel.off("data", receive);
          resolve(Buffer.concat(chunks));
        }
      }
      tunnel.on("data", receive);
      tunnel.resume();
    });
    expect(received).toEqual(expected);
    tunnel.write("client-through-tunnel");
    expect((await readBytes(peer, 21)).toString()).toBe("client-through-tunnel");
  } finally {
    const peerClosed = whenClosed(peer);
    tunnel.destroy();
    await peerClosed;
  }
}

describe.each(["memory", "loopback"] as const)("%s proxy fixture", (mode) => {
  for (const { host, authority, auth } of [
    { host: target.host, authority: `${target.host}:2222`, auth: false },
    { host: "192.0.2.17", authority: "192.0.2.17:2222", auth: false },
    { host: "[2001:db8::a]", authority: "[2001:db8::a]:2222", auth: true },
  ]) {
    test(`preserves HTTP CONNECT authority and bytes for ${host}`, async (context) => {
      const { proxy, peer } = await fixture(context, mode, "http-connect");
      const dial = dialOutboundProxy(auth ? { ...proxy, credentials } : proxy, { ...target, host }, context.signal);
      const server = await peer;
      const request = await readHttpRequest(server);
      expect(request.split("\r\n")[0]).toBe(`CONNECT ${authority} HTTP/1.1`);
      expect(
        request
          .split("\r\n")
          .find((line) => line.toLowerCase().startsWith("host:"))
          ?.slice(6),
      ).toBe(authority);
      if (auth) {
        const value = Buffer.from(`${credentials.username}:${credentials.password}`).toString("base64");
        expect(request).toContain(`proxy-authorization: Basic ${value}\r\n`);
      } else {
        expect(request.toLowerCase()).not.toContain("proxy-authorization");
      }
      server.write(Buffer.concat([Buffer.from("HTTP/1.1 200 Connection established\r\n\r\n"), banner]));
      server.write(followUp);
      await expectTunnel(dial, server, !auth);
    });
  }

  for (const { host, type, address, auth } of [
    { host: target.host, type: 3, address: Buffer.from(target.host), auth: false },
    { host: "192.0.2.17", type: 1, address: Buffer.from([192, 0, 2, 17]), auth: false },
    { host: "2001:db8::a", type: 4, address: Buffer.from("20010db800000000000000000000000a", "hex"), auth: true },
  ]) {
    test(`preserves SOCKS5 target and bytes for ${host}`, async (context) => {
      const { proxy, peer } = await fixture(context, mode, "socks5");
      const dial = dialOutboundProxy(auth ? { ...proxy, credentials } : proxy, { ...target, host }, context.signal);
      const server = await peer;
      expect(await socksRequest(server, auth)).toEqual({ type, address, port: target.port });
      server.write(accepted.subarray(0, 4));
      server.write(Buffer.concat([accepted.subarray(4), banner]));
      server.write(followUp);
      await expectTunnel(dial, server, !auth);
    });
  }

  for (const status of [403, 407]) {
    test(`rejects HTTP ${status} without retaining the proxy response`, async (context) => {
      const { proxy, peer } = await fixture(context, mode, "http-connect");
      const dial = dialOutboundProxy({ ...proxy, credentials }, target, context.signal);
      const result = expectFailure(dial, status === 407 ? "authentication-failed" : "refused", "private-reply-marker");
      const server = await peer;
      await readHttpRequest(server);
      const closed = whenClosed(server);
      server.write(`HTTP/1.1 ${status} private-reply-marker\r\n\r\nprivate-reply-marker`);
      await result;
      await closed;
    });
  }

  test("rejects overlong HTTP response headers", async (context) => {
    const { proxy, peer } = await fixture(context, mode, "http-connect");
    const result = expectFailure(dialOutboundProxy(proxy, target, context.signal), "response-too-large");
    const server = await peer;
    await readHttpRequest(server);
    const closed = whenClosed(server);
    server.write(`HTTP/1.1 200 OK\r\nX-Large: ${"x".repeat(17 * 1024)}\r\n\r\n`);
    await result;
    await closed;
  });

  test("reports SOCKS5 authentication rejection and closes the socket", async (context) => {
    const { proxy, peer } = await fixture(context, mode, "socks5");
    const result = expectFailure(dialOutboundProxy({ ...proxy, credentials }, target, context.signal), "authentication-failed");
    const server = await peer;
    await readBytes(server, 4);
    server.write(Buffer.from([5, 2]));
    await readBytes(server, 3 + credentials.username.length + credentials.password.length);
    const closed = whenClosed(server);
    server.write(Buffer.from([1, 1]));
    await result;
    await closed;
  });

  test("reports SOCKS5 destination refusal and closes the socket", async (context) => {
    const { proxy, peer } = await fixture(context, mode, "socks5");
    const result = expectFailure(dialOutboundProxy(proxy, target, context.signal), "refused");
    const server = await peer;
    await socksRequest(server, false);
    const closed = whenClosed(server);
    server.write(Buffer.from([5, 5, 0, 1, 0, 0, 0, 0, 0, 0]));
    await result;
    await closed;
  });

  for (const protocol of ["socks5", "http-connect"] as const) {
    for (const reason of ["cancelled", "timeout"] as const) {
      test(`${protocol} closes a pending connection on ${reason}`, async (context) => {
        const { proxy, peer } = await fixture(context, mode, protocol);
        if (reason === "timeout") vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
        const controller = new AbortController();
        const dial = dialOutboundProxy(proxy, target, AbortSignal.any([context.signal, controller.signal]));
        const result = expectFailure(dial, reason, "private-abort-marker");
        const server = await peer;
        if (protocol === "socks5") await socksRequest(server, false);
        else await readHttpRequest(server);
        const closed = whenClosed(server);
        if (reason === "timeout") {
          await vi.advanceTimersByTimeAsync(20_000);
        } else {
          controller.abort(new Error("private-abort-marker"));
          server.write(protocol === "socks5" ? accepted : "HTTP/1.1 200 OK\r\n\r\n");
        }
        await result;
        await closed;
      });
    }

    test(`${protocol} reports a failed proxy TCP connection`, async (context) => {
      const { proxy } = await fixture(context, mode, protocol);
      if (mode === "memory") {
        sockets.create = () =>
          inMemorySocket((peer, local) => {
            peer.destroy();
            local.destroy(new Error("private-connect-marker"));
          });
      } else {
        // Use a released loopback port to exercise a refused TCP connect.
        const server = createServer();
        const listening = once(server, "listening");
        server.listen(0, proxy.host);
        await listening;
        proxy.port = (server.address() as AddressInfo).port;
        await new Promise<void>((resolve) => {
          server.close(() => resolve());
        });
      }
      await expectFailure(dialOutboundProxy({ ...proxy, credentials }, target, context.signal), "connect-failed", "private-connect-marker");
    });
  }
});

test("maps pre-aborted and deadline signals before opening a socket", async () => {
  sockets.create = () => {
    throw new Error("No socket expected");
  };
  const proxy: Proxy = { protocol: "socks5", host: "127.0.0.1", port: 3128 };
  await expectFailure(dialOutboundProxy(proxy, target, AbortSignal.abort(new Error("private-abort-marker"))), "cancelled", "private-abort-marker");
  await expectFailure(dialOutboundProxy(proxy, target, AbortSignal.abort(new DOMException("private-abort-marker", "TimeoutError"))), "timeout", "private-abort-marker");
});

test("cancels SOCKS5 between the success reply and deferred socket handoff", async (context) => {
  const controller = new AbortController();
  const { proxy, peer } = await fixture(context, "memory", "socks5");
  const create = sockets.create!;
  sockets.create = () => {
    const socket = create();
    // The client pauses as it accepts the final reply, before replaying any excess data.
    socket.once("pause", () => controller.abort());
    return socket;
  };
  const dial = dialOutboundProxy(proxy, target, AbortSignal.any([context.signal, controller.signal]));
  const result = expectFailure(dial, "cancelled");
  const server = await peer;
  await socksRequest(server, false);
  const closed = whenClosed(server);
  server.write(Buffer.concat([accepted, banner]));
  await result;
  await closed;
});
