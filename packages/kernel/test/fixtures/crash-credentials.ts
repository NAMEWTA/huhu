import path from "node:path";
import { Vault } from "@huhu/vault";
import { definition, owner, TestProtection } from "./credentials.js";

const [base, phase, revision] = process.argv.slice(2);
if (!base || !phase || !revision) throw new Error("Missing crash fixture arguments");
const vault = await Vault.open(path.join(base, "vault"));
const backend = new TestProtection(path.join(base, "backend"));
const credentials = owner(vault, base, undefined, undefined, backend);
const write = vault.files.write.bind(vault.files);
vault.files.write = async (...args) => {
  if (phase === "stage") process.exit(71);
  const committed = await write(...args);
  if (phase === "publish") process.exit(72);
  return committed;
};
if (phase === "cleanup") backend.beforeRemove = () => process.exit(73);
if (phase === "key-create") backend.afterCreate = () => process.exit(74);
await credentials.save({
  entityId: "host",
  expectedRevision: phase === "key-create" ? null : revision,
  definition,
  actions: [phase === "cleanup" ? { purpose: "password", action: "clear" } : { purpose: "password", action: "replace", value: "new synthetic credential" }, { purpose: "passphrase", action: "keep" }],
});
await vault.close();
