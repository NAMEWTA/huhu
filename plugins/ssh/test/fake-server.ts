import net from "node:net";
import { createHash } from "node:crypto";
import ssh2, { type Connection, type ServerChannel, type Session } from "ssh2";

// 默认导入：Playwright 的 Node ESM 加载器拿不到 CJS 的具名导出
const { Server, utils } = ssh2;

/** 假服务器上的内存文件系统（SFTP 用）。 */
export interface FakeFs {
  files: Map<string, Buffer>;
  dirs: Set<string>;
  links: Map<string, string>;
  permissions: Map<string, number>;
  timestamps: Map<string, number>;
  owners: Map<string, { uid: number; gid: number }>;
}

export interface FakeSshOptions {
  /** 不提供 SFTP 子系统（测试“服务器没有开启 SFTP”）。 */
  noSftp?: boolean;
  /** SFTP 写入第 N 个 WRITE 请求后断开连接（测试中途断线清理临时文件）。 */
  dropAfterWrites?: number;
  password?: string;
  publicKey?: string;
  /** 记录收到的认证尝试（用于断言"主机密钥不符时没有发送凭据"）。 */
  onAuth?: (user: string, method: string) => void;
  keyboardResponse?: string;
  keyboardRounds?: readonly { text: string; echo: boolean; answer: string }[][];
  onShellInput?: (text: string) => void;
  onShellClose?: () => void;
  onInteractiveShell?: (channel: ServerChannel) => void;
  holdReadDirectory?: (dir: string) => boolean;
  waitReadDirectory?: (dir: string) => Promise<void> | undefined;
  onWriteFile?: (file: string) => void;
  waitWriteFile?: (file: string) => Promise<void> | undefined;
  failRename?: (from: string, to: string) => boolean;
  waitReadFile?: (file: string) => Promise<void> | undefined;
  dropRenameReply?: (from: string, to: string) => boolean;
  denySetAttributes?: (file: string) => boolean;
  remoteForwarding?: boolean;
  waitRemoteBind?: (port: number) => Promise<void> | undefined;
  denyRemoteStop?: () => boolean;
  denyDirectTcp?: () => boolean;
  onExec?: (command: string) => { stdout?: string; stderr?: string; code?: number } | undefined;
  onInteractiveExec?: (command: string, channel: ServerChannel, session: Session) => boolean;
  onStat?: (path: string) => import("ssh2").Attributes | undefined;
  onExecRequest?: (command: string) => "reject" | "hold" | undefined;
  hostKey?: string;
  /** 关闭旧服务后，在同一回环端口启动新指纹的服务。 */
  port?: number;
}

/** ssh2 生成的 ed25519 私钥约 0.3% 概率无法被自身解析（会让测试偶发失败）：生成后自检，不合格就重试。 */
export function genHostKey(): string {
  for (let i = 0; i < 20; i++) {
    const key = utils.generateKeyPairSync("ed25519").private;
    const parsed = utils.parseKey(key);
    if (!(parsed instanceof Error)) return key;
  }
  throw new Error("无法生成可解析的主机密钥");
}

