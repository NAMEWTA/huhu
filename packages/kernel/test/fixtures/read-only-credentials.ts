import { once } from "node:events";
import path from "node:path";
import { Vault } from "@huhu/vault";
import { owner, TestProtection } from "./credentials.js";

const [base] = process.argv.slice(2);
if (!base || !process.send) throw new Error("Missing read-only fixture arguments");
const vault = await Vault.open(path.join(base, "vault"), { readOnly: true });
const backend = new TestProtection(path.join(base, "backend"));
const read = backend.read.bind(backend);
let reads = 0;
backend.read = async (id) => {
  if (++reads === 1) {
    const resume = once(process, "message");
    process.send!("reading");
    await resume;
  }
  return read(id);
};
let invoked = false;
let code: string | undefined;
try {
  await owner(vault, base, undefined, undefined, backend).use("host", ["password", "passphrase"], async () => {
    invoked = true;
  });
} catch (error) {
  code = (error as { code?: string }).code;
} finally {
  await vault.close();
}
process.send({ code, reads, invoked });
process.disconnect();
