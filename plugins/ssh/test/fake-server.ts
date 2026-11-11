import net from "node:net";
import ssh2, { type Connection } from "ssh2";

// 默认导入：Playwright 的 Node ESM 加载器拿不到 CJS 的具名导出
const { Server, utils } = ssh2;

/** 假服务器上的内存文件系统（SFTP 用）。 */
export interface FakeFs {
  files: Map<string, Buffer>;
  dirs: Set<string>;
  links: Map<string, string>;
}

export interface FakeSshOptions {
  /** 不提供 SFTP 子系统（测试“服务器没有开启 SFTP”）。 */
  noSftp?: boolean;
  /** SFTP 写入第 N 个 WRITE 请求后断开连接（测试中途断线清理临时文件）。 */
  dropAfterWrites?: number;
  password?: string;
  /** 记录收到的认证尝试（用于断言"主机密钥不符时没有发送凭据"）。 */
  onAuth?: (user: string, method: string) => void;
  hostKey?: string;
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
export async function startFakeSsh(o: FakeSshOptions = {}): Promise<{ port: number; close(): Promise<void>; conns: Connection[]; closed(): number; fs: FakeFs }> {
  const fs: FakeFs = { files: new Map(), dirs: new Set(["/", "/home", "/home/test"]), links: new Map() };
  let writes = 0;
  const conns: Connection[] = [];
  let closed = 0;
  const server = new Server({ hostKeys: [o.hostKey ?? genHostKey()] }, (client) => {
    conns.push(client);
    (client as unknown as { setNoDelay(b: boolean): void }).setNoDelay(true); // 与真实 sshd 一致（OpenSSH 默认 TCP_NODELAY）
    client.on("close", () => {
      closed++;
    });
    client.on("authentication", (ctx) => {
      o.onAuth?.(ctx.username, ctx.method);
      if (ctx.method === "password" && ctx.password === (o.password ?? "pw")) return ctx.accept();
      ctx.reject(["password"]);
    });
    client.on("error", () => undefined);
    client.on("ready", () => {
      client.on("tcpip", (accept, reject, info) => {
        const upstream = net.connect(info.destPort, info.destIP, () => {
          const ch = accept();
          ch.pipe(upstream).pipe(ch);
        });
        upstream.on("error", () => reject());
      });
      client.on("session", (accept) => {
        const session = accept();
        session.on("pty", (acceptPty) => acceptPty?.());
        session.on("window-change", (acceptWc) => acceptWc?.());
        session.on("shell", (acceptShell) => {
          const ch = acceptShell();
          ch.write("welcome\n");
          ch.on("data", (d: Buffer) => {
            const text = d.toString();
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
          serveSftp(acceptSftp(), fs, () => {
            if (o.dropAfterWrites !== undefined && ++writes >= o.dropAfterWrites) {
              client.end();
              return true;
            }
            return false;
          });
        });
        session.on("exec", (acceptExec, _rej, info) => {
          const ch = acceptExec();
          const cmd = info.command;
          if (cmd.startsWith("echo ")) {
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
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as net.AddressInfo).port;
  return {
    port,
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
function serveSftp(sftp: import("ssh2").SFTPWrapper, fs: FakeFs, onWrite: () => boolean): void {
  type H = { kind: "file"; path: string; flags: number } | { kind: "dir"; path: string; sent: boolean };
  const handles = new Map<number, H>();
  let next = 1;
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
    return { mode: isDir ? 0o040755 : fs.links.has(p) ? 0o120777 : 0o100644, size: f?.length ?? 0, uid: 1000, gid: 1000, atime: 1_700_000_000, mtime: 1_700_000_000 };
  };
  const exists = (p: string) => fs.dirs.has(p) || fs.files.has(p) || fs.links.has(p);
  const st = (id: number, code: number) => sftp.status(id, code);

  sftp.on("REALPATH", (id, p) => {
    const n = norm(p);
    sftp.name(id, [{ filename: n, longname: n, attrs: attrsOf(n) as never }]);
  });
  const stat = (id: number, p: string) => {
    const n = norm(p);
    if (!exists(n)) return st(id, STATUS_CODE.NO_SUCH_FILE);
    sftp.attrs(id, attrsOf(n) as never);
  };
  sftp.on("STAT", stat);
  sftp.on("LSTAT", stat);
  sftp.on("OPENDIR", (id, p) => {
    const n = norm(p);
    if (!fs.dirs.has(n)) return st(id, STATUS_CODE.NO_SUCH_FILE);
    sftp.handle(id, newHandle({ kind: "dir", path: n, sent: false }));
  });
  sftp.on("READDIR", (id, h) => {
    const d = get(h);
    if (!d || d.kind !== "dir" || d.sent) return st(id, STATUS_CODE.EOF);
    d.sent = true;
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
  });
  sftp.on("OPEN", (id, p, flags) => {
    const n = norm(p);
    if (fs.dirs.has(n)) return st(id, STATUS_CODE.FAILURE);
    const creating = (flags & OPEN_MODE.CREAT) !== 0;
    if (!fs.files.has(n)) {
      if (!creating) return st(id, STATUS_CODE.NO_SUCH_FILE);
      if (!fs.dirs.has(parent(n))) return st(id, STATUS_CODE.NO_SUCH_FILE);
      fs.files.set(n, Buffer.alloc(0));
    } else if (creating && (flags & OPEN_MODE.EXCL) !== 0) return st(id, STATUS_CODE.FAILURE);
    if ((flags & OPEN_MODE.TRUNC) !== 0) fs.files.set(n, Buffer.alloc(0));
    sftp.handle(id, newHandle({ kind: "file", path: n, flags }));
  });
  sftp.on("READ", (id, h, offset, len) => {
    const f = get(h);
    if (!f || f.kind !== "file") return st(id, STATUS_CODE.FAILURE);
    const buf = fs.files.get(f.path) ?? Buffer.alloc(0);
    if (offset >= buf.length) return st(id, STATUS_CODE.EOF);
    sftp.data(id, buf.subarray(offset, Math.min(buf.length, offset + len)));
  });
  sftp.on("WRITE", (id, h, offset, data) => {
    const f = get(h);
    if (!f || f.kind !== "file") return st(id, STATUS_CODE.FAILURE);
    if (onWrite()) return; // 模拟中途断线：不再回复
    const cur = fs.files.get(f.path) ?? Buffer.alloc(0);
    const out = Buffer.alloc(Math.max(cur.length, offset + data.length));
    cur.copy(out);
    data.copy(out, offset);
    fs.files.set(f.path, out);
    st(id, STATUS_CODE.OK);
  });
  sftp.on("CLOSE", (id, h) => {
    handles.delete(h.readUInt32BE(0));
    st(id, STATUS_CODE.OK);
  });
  sftp.on("REMOVE", (id, p) => {
    const n = norm(p);
    if (!fs.files.delete(n) && !fs.links.delete(n)) return st(id, STATUS_CODE.NO_SUCH_FILE);
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
    if ([...fs.dirs, ...fs.files.keys()].some((x) => x !== n && x.startsWith(`${n}/`))) return st(id, STATUS_CODE.FAILURE);
    fs.dirs.delete(n);
    st(id, STATUS_CODE.OK);
  });
  sftp.on("RENAME", (id, from, to) => {
    const a = norm(from);
    const b = norm(to);
    if (!exists(a)) return st(id, STATUS_CODE.NO_SUCH_FILE);
    if (exists(b)) return st(id, STATUS_CODE.FAILURE); // SFTP v3：目标已存在则失败
    const f = fs.files.get(a);
    if (f) {
      fs.files.delete(a);
      fs.files.set(b, f);
    } else if (fs.dirs.has(a)) {
      fs.dirs.delete(a);
      fs.dirs.add(b);
    }
    st(id, STATUS_CODE.OK);
  });
}
