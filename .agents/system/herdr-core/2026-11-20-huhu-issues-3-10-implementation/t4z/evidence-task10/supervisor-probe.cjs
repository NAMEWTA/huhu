const { app } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = __dirname;
const profile = path.join(root, "profile");
const fakeVault = path.join(root, "vault");
app.setPath("userData", profile);
process.env.HUHU_DESKTOP_USER_DATA = path.join(root, "inherited-wrong");
const resultFile = path.join(root, "result.json");

app.whenReady().then(async () => {
  const { EngineSupervisor } = await import(pathToFileURL(path.join(root, "supervisor.mjs")).href);
  const childEntry = path.join(root, "utility.cjs");
  const supervisor = new EngineSupervisor(fakeVault, { create: false, readOnly: true }, () => {}, childEntry);
  let result;
  try {
    supervisor.start();
    const state = await Promise.race([supervisor.whenStarted(), new Promise((_, reject) => {
      const clock = setTimeout(() => reject(new Error("utility readiness timeout")), 8000);
      clock.unref();
    })]);
    const observation = JSON.parse(fs.readFileSync(path.join(profile, "child-observation.json"), "utf8"));
    result = {
      electron: process.versions.electron,
      node: observation.node,
      mainPid: process.pid, utilityPid: observation.pid,
      ready: state.ok === true, realUserData: app.getPath("userData") === profile,
      userDataForwarded: observation.userData === profile, inheritedOverride: observation.userData !== process.env.HUHU_DESKTOP_USER_DATA,
      exactVault: observation.argv[1] === fakeVault,
      readOnly: JSON.stringify(observation.argv.filter((arg) => arg.startsWith("--"))) === JSON.stringify(["--vault", "--read-only"]),
    };
  } finally {
    await supervisor.stop(4000);
  }
  fs.writeFileSync(resultFile, JSON.stringify(result, null, 2));
  const ok = result.mainPid !== result.utilityPid && [result.ready, result.realUserData, result.userDataForwarded, result.inheritedOverride, result.exactVault, result.readOnly].every(Boolean);
  app.exit(ok ? 0 : 1);
}).catch((error) => {
  fs.writeFileSync(resultFile, JSON.stringify({ error: error.message }));
  app.exit(1);
});
