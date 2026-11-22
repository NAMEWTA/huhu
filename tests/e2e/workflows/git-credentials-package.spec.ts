import { expect, test as base } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { CapabilityError, EngineClient } from "../../../packages/workbench/src/engine-client/client.js";
import { openCandidateDesktop, withFixtureCleanup, withFixtureDeadline } from "../helpers/candidate-desktop.js";
import { disposeCandidate } from "../helpers/candidate-package.js";
import { gitFixtureCertificate, openGitAuthFixture } from "../helpers/git-auth-fixture.js";

type AuthSummary = { revision: string | null; state: string };
type GitRemote = Awaited<ReturnType<typeof openGitAuthFixture>>;
type GitFixture = {
  desktop?: Awaited<ReturnType<typeof openCandidateDesktop>>;
  client?: EngineClient;
  first?: GitRemote;
  second?: GitRemote;
  commits: Record<string, string>;
};

const test = base.extend<{ gitFixture: GitFixture }>({
  gitFixture: [
    async ({ browserName }, use, testInfo) => {
      void browserName;
      const fixture: GitFixture = { commits: {} };
      await withFixtureCleanup(
        () => use(fixture),
        [
          [
            "记录脱敏 Git 请求及提交",
            () =>
              withFixtureDeadline(2_000, () =>
                testInfo.attach("git-package-requests", {
                  body: JSON.stringify({
                    commits: fixture.commits,
                    remotes: [fixture.first, fixture.second].map((remote) => remote && { base: remote.base, requests: remote.requests }),
                  }),
                  contentType: "application/json",
                }),
              ),
          ],
          [
            "清除 Versioning 夹具凭据",
            async () => {
              const { client } = fixture;
              if (!client) return;
              const { remote } = await client.call<{ remote: string }>("sync.get", {}, { signal: AbortSignal.timeout(2_000) });
              if (!remote) return;
              const { state, revision } = await client.call<AuthSummary>("sync.auth.get", {}, { signal: AbortSignal.timeout(2_000) });
              if (state === "unconfigured" || !revision) return;
              const cleared = await client.call("sync.auth.configure", { remote, expectedRevision: revision, credential: { action: "clear" } }, { write: true, signal: AbortSignal.timeout(2_000) });
              expect(cleared).toMatchObject({ state: "unconfigured" });
            },
          ],
          ["关闭第二个 Git HTTPS 服务", () => fixture.second?.close()],
          ["关闭第一个 Git HTTPS 服务", () => fixture.first?.close()],
          [
            "关闭候选桌面并清理隔离资料",
            () => {
              const { desktop } = fixture;
              if (desktop) return withFixtureDeadline(70_000, () => desktop.close());
            },
          ],
        ],
      );
    },
    // Keep resource teardown independent of the test body's timeout.
    { timeout: 100_000 },
  ],
});

test.skip(process.env["HUHU_GIT_PACKAGE_ACCEPTANCE"] !== "1", "需要候选 AppImage 和隔离的 Linux Secret Service 会话");
test.use({ trace: "off", screenshot: "off", video: "off" });
test.afterAll(disposeCandidate);

