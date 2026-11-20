import { expect, test } from "vitest";
import type { HostImportFormat } from "../src/engine/import/input.js";
import { previewHostImport } from "../src/engine/import/preview.js";

const server = "server.example.invalid";
const user = "fixture";
const name = "sample";
const port = 2222;
const fixtures: { format: HostImportFormat; filename: string; content: string; group?: string[] }[] = [
  { format: "openssh", filename: "config", content: 'Host sample\n  HostName server.example.invalid\n  User "fixture" # comment\n  Port 2222\nHost *\n  Port 22\n  ServerAliveInterval 30' },
  {
    format: "putty",
    filename: "sample.reg",
    content: 'Windows Registry Editor Version 5.00\n[HKEY_CURRENT_USER\\Software\\SimonTatham\\PuTTY\\Sessions\\sample]\n"HostName"="fixture@server.example.invalid"\n"Protocol"="ssh"\n"PortNumber"=dword:000008ae',
  },
  { format: "xshell", filename: "sample.xsh", content: "[CONNECTION]\nHost=server.example.invalid\nPort=2222\nProtocol=SSH2\n[CONNECTION:AUTHENTICATION]\nUserName=fixture" },
  { format: "mobaxterm", filename: "sessions.mxtsessions", content: "[Bookmarks_1]\nSubRep=Workspace\\Lab\nsample=#109#0%server.example.invalid%2222%fixture", group: ["Workspace", "Lab"] },
  {
    format: "windterm",
    filename: "user.sessions",
    content: '[{"session.label":"sample","session.group":"Workspace/Lab","session.target":"fixture@server.example.invalid","session.port":2222,"session.protocol":"SSH"}]',
    group: ["Workspace", "Lab"],
  },
  {
    format: "electerm",
    filename: "bookmarks.json",
    content: JSON.stringify({
      bookmarks: [{ id: "bm", title: name, host: server, port: String(port), username: user, type: "ssh" }],
      bookmarkGroups: [
        { id: "parent", title: "Workspace", bookmarkGroupIds: ["child"] },
        { id: "child", title: "Lab", bookmarkIds: ["bm"] },
      ],
    }),
    group: ["Workspace", "Lab"],
  },
  { format: "netcatty", filename: "hosts.csv", content: 'Groups,Label,Hostname/IP,Protocol,Port,Username\n"Workspace/Lab",sample,server.example.invalid,SSH2,2222,fixture', group: ["Workspace", "Lab"] },
  { format: "securecrt", filename: "sample.ini", content: 'S:"Protocol Name"=SSH2\nS:"Hostname"=server.example.invalid\nS:"Username"=fixture\nD:"[SSH2] Port"=000008ae' },
];
test.each(fixtures)("$format 预览映射端点和分组", ({ group, ...source }) => {
  expect(previewHostImport(source)).toMatchObject({
    format: source.format,
    issues: [],
    rows: [
      {
        index: 1,
        state: "ready",
        profile: { name, host: server, port, user, tags: [], jumpHostIds: [], connectTimeoutSec: 20 },
        group: group ?? [],
        issues: [],
        conflicts: [],
      },
    ],
  });
});

test("预览定位导入内和 Vault 中的冲突，保留跳过原因", () => {
  const source = {
    format: "openssh" as const,
    filename: "C:\\fixture\\config",
    content: [
      "Host primary second",
      " HostName server.example.invalid",
      " User fixture",
      " Port 2222",
      "Host other",
      " HostName other.example.invalid",
      " User fixture",
      " Port 65536",
      "Host missing",
      " HostName missing.example.invalid",
    ].join("\n"),
  };
  const result = previewHostImport(source, [{ id: "host-original", name: "PRIMARY", host: server.toUpperCase(), port, user }]);
  expect(result.filename).toBe("config");
  expect(result.rows[0]).toMatchObject({
    state: "conflict",
    conflicts: [
      { kind: "existing", field: "endpoint", hostId: "host-original" },
      { kind: "existing", field: "name", hostId: "host-original" },
    ],
  });
  expect(result.rows[1]).toMatchObject({
    state: "conflict",
    conflicts: [
      { kind: "existing", field: "endpoint", hostId: "host-original" },
      { kind: "batch", field: "endpoint", index: 1 },
    ],
  });
  expect(result.rows[2]).toMatchObject({ state: "skipped", issues: [{ code: "invalid-port", location: { kind: "line", index: 5 } }] });
  expect(result.rows[3]).toMatchObject({ state: "skipped", issues: [{ code: "missing-user" }] });
});

test("命令、条件与凭据以问题提示处理，预览不含原值", () => {
  const ssh = previewHostImport({
    format: "openssh",
    filename: "config",
    content:
      "Host * !routed\n User fixture\nHost laptop\n LocalCommand ignored-fixture-command\n IdentityFile /ignored-key-fixture\nHost routed\n User fixture\n ProxyJump unconfigured-fixture\nMatch all\n User unexpected\nInclude ignored-file-fixture",
  });
  expect(ssh.issues).toMatchObject([
    { code: "unresolved-directive", field: "match" },
    { code: "unresolved-directive", field: "include" },
  ]);
  expect(ssh.rows[0]).toMatchObject({ state: "ready", profile: { user }, issues: [{ code: "command-ignored" }, { code: "credential-reconfigure" }] });
  expect(ssh.rows[1]).toMatchObject({ state: "skipped", issues: [{ code: "unresolved-route" }] });
  expect(JSON.stringify(ssh)).not.toMatch(/ignored-(fixture-command|key-fixture|file-fixture)|unconfigured-fixture|unexpected/);

  const input = 'S:"Protocol Name"=SSH2\nS:"Hostname"=server.example.invalid\nS:"Username"=fixture\nS:"Password V2"=encrypted-fixture-value\nS:"Identity Filename V2"=private-file-fixture';
  const bytes = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(input, "utf16le")]);
  const secure = previewHostImport({ format: "securecrt", filename: "saved.ini", content: bytes });
  expect(secure.rows[0]).toMatchObject({ state: "ready", issues: [{ code: "encrypted-credential" }, { code: "credential-reconfigure" }] });
  expect(JSON.stringify(secure)).not.toMatch(/encrypted-fixture-value|private-file-fixture/);
});

test("辨认不支持的来源变体、非 SSH 记录和编码错误", () => {
  expect(previewHostImport({ format: "xshell", filename: "sessions.xts", content: Uint8Array.of(0x50, 0x4b, 0x03, 0x04) })).toMatchObject({ rows: [], issues: [{ code: "unsupported-variant" }] });
  expect(previewHostImport({ format: "mobaxterm", filename: "sessions.mxtsessions", content: Uint8Array.of(0xff) })).toMatchObject({ rows: [], issues: [{ code: "invalid-encoding" }] });
  expect(previewHostImport({ format: "putty", filename: "terminal", content: "HostName=server.example.invalid\nProtocol=telnet" })).toMatchObject({
    rows: [{ state: "skipped", issues: [{ code: "unsupported-protocol" }] }],
  });
});