/** 假 SSH 服务器：密码认证、exec（echo/sleep/exit/出错）、tcpip 转发（供跳板测试）。 */
export async function startFakeSsh(o: FakeSshOptions = {}): Promise<{ port: number; fingerprint: string; close(): Promise<void>; conns: Connection[]; closed(): number; fs: FakeFs }> {
  const publicKey = o.publicKey === undefined ? undefined : utils.parseKey(o.publicKey);
  if (publicKey instanceof Error) throw new Error("测试公钥无法解析");
  const fs: FakeFs = { files: new Map(), dirs: new Set(["/", "/home", "/home/test"]), links: new Map(), permissions: new Map(), timestamps: new Map(), owners: new Map() };
  let writes = 0;
  const conns: Connection[] = [];
  let closed = 0;
  const hostKey = o.hostKey ?? genHostKey();
  const parsedHost = utils.parseKey(hostKey);
  const firstKey = Array.isArray(parsedHost) ? parsedHost[0] : parsedHost;
  if (!firstKey || firstKey instanceof Error) throw new Error("测试主机密钥无法解析");
  const fingerprint = `SHA256:${createHash("sha256").update(firstKey.getPublicSSH()).digest("base64").replace(/=+$/, "")}`;
  const server = new Server({ hostKeys: [hostKey] }, (client) => {
    conns.push(client);
    (client as unknown as { setNoDelay(b: boolean): void }).setNoDelay(true); // 与真实 sshd 一致（OpenSSH 默认 TCP_NODELAY）
    client.on("close", () => {
      closed++;
    });
    client.on("authentication", (ctx) => {
      o.onAuth?.(ctx.username, ctx.method);
      const rounds = o.keyboardRounds ?? (o.keyboardResponse === undefined ? undefined : [[{ text: "Fixture response", echo: false, answer: o.keyboardResponse }]]);
      if (rounds) {
        if (ctx.method !== "keyboard-interactive") return ctx.reject(["keyboard-interactive"]);
        function prompt(index: number) {
          const questions = rounds?.[index];
          if (!questions) return ctx.accept();
          if (ctx.method !== "keyboard-interactive") return ctx.reject();
          ctx.prompt(
            questions.map(({ text, echo }) => ({ prompt: text, echo })),
            (responses) => {
              if (responses.length !== questions.length || questions.some(({ answer }, item) => answer !== responses[item])) return ctx.reject();
              prompt(index + 1);
            },
          );
        }
        prompt(0);
        return;
      }
      if (publicKey !== undefined && ctx.method === "publickey" && ctx.key.algo === publicKey.type && ctx.key.data.equals(publicKey.getPublicSSH())) {
        if (!ctx.signature || (ctx.blob && publicKey.verify(ctx.blob, ctx.signature, ctx.hashAlgo) === true)) return ctx.accept();
      }
      if (publicKey === undefined && ctx.method === "password" && ctx.password === (o.password ?? "pw")) return ctx.accept();
      ctx.reject(publicKey === undefined ? ["password"] : ["publickey"]);
    });
    client.on("error", () => undefined);
    client.on("ready", () => {
      client.on("tcpip", (accept, reject, info) => {
        if (o.denyDirectTcp?.()) return reject();
        const upstream = net.connect(info.destPort, info.destIP, () => {
          const ch = accept();
          ch.pipe(upstream).pipe(ch);
          ch.on("close", () => upstream.destroy());
        });
        upstream.on("error", () => reject());
      });
      if (o.remoteForwarding) {
        const listeners = new Map<number, net.Server>();
        const sockets = new Set<net.Socket>();
        let connected = true;
        client.once("close", () => {
          connected = false;
          for (const socket of sockets) socket.destroy();
          for (const listener of listeners.values()) listener.close();
        });
        client.on("request", (accept, reject, name, info) => {
          if ((name !== "tcpip-forward" && name !== "cancel-tcpip-forward") || info.bindAddr !== "127.0.0.1" || info.bindPort < 1024) return reject?.();
          const port = info.bindPort;
          if (name === "cancel-tcpip-forward") {
            const listener = listeners.get(port);
            if (!listener || o.denyRemoteStop?.()) return reject?.();
            listeners.delete(port);
            listener.close(() => accept?.());
            return;
          }
          if (listeners.has(port)) return reject?.();
          const listener = net.createServer((socket) => {
            sockets.add(socket);
            socket.on("error", () => socket.destroy());
            socket.once("close", () => sockets.delete(socket));
            client.forwardOut("127.0.0.1", port, "127.0.0.1", socket.remotePort ?? 0, (error, channel) => {
              if (error || !channel || socket.destroyed) {
                channel?.destroy();
                socket.destroy();
                return;
              }
              channel.on("error", () => channel.destroy());
              channel.once("close", () => socket.destroy());
              socket.once("close", () => channel.destroy());
              socket.pipe(channel).pipe(socket);
            });
          });
          listeners.set(port, listener);
          listener.once("error", () => {
            listeners.delete(port);
            if (connected) reject?.();
          });
          listener.listen(port, "127.0.0.1", () => {
            if (!connected) {
              listener.close();
              return;
            }
            const wait = o.waitRemoteBind?.(port);
            if (wait)
              void wait.then(
                () => {
                  if (connected) accept?.();
                },
                () => {
                  if (connected) reject?.();
                },
              );
            else accept?.();
          });
        });
      }
      client.on("session", (accept) => {
        const session = accept();
        session.on("pty", (acceptPty) => acceptPty?.());
        session.on("window-change", (acceptWc) => acceptWc?.());
        session.on("shell", (acceptShell) => {
          const ch = acceptShell();
          if (o.onShellClose) ch.once("close", o.onShellClose);
          if (o.onInteractiveShell) return o.onInteractiveShell(ch);
          ch.write("welcome\n");
          ch.on("data", (d: Buffer) => {
            const text = d.toString();
            o.onShellInput?.(text);
            if (text.includes("exit")) {
              ch.exit(0);
              ch.end();
              return;
            }
            ch.write(`ECHO:${text}`);
          });
        });
        session.on("sftp", (acceptSftp, rejectSftp) => {
          if (o.noSftp) return rejectSftp();
          serveSftp(
            acceptSftp(),
            fs,
            (file) => {
              o.onWriteFile?.(file);
              if (o.dropAfterWrites !== undefined && ++writes >= o.dropAfterWrites) {
                client.end();
                return true;
              }
              return false;
            },
            o,
          );
        });
        session.on("exec", (acceptExec, rejectExec, info) => {
          const cmd = info.command;
          const action = o.onExecRequest?.(cmd);
          if (action === "reject") return rejectExec();
          if (action === "hold") return;
          const ch = acceptExec();
          if (o.onInteractiveExec?.(cmd, ch, session)) return;
          const response = o.onExec?.(cmd);
          if (response) {
            if (response.stdout) ch.write(response.stdout);
            if (response.stderr) ch.stderr.write(response.stderr);
            ch.exit(response.code ?? 0);
            ch.end();
          } else if (cmd.startsWith("echo ")) {
            ch.write(cmd.slice(5) + "\n");
            ch.exit(0);
            ch.end();
          } else if (cmd.startsWith("fail")) {
            ch.stderr.write("boom\n");
            ch.exit(3);
            ch.end();
          } else if (cmd.startsWith("sleep")) {
            const t = setTimeout(
              () => {
                ch.exit(0);
                ch.end();
              },
              Number(cmd.split(" ")[1] ?? 1) * 1000,
            );
            ch.on("close", () => clearTimeout(t));
            session.on("signal", (acc) => {
              acc?.();
              ch.exit(130);
              ch.end();
            });
          } else {
            ch.write(`unknown: ${cmd}\n`);
            ch.exit(127);
            ch.end();
          }
        });
      });
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(o.port ?? 0, "127.0.0.1", () => {
      server.removeListener("error", reject);
      resolve();
    });
  });
  const port = (server.address() as net.AddressInfo).port;
  return {
    port,
    fingerprint,
    conns,
    fs,
    closed: () => closed,
    close: () =>
      new Promise<void>((r) => {
        for (const c of conns) c.end();
        server.close(() => r());
      }),
  };
}

const { OPEN_MODE, STATUS_CODE } = utils.sftp;

const norm = (p: string): string => {
  const abs = p === "." || p === "" ? "/home/test" : p.startsWith("/") ? p : `/home/test/${p}`;
  const out: string[] = [];
  for (const seg of abs.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") out.pop();
    else out.push(seg);
  }
  return `/${out.join("/")}`;
};
const parent = (p: string): string => norm(p.split("/").slice(0, -1).join("/") || "/");

/** 极简内存 SFTP 服务端（协议 v3 语义：RENAME 目标已存在则失败，没有 posix-rename 扩展）。 */
function serveSftp(
  sftp: import("ssh2").SFTPWrapper,
  fs: FakeFs,
  onWrite: (file: string) => boolean,
  { holdReadDirectory, waitReadDirectory, waitWriteFile, failRename, waitReadFile, dropRenameReply, denySetAttributes, onStat }: FakeSshOptions,
): void {
  type H = { kind: "file"; path: string; flags: number } | { kind: "dir"; path: string; sent: boolean };
  const handles = new Map<number, H>();
  let next = 1;
  let closed = false;
  sftp.once("close", () => {
    closed = true;
  });
  const newHandle = (h: H): Buffer => {
    const id = next++;
    handles.set(id, h);
    const b = Buffer.alloc(4);
    b.writeUInt32BE(id);
    return b;
  };
  const get = (b: Buffer): H | undefined => handles.get(b.readUInt32BE(0));
  const attrsOf = (p: string) => {
    const isDir = fs.dirs.has(p);
    const f = fs.files.get(p);
    return {
      mode: (isDir ? 0o040000 : fs.links.has(p) ? 0o120000 : 0o100000) | (fs.permissions.get(p) ?? (isDir ? 0o755 : fs.links.has(p) ? 0o777 : 0o644)),
      size: f?.length ?? 0,
      ...(fs.owners.get(p) ?? { uid: 1000, gid: 1000 }),
      atime: 1_700_000_000,
      mtime: fs.timestamps.get(p) ?? 1_700_000_000,
    };
  };
  const exists = (p: string) => fs.dirs.has(p) || fs.files.has(p) || fs.links.has(p);
  const st = (id: number, code: number) => sftp.status(id, code);

  sftp.on("REALPATH", (id, p) => {
    const n = norm(p);
    sftp.name(id, [{ filename: n, longname: n, attrs: attrsOf(n) as never }]);
  });
  const stat = (id: number, p: string) => {
    const n = norm(p);
    const attrs = onStat?.(n);
    if (attrs) return sftp.attrs(id, attrs);
    if (!exists(n)) return st(id, STATUS_CODE.NO_SUCH_FILE);
    sftp.attrs(id, attrsOf(n) as never);
  };
  sftp.on("STAT", stat);
  sftp.on("LSTAT", stat);
  const setAttributes = (id: number, p: string, attrs: import("ssh2").Attributes) => {
    const n = norm(p);
    if (!fs.files.has(n) && !fs.dirs.has(n)) return st(id, STATUS_CODE.NO_SUCH_FILE);
    if (denySetAttributes?.(n)) return st(id, STATUS_CODE.PERMISSION_DENIED);
    if (typeof attrs.mode === "number") fs.permissions.set(n, attrs.mode & 0o7777);
    if (typeof attrs.mtime === "number") fs.timestamps.set(n, attrs.mtime);
    if (typeof attrs.uid === "number" && typeof attrs.gid === "number") fs.owners.set(n, { uid: attrs.uid, gid: attrs.gid });
    st(id, STATUS_CODE.OK);
  };
  sftp.on("SETSTAT", setAttributes);
  sftp.on("FSTAT", (id, h) => {
    const entry = get(h);
    return entry ? stat(id, entry.path) : st(id, STATUS_CODE.FAILURE);
  });
  sftp.on("FSETSTAT", (id, h, attrs) => {
    const entry = get(h);
    return entry ? setAttributes(id, entry.path, attrs) : st(id, STATUS_CODE.FAILURE);
  });
  sftp.on("READLINK", (id, p) => {
    const target = fs.links.get(norm(p));
    if (target === undefined) return st(id, STATUS_CODE.NO_SUCH_FILE);
    sftp.name(id, [{ filename: target, longname: target, attrs: {} as never }]);
  });
  // ssh2's standard wire-order server event puts the link path first.
  sftp.on("SYMLINK", (id, link, target) => {
    const n = norm(link);
    if (exists(n) || !fs.dirs.has(parent(n))) return st(id, STATUS_CODE.FAILURE);
    fs.links.set(n, target);
    st(id, STATUS_CODE.OK);
  });
  sftp.on("OPENDIR", (id, p) => {
    const n = norm(p);
    if (!fs.dirs.has(n)) return st(id, STATUS_CODE.NO_SUCH_FILE);
    sftp.handle(id, newHandle({ kind: "dir", path: n, sent: false }));
  });
  sftp.on("READDIR", (id, h) => {
    const d = get(h);
    if (!d || d.kind !== "dir" || d.sent) return st(id, STATUS_CODE.EOF);
    if (holdReadDirectory?.(d.path)) return;
    d.sent = true;
    const read = () => {
      if (closed) return;
      const prefix = d.path === "/" ? "/" : `${d.path}/`;
      const names = [...fs.dirs, ...fs.files.keys(), ...fs.links.keys()].filter((x) => x !== d.path && x.startsWith(prefix) && !x.slice(prefix.length).includes("/"));
      if (names.length === 0) return st(id, STATUS_CODE.EOF);
      sftp.name(
        id,
        names.map((x) => {
          const f = x.slice(prefix.length);
          return { filename: f, longname: f, attrs: attrsOf(x) as never };
        }),
      );
    };
    const waiting = waitReadDirectory?.(d.path);
    if (waiting)
      void waiting.then(read, () => {
        if (!closed) st(id, STATUS_CODE.FAILURE);
      });
    else read();
  });
  sftp.on("OPEN", (id, p, flags, attrs) => {
    const n = norm(p);
    if (fs.dirs.has(n) && flags === OPEN_MODE.READ) {
      sftp.handle(id, newHandle({ kind: "file", path: n, flags }));
      return;
    }
    if (fs.dirs.has(n) || fs.links.has(n)) return st(id, STATUS_CODE.FAILURE);
    const creating = (flags & OPEN_MODE.CREAT) !== 0;
    if (!fs.files.has(n)) {
      if (!creating) return st(id, STATUS_CODE.NO_SUCH_FILE);
      if (!fs.dirs.has(parent(n))) return st(id, STATUS_CODE.NO_SUCH_FILE);
      fs.files.set(n, Buffer.alloc(0));
      if (typeof attrs.mode === "number") fs.permissions.set(n, attrs.mode & 0o7777);
    } else if (creating && (flags & OPEN_MODE.EXCL) !== 0) return st(id, STATUS_CODE.FAILURE);
    if ((flags & OPEN_MODE.TRUNC) !== 0) fs.files.set(n, Buffer.alloc(0));
    sftp.handle(id, newHandle({ kind: "file", path: n, flags }));
  });
  sftp.on("READ", (id, h, offset, len) => {
    const f = get(h);
    if (!f || f.kind !== "file") return st(id, STATUS_CODE.FAILURE);
    const read = () => {
      if (closed) return;
      const buf = fs.files.get(f.path) ?? Buffer.alloc(0);
      if (offset >= buf.length) return st(id, STATUS_CODE.EOF);
      sftp.data(id, buf.subarray(offset, Math.min(buf.length, offset + len)));
    };
    const waiting = waitReadFile?.(f.path);
    if (waiting)
      void waiting.then(read, () => {
        if (!closed) st(id, STATUS_CODE.FAILURE);
      });
    else read();
  });
  sftp.on("WRITE", (id, h, offset, data) => {
    const f = get(h);
    if (!f || f.kind !== "file") return st(id, STATUS_CODE.FAILURE);
    if (onWrite(f.path)) return; // 模拟中途断线：不再回复
    const write = () => {
      if (closed) return;
      const cur = fs.files.get(f.path) ?? Buffer.alloc(0);
      const out = Buffer.alloc(Math.max(cur.length, offset + data.length));
      cur.copy(out);
      data.copy(out, offset);
      fs.files.set(f.path, out);
      st(id, STATUS_CODE.OK);
    };
    const waiting = waitWriteFile?.(f.path);
    if (waiting)
      void waiting.then(write, () => {
        if (!closed) st(id, STATUS_CODE.FAILURE);
      });
    else write();
  });
  sftp.on("CLOSE", (id, h) => {
    handles.delete(h.readUInt32BE(0));
    st(id, STATUS_CODE.OK);
  });
  sftp.on("REMOVE", (id, p) => {
    const n = norm(p);
    if (!fs.files.delete(n) && !fs.links.delete(n)) return st(id, STATUS_CODE.NO_SUCH_FILE);
    fs.permissions.delete(n);
    fs.timestamps.delete(n);
    fs.owners.delete(n);
    st(id, STATUS_CODE.OK);
  });
  sftp.on("MKDIR", (id, p) => {
    const n = norm(p);
    if (exists(n)) return st(id, STATUS_CODE.FAILURE);
    if (!fs.dirs.has(parent(n))) return st(id, STATUS_CODE.NO_SUCH_FILE);
    fs.dirs.add(n);
    st(id, STATUS_CODE.OK);
  });
  sftp.on("RMDIR", (id, p) => {
    const n = norm(p);
    if (!fs.dirs.has(n)) return st(id, STATUS_CODE.NO_SUCH_FILE);
    if ([...fs.dirs, ...fs.files.keys(), ...fs.links.keys()].some((x) => x !== n && x.startsWith(`${n}/`))) return st(id, STATUS_CODE.FAILURE);
    fs.dirs.delete(n);
    fs.permissions.delete(n);
    fs.timestamps.delete(n);
    fs.owners.delete(n);
    st(id, STATUS_CODE.OK);
  });
  sftp.on("RENAME", (id, from, to) => {
    const a = norm(from);
    const b = norm(to);
    if (failRename?.(a, b)) return st(id, STATUS_CODE.FAILURE);
    if (!exists(a)) return st(id, STATUS_CODE.NO_SUCH_FILE);
    if (exists(b)) return st(id, STATUS_CODE.FAILURE); // SFTP v3：目标已存在则失败
    const f = fs.files.get(a);
    if (f) {
      fs.files.delete(a);
      fs.files.set(b, f);
      const mode = fs.permissions.get(a);
      if (mode !== undefined) fs.permissions.set(b, mode);
      fs.permissions.delete(a);
      const mtime = fs.timestamps.get(a);
      if (mtime !== undefined) fs.timestamps.set(b, mtime);
      fs.timestamps.delete(a);
      const owner = fs.owners.get(a);
      if (owner !== undefined) fs.owners.set(b, owner);
      fs.owners.delete(a);
    } else if (fs.dirs.has(a)) {
      const below = (key: string) => key === a || key.startsWith(`${a}/`);
      const moved = (key: string) => b + key.slice(a.length);
      for (const key of [...fs.dirs].filter(below)) {
        fs.dirs.delete(key);
        fs.dirs.add(moved(key));
      }
      function moveContents<T>(values: Map<string, T>) {
        for (const [key, value] of [...values].filter(([key]) => below(key))) {
          values.delete(key);
          values.set(moved(key), value);
        }
      }
      moveContents(fs.files);
      moveContents(fs.links);
      moveContents(fs.permissions);
      moveContents(fs.timestamps);
      moveContents(fs.owners);
    } else {
      const target = fs.links.get(a);
      if (target !== undefined) {
        fs.links.delete(a);
        fs.links.set(b, target);
      }
    }
    if (dropRenameReply?.(a, b)) {
      sftp.end();
      return;
    }
    st(id, STATUS_CODE.OK);
  });
}