test("P10.2 候选安装包：Safe 锁定及停用后 Git 按远端绑定使用认证", async ({ gitFixture }) => {
  test.setTimeout(120_000);
  const { commits } = gitFixture;
  const desktop = await openCandidateDesktop({ identityAttachment: "git-package-identity", disableProviderDetection: true });
  gitFixture.desktop = desktop;
  const { page, vault, env } = desktop;
  const engine = await desktop.confirmEngine();
  const endpoint = await page.evaluate(() => window.huhuHost.engine());
  expect({ baseUrl: endpoint.baseUrl, vaultId: endpoint.vaultId }).toEqual({ baseUrl: engine.endpoint, vaultId: engine.vaultId });
  const api = new EngineClient(endpoint);
  gitFixture.client = api;

  const gitEnv = { PATH: env["PATH"], HOME: env["HOME"], XDG_CONFIG_HOME: env["XDG_CONFIG_HOME"], LANG: "C", GIT_CONFIG_NOSYSTEM: "1", GIT_TERMINAL_PROMPT: "0" };
  const git = (directory: string, ...args: string[]) => execFileSync("git", ["-C", directory, ...args], { env: gitEnv, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 10_000 });
  const head = (directory: string) => git(directory, "for-each-ref", "--format=%(objectname)", "refs/heads/main").trim();
  const root = path.dirname(vault);
  const firstRoot = path.join(root, "first-remote");
  const secondRoot = path.join(root, "second-remote");
  const firstRepo = path.join(firstRoot, "vault.git");
  const alternateRepo = path.join(firstRoot, "alternate.git");
  const secondRepo = path.join(secondRoot, "vault.git");
  const peer = path.join(root, "peer");
  mkdirSync(firstRoot);
  mkdirSync(secondRoot);
  for (const repo of [firstRepo, alternateRepo, secondRepo]) git(root, "init", "--bare", "--quiet", "--initial-branch=main", "--template=", repo);
  const firstLogin = { username: `git-first-${randomUUID()}`, token: randomUUID() };
  const secondLogin = { username: `git-second-${randomUUID()}`, token: randomUUID() };
  const primary = await openGitAuthFixture(firstRoot, gitEnv, firstLogin);
  gitFixture.first = primary;
  const secondary = await openGitAuthFixture(secondRoot, gitEnv, secondLogin);
  gitFixture.second = secondary;
  const firstTarget = `${primary.base}/vault.git`;
  const secondTarget = `${secondary.base}/vault.git`;

  expect(await api.call("git.init", {}, { write: true })).toMatchObject({ created: true });
  git(vault, "symbolic-ref", "HEAD", "refs/heads/main");
  git(vault, "config", "--local", "http.sslCAInfo", gitFixtureCertificate);
  await page.getByRole("button", { name: "设置" }).first().click();
  await page.getByTestId("settings-nav-versioning").click();
  const panel = page.getByTestId("sync-auth-panel");
  const authState = panel.getByTestId("sync-auth-state");
  const auth = () => api.call<AuthSummary>("sync.auth.get");
  const sync = (mode: "pull" | "push") => api.call("sync.run", { mode }, { write: true, signal: AbortSignal.timeout(30_000) });

  async function selectRemote(remote: string) {
    await page.getByTestId("sync-remote").fill(remote);
    await page.getByTestId("sync-mode-off").click();
    await page.getByTestId("sync-save").click();
    await expect(panel).toContainText(remote);
    expect(await api.call("sync.get")).toMatchObject({ remote, branch: "main", mode: "off" });
  }

  async function saveLogin(login: { username: string; token: string }) {
    await panel.getByLabel("用户名").fill(login.username);
    const token = panel.getByLabel("密码或令牌");
    await token.fill(login.token);
    await panel.getByRole("button", { name: "保存认证" }).click();
    await expect(authState).toHaveText("认证已配置");
    await expect(token).toHaveValue("");
    const summary = await auth();
    expect(summary).toMatchObject({ state: "configured", revision: expect.any(String) });
    return summary;
  }

  function expectAuthenticated(remote: GitRemote, start: number, service: "git-upload-pack" | "git-receive-pack") {
    const requests = remote.requests.slice(start);
    expect(requests).toContainEqual({ path: "/vault.git/info/refs", service, auth: "correct" });
    expect(requests.some(({ auth }) => auth === "other")).toBe(false);
  }

  async function pullPeerNote(phase: string) {
    const note = `${phase}.md`;
    const body = `# ${phase} package Git fixture\n`;
    writeFileSync(path.join(peer, note), body);
    git(peer, "add", "--", note);
    git(peer, "-c", "user.name=Fixture", "-c", "user.email=fixture@localhost", "commit", "--quiet", "-m", phase);
    git(peer, "push", "--quiet", firstRepo, "main");
    const expected = head(firstRepo);
    expect(expected).not.toBe(head(vault));
    const start = primary.requests.length;
    expect(await sync("pull")).toMatchObject({ pulled: true, pushed: false });
    expectAuthenticated(primary, start, "git-upload-pack");
    expect(head(vault)).toBe(expected);
    expect(readFileSync(path.join(vault, note), "utf8")).toBe(body);
    commits[phase] = expected;
  }

  const initial = await test.step("Safe 未设置时保存 Versioning 认证并推送提交", async () => {
    expect(await api.call("safe.status")).toMatchObject({ initialized: false });
    await selectRemote(firstTarget);
    await expect(authState).toHaveText("尚未配置认证");
    const configured = await saveLogin(firstLogin);
    const body = "# Initial package Git fixture\n";
    writeFileSync(path.join(vault, "initial.md"), body);
    const start = primary.requests.length;
    expect(await sync("push")).toMatchObject({ pushed: true, committed: true });
    expectAuthenticated(primary, start, "git-receive-pack");
    expect(git(firstRepo, "show", "main:initial.md")).toBe(body);
    expect(head(firstRepo)).toBe(head(vault));
    commits["initial-push"] = head(firstRepo);
    git(root, "clone", "--quiet", "--branch", "main", firstRepo, peer);
    return configured;
  });

  await test.step("Safe 锁定及停用后通过同一认证各拉取一个新提交", async () => {
    await api.call("safe.setup", { password: randomUUID() }, { write: true });
    await api.call("safe.lock", {}, { write: true });
    expect(await api.call("safe.status")).toMatchObject({ initialized: true, locked: true });
    await pullPeerNote("safe-locked");
    expect(await api.call("safe.status")).toMatchObject({ initialized: true, locked: true });
    expect(await api.call("plugins.setEnabled", { id: "safe", enabled: false }, { write: true })).toMatchObject({ state: "disabled" });
    await pullPeerNote("safe-disabled");
    expect(await auth()).toEqual(initial);
  });

  await test.step("切换仓库或端口时要求重新配置且不发出请求", async () => {
    const before = [primary.requests.length, secondary.requests.length];
    for (const target of [`${primary.base}/alternate.git`, secondTarget]) {
      await selectRemote(target);
      await expect(authState).toHaveText("请在此重新配置该 Git 远端的认证");
      expect(await auth()).toEqual({ revision: initial.revision, state: "needs-reconfiguration" });
      const rejected = sync("pull");
      await expect(rejected).rejects.toBeInstanceOf(CapabilityError);
      await expect(rejected).rejects.toMatchObject({ code: "GIT_AUTH_FAILED", details: { reason: "needs-reconfiguration" } });
      expect([primary.requests.length, secondary.requests.length]).toEqual(before);
    }
    expect(head(alternateRepo)).toBe("");
    expect(head(secondRepo)).toBe("");
    expect(head(vault)).toBe(commits["safe-disabled"]);
  });

  await test.step("为新端口单独配置认证，清除后只收到未认证请求", async () => {
    const configured = await saveLogin(secondLogin);
    expect(configured.revision).not.toBe(initial.revision);
    const body = "# Second remote package Git fixture\n";
    writeFileSync(path.join(vault, "second-target.md"), body);
    const start = secondary.requests.length;
    expect(await sync("push")).toMatchObject({ pushed: true, committed: true });
    expectAuthenticated(secondary, start, "git-receive-pack");
    expect(git(secondRepo, "show", "main:second-target.md")).toBe(body);
    expect(head(secondRepo)).toBe(head(vault));
    commits["second-push"] = head(secondRepo);
    expect(head(firstRepo)).toBe(commits["safe-disabled"]);

    await panel.getByRole("button", { name: "清除认证" }).click();
    await expect(authState).toHaveText("尚未配置认证");
    expect(await auth()).toMatchObject({ state: "unconfigured" });
    const afterClear = secondary.requests.length;
    await expect(sync("pull")).rejects.toMatchObject({ code: "GIT_AUTH_FAILED" });
    const requests = secondary.requests.slice(afterClear);
    expect(requests).toContainEqual({ path: "/vault.git/info/refs", service: "git-upload-pack", auth: "none" });
    expect(requests.every(({ auth }) => auth === "none")).toBe(true);
    expect(head(vault)).toBe(commits["second-push"]);
    expect(head(secondRepo)).toBe(commits["second-push"]);
  });

  await desktop.confirmEngine();
});
