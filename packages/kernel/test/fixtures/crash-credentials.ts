import assert from "node:assert/strict";
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import path from "node:path";
import { Vault } from "@huhu/vault";
import { definition, owner, TestProtection } from "./credentials.js";

const [base, phase, revision] = process.argv.slice(2);
if (!base || !phase || !revision) throw new Error("Missing crash fixture arguments");
const initialProof = phase.startsWith("initial-proof-");
const vault = await Vault.open(path.join(base, initialProof ? "copy" : "vault"));
const backend = new TestProtection(path.join(base, "backend"));
const credentials = owner(vault, base, initialProof ? "instance-b" : undefined, undefined, backend);
const write = vault.files.write.bind(vault.files);
vault.files.write = async (...args) => {
  if (phase === "stage") process.exit(71);
  const committed = await write(...args);
  if (phase === "publish") process.exit(72);
  return committed;
};
if (phase === "cleanup") backend.beforeRemove = () => process.exit(73);
if (phase === "key-create") backend.afterCreate = () => process.exit(74);
if (initialProof) {
  const writeFile = fs.writeFileSync;
  fs.writeFileSync = (file, bytes, options) => {
    if (typeof file === "string" && path.basename(file) === "initially-unbound.json") {
      if (phase === "initial-proof-before-write") process.exit(75);
      if (phase === "initial-proof-partial-write") {
        writeFile(file, "{", options);
        process.exit(76);
      }
    }
    writeFile(file, bytes, options);
  };
  if (phase === "initial-proof-publish-error") {
    const rename = fs.renameSync;
    fs.renameSync = (from, to) => {
      if (typeof from === "string" && fs.existsSync(path.join(from, "initially-unbound.json"))) {
        throw Object.assign(new Error("Synthetic proof publication failure"), { code: "EBUSY" });
      }
      rename(from, to);
    };
  }
  syncBuiltinESMExports();
}
const saving = credentials.save({
  entityId: "host",
  expectedRevision: phase === "key-create" ? null : revision,
  definition,
  actions: [phase === "cleanup" ? { purpose: "password", action: "clear" } : { purpose: "password", action: "replace", value: "new synthetic credential" }, { purpose: "passphrase", action: "keep" }],
});
if (phase === "initial-proof-publish-error") await assert.rejects(saving, { code: "storage-failed" });
else await saving;
await vault.close();
